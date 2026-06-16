import {
  AIActionType,
  ComplianceStatus,
  ConversationStatus,
  MessageDirection,
  MessageSource,
  QueuePriority,
  QueueStatus,
  Prisma
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { outgoingQueue, humanQueue } from "@/lib/queue/names";
import { enqueueJob } from "@/lib/queue/core";
import { updateQueueRecord } from "@/lib/queue/updateQueueRecord";

import { processCitizenMessage } from "@/lib/ai";
import { ensureDefaultCategoriesForMandate } from "@/lib/categories";
import { canSendMessage } from "@/lib/compliance";
import { chooseBestAction } from "@/lib/router";
import { runSendGate } from "@/lib/send-gate";
import { recordSendAttempt } from "@/lib/send-attempts";
import { sendWhatsAppMessage, WhatsAppApiError } from "@/lib/whatsapp";
import { enqueueJob as enqueueOutgoingJob } from "@/lib/queue/core";
import { processCampaignJob } from "@/lib/campaign-execution";

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export async function processIncomingMessageJob(payload: any) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const mandate = await prisma.mandate.findFirst();
  if (!mandate) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);
    return;
  }

  const phone = normalizePhone(payload.message.fromPhone);

  const citizen = await prisma.citizen.upsert({
    where: {
      mandateId_phone: {
        mandateId: mandate.id,
        phone
      }
    },
    update: {},
    create: {
      mandateId: mandate.id,
      phone,
      name: payload.message.profileName ?? `Contato ${phone.slice(-4)}`
    }
  });

  const conversation = await prisma.conversation.create({
    data: {
      mandateId: mandate.id,
      citizenId: citizen.id,
      status: ConversationStatus.OPEN,
      lastMessageAt: new Date()
    }
  });

  const inboundMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      source: MessageSource.WHATSAPP,
      content: payload.message.text,
      complianceStatus: ComplianceStatus.APPROVED
    }
  });

  const aiResult = await processCitizenMessage({
    mandate,
    citizen,
    conversationHistory: [],
    message: payload.message.text
  });

  const routing = chooseBestAction({
    message: payload.message.text,
    metaWindowOpen: true,
    recentMessages: []
  });

  const replyText = aiResult.reply;

  const compliance = await canSendMessage({
    mandateId: mandate.id,
    conversationId: conversation.id,
    messageId: inboundMessage.id,
    phone,
    message: replyText,
    metadata: { stage: "incoming" }
  });

  let actionType =
    aiResult.requiresHuman
      ? AIActionType.ESCALATE
      : routing.action;

  if (!compliance.allowed) {
    actionType = AIActionType.ESCALATE;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status:
        actionType === AIActionType.ESCALATE
          ? ConversationStatus.HUMAN
          : ConversationStatus.OPEN,
      aiPaused: actionType === AIActionType.ESCALATE
    }
  });

  if (actionType === AIActionType.ESCALATE) {
    await enqueueJob(humanQueue, {
      queueRecordId: payload.queueRecordId,
      mandateId: mandate.id,
      conversationId: conversation.id,
      reason: "Escalation required"
    });
    return;
  }

  const scheduledFor = new Date(Date.now() + 1000);

  const result = await enqueueJob(outgoingQueue, {
    queueRecordId: payload.queueRecordId,
    kind: "CONVERSATION",
    messageId: inboundMessage.id,
    conversationId: conversation.id,
    mandateId: mandate.id,
    phone,
    text: replyText,
    source: "AI",
    scheduledFor: scheduledFor.toISOString()
  });

  await updateQueueRecord(payload.queueRecordId, QueueStatus.QUEUED, {
    queueRecordId: result.queueRecordId
  });
}

type OutgoingPipelinePayload = {
  queueRecordId: string;
  kind: "CONVERSATION" | "CAMPAIGN";
  messageId?: string;
  conversationId?: string;
  mandateId: string;
  phone: string;
  text?: string;
  source?: "AI" | "HUMAN" | "TEMPLATE";
  scheduledFor?: string;
};

export async function processOutgoingMessageJob(payload: OutgoingPipelinePayload) {
  if (payload.kind === "CAMPAIGN") {
    await processCampaignJob(payload as unknown as Parameters<typeof processCampaignJob>[0]);
    return;
  }

  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  try {
    const text = payload.text ?? "";

    if (process.env.WHATSAPP_DRY_RUN === "true") {
      await updateQueueRecord(payload.queueRecordId, QueueStatus.SIMULATED_SENT);
      return;
    }

    await sendWhatsAppMessage(payload.phone, text);
    await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT);
  } catch (error) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED, {
      error: error instanceof Error ? error.message : "Falha no envio outbound."
    });

    if (error instanceof WhatsAppApiError) {
      throw error;
    }

    throw new Error(error instanceof Error ? error.message : "Falha no envio outbound.");
  }
}

export async function processHumanEscalationJob(payload: {
  queueRecordId: string;
  conversationId: string;
  reason?: string;
}) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  await prisma.conversation.update({
    where: {
      id: payload.conversationId
    },
    data: {
      status: ConversationStatus.HUMAN,
      aiPaused: true,
      humanTakeoverActive: true,
      humanPriority: true,
      currentQueue: humanQueue
    }
  });

  await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT);
}
