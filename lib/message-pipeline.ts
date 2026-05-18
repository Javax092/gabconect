import {
  AIActionType,
  ComplianceStatus,
  ConversationStatus,
  MessageDirection,
  MessageSource,
  Prisma,
  QueuePriority,
  QueueStatus
} from "@prisma/client";

import { processCitizenMessage } from "@/lib/ai";
import { ensureDefaultCategoriesForMandate } from "@/lib/categories";
import { canSendMessage, validateConversationWindow } from "@/lib/compliance";
import { createOrUpdateDemandFromAIResult } from "@/lib/demands";
import { humanizeResponseTiming, normalizeAssistantReply } from "@/lib/humanizer";
import { prisma } from "@/lib/prisma";
import {
  enqueueJob,
  QUEUE_NAMES,
  type HumanEscalationJobPayload,
  type IncomingMessageJobPayload,
  type OutgoingMessageJobPayload,
  updateQueueRecord
} from "@/lib/queue";
import { chooseBestAction } from "@/lib/router";
import { logWhatsAppEvent, sendWhatsAppMessage } from "@/lib/whatsapp";

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function toJson(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

function buildCitizenFallbackName(phone: string) {
  return `Contato ${phone.slice(-4) || "WhatsApp"}`;
}

async function findMandateByIncomingNumber(displayPhoneNumber: string | null) {
  const mandates = await prisma.mandate.findMany();
  const normalizedDisplayPhone = displayPhoneNumber ? normalizePhone(displayPhoneNumber) : null;

  return (
    mandates.find(
      (item) =>
        normalizedDisplayPhone &&
        normalizePhone(item.whatsappNumber).endsWith(normalizedDisplayPhone)
    ) ?? mandates[0] ?? null
  );
}

async function registerAIAction(input: {
  mandateId: string;
  conversationId: string;
  messageId?: string;
  actionType: AIActionType;
  decision: string;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.aIAction.create({
    data: {
      mandateId: input.mandateId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      actionType: input.actionType,
      decision: input.decision,
      confidence: input.confidence,
      reason: input.reason,
      metadata: toJson(input.metadata)
    }
  });

  await prisma.conversation.update({
    where: {
      id: input.conversationId
    },
    data: {
      lastAIAction: input.actionType
    }
  });
}

async function queueHumanEscalation(input: {
  mandateId: string;
  conversationId: string;
  reason: string;
  userId?: string | null;
}) {
  const result = await enqueueJob(QUEUE_NAMES.human, {
    mandateId: input.mandateId,
    conversationId: input.conversationId,
    direction: MessageDirection.INBOUND,
    priority: QueuePriority.HIGH,
    payload: {
      queueRecordId: "",
      mandateId: input.mandateId,
      conversationId: input.conversationId,
      reason: input.reason,
      userId: input.userId ?? null
    } satisfies HumanEscalationJobPayload
  });

  await prisma.messageQueue.update({
    where: {
      id: result.queueRecordId
    },
    data: {
      metadata: {
        mandateId: input.mandateId,
        conversationId: input.conversationId,
        reason: input.reason,
        userId: input.userId ?? null,
        queueRecordId: result.queueRecordId
      } as Prisma.InputJsonValue
    }
  });

  return result.queueRecordId;
}

async function queueOutboundMessage(input: {
  mandateId: string;
  conversationId: string;
  phone: string;
  text: string;
  source: "AI" | "HUMAN" | "TEMPLATE";
  scheduledFor: Date;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: MessageDirection.OUTBOUND,
      source: input.source,
      content: input.text,
      queuedAt: new Date(),
      complianceStatus: ComplianceStatus.PENDING
    }
  });

  const result = await enqueueJob(QUEUE_NAMES.outgoing, {
    mandateId: input.mandateId,
    conversationId: input.conversationId,
    messageId: message.id,
    direction: MessageDirection.OUTBOUND,
    priority: input.source === "HUMAN" ? QueuePriority.HIGH : QueuePriority.NORMAL,
    scheduledFor: input.scheduledFor,
    payload: {
      queueRecordId: "",
      messageId: message.id,
      conversationId: input.conversationId,
      mandateId: input.mandateId,
      phone: input.phone,
      text: input.text,
      source: input.source,
      scheduledFor: input.scheduledFor.toISOString()
    } satisfies OutgoingMessageJobPayload
  });

  await prisma.messageQueue.update({
    where: {
      id: result.queueRecordId
    },
    data: {
      metadata: {
        queueRecordId: result.queueRecordId,
        messageId: message.id,
        conversationId: input.conversationId,
        mandateId: input.mandateId,
        phone: input.phone,
        source: input.source,
        scheduledFor: input.scheduledFor.toISOString()
      } as Prisma.InputJsonValue
    }
  });

  return {
    queueRecordId: result.queueRecordId,
    messageId: message.id
  };
}

export async function processIncomingMessageJob(payload: IncomingMessageJobPayload) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const mandate = await findMandateByIncomingNumber(payload.message.displayPhoneNumber);

  if (!mandate) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED, {
      failedAt: new Date(),
      error: "Mandato/operação não encontrado."
    });
    return;
  }

  const phone = normalizePhone(payload.message.fromPhone);
  const existingByExternalId = await prisma.message.findUnique({
    where: {
      externalMessageId: payload.message.externalMessageId
    }
  });

  if (existingByExternalId) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT, {
      processedAt: new Date()
    });
    return;
  }

  const citizen = await prisma.citizen.upsert({
    where: {
      mandateId_phone: {
        mandateId: mandate.id,
        phone
      }
    },
    update: {
      name: payload.message.profileName?.trim() || undefined
    },
    create: {
      mandateId: mandate.id,
      phone,
      name: payload.message.profileName?.trim() || buildCitizenFallbackName(phone)
    }
  });

  const categories = await ensureDefaultCategoriesForMandate(mandate.id);
  const latestConversation = await prisma.conversation.findFirst({
    where: {
      mandateId: mandate.id,
      citizenId: citizen.id,
      status: {
        not: ConversationStatus.CLOSED
      }
    },
    orderBy: {
      lastMessageAt: "desc"
    }
  });

  const inboundAt = new Date(payload.message.timestamp);
  const windowState = validateConversationWindow(inboundAt, inboundAt);

  const conversation =
    latestConversation ??
    (await prisma.conversation.create({
      data: {
        mandateId: mandate.id,
        citizenId: citizen.id,
        status: ConversationStatus.OPEN,
        lastMessageAt: inboundAt,
        metaWindowOpen: windowState.metaWindowOpen,
        conversationWindowExpiresAt: windowState.conversationWindowExpiresAt
      }
    }));

  await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      lastMessageAt: inboundAt,
      metaWindowOpen: true,
      conversationWindowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1000),
      currentQueue: QUEUE_NAMES.incoming
    }
  });

  const inboundMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      externalMessageId: payload.message.externalMessageId,
      direction: MessageDirection.INBOUND,
      source: MessageSource.WHATSAPP,
      content: payload.message.text,
      createdAt: inboundAt,
      complianceStatus: ComplianceStatus.APPROVED
    }
  });

  const conversationHistory = await prisma.message.findMany({
    where: {
      conversationId: conversation.id
    },
    select: {
      direction: true,
      content: true,
      createdAt: true
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 20
  });

  if (conversation.aiPaused || conversation.humanTakeoverActive) {
    await registerAIAction({
      mandateId: mandate.id,
      conversationId: conversation.id,
      messageId: inboundMessage.id,
      actionType: AIActionType.ESCALATE,
      decision: "human-takeover-active",
      confidence: 1,
      reason: "IA pausada ou takeover humano ativo."
    });

    await queueHumanEscalation({
      mandateId: mandate.id,
      conversationId: conversation.id,
      reason: "IA pausada ou takeover humano ativo."
    });
    return;
  }

  const aiResult = await processCitizenMessage({
    mandate: {
      name: mandate.name,
      politicianName: mandate.politicianName,
      city: mandate.city,
      state: mandate.state,
      aiPrompt: mandate.aiPrompt,
      categories: categories.map((category) => ({ name: category.name }))
    },
    citizen: {
      name: citizen.name,
      phone: citizen.phone
    },
    conversationHistory,
    message: payload.message.text
  });

  const routing = chooseBestAction({
    message: payload.message.text,
    metaWindowOpen: true,
    recentMessages: conversationHistory
      .filter((item) => item.direction === MessageDirection.OUTBOUND)
      .map((item) => item.content)
  });

  const approvedTemplate =
    routing.action === AIActionType.USE_TEMPLATE
      ? await prisma.messageTemplate.findFirst({
          where: {
            mandateId: mandate.id,
            approved: true
          },
          orderBy: {
            updatedAt: "desc"
          }
        })
      : null;

  const replyText = normalizeAssistantReply(
    routing.action === AIActionType.USE_TEMPLATE && approvedTemplate
      ? approvedTemplate.content
      : aiResult.reply
  );

  const compliance = await canSendMessage({
    mandateId: mandate.id,
    conversationId: conversation.id,
    messageId: inboundMessage.id,
    phone: citizen.phone,
    message: replyText,
    metadata: {
      stage: "incoming-worker",
      queueRecordId: payload.queueRecordId
    }
  });

  let actionType =
    aiResult.action === "ESCALATE_HUMAN"
      ? AIActionType.ESCALATE
      : aiResult.action === "ASK_CONTEXT"
        ? AIActionType.REQUEST_CONTEXT
        : aiResult.action === "IGNORE"
          ? AIActionType.BLOCK
          : aiResult.action === "USE_TEMPLATE"
            ? AIActionType.USE_TEMPLATE
            : routing.action;
  let reason = aiResult.reason;

  if (!compliance.allowed && approvedTemplate) {
    actionType = AIActionType.USE_TEMPLATE;
    reason = "Janela automática bloqueada; template aprovado selecionado.";
  } else if (!compliance.allowed || aiResult.requiresHuman) {
    actionType = AIActionType.ESCALATE;
    reason = aiResult.requiresHuman
      ? "Caso sensível ou dependente de humano."
      : compliance.reason;
  }

  await registerAIAction({
    mandateId: mandate.id,
    conversationId: conversation.id,
    messageId: inboundMessage.id,
    actionType,
    decision: actionType,
    confidence: aiResult.confidence,
    reason,
    metadata: {
      intent: routing.intent,
      sensitive: aiResult.sensitive,
      riskScore: compliance.riskScore,
      riskLevel: aiResult.riskLevel
    }
  });

  await prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data: {
      status: actionType === AIActionType.ESCALATE ? ConversationStatus.HUMAN : ConversationStatus.OPEN,
      humanPriority: actionType === AIActionType.ESCALATE,
      humanTakeoverActive: actionType === AIActionType.ESCALATE,
      aiPaused: actionType === AIActionType.ESCALATE,
      sensitive: routing.sensitive || aiResult.requiresHuman || aiResult.sensitive,
      riskScore: compliance.riskScore,
      spamRisk: compliance.spamRisk,
      currentQueue:
        actionType === AIActionType.ESCALATE ? QUEUE_NAMES.human : QUEUE_NAMES.outgoing,
      operationalScore: Math.max(0, 100 - Math.round(compliance.riskScore))
    }
  });

  if (actionType === AIActionType.ESCALATE) {
    await queueHumanEscalation({
      mandateId: mandate.id,
      conversationId: conversation.id,
      reason
    });
    return;
  }

  const scheduleDelay = humanizeResponseTiming(replyText, [
    routing.intent === "FOLLOW_UP" ? 500 : 0
  ]);
  const scheduledFor = new Date(Date.now() + scheduleDelay);

  await queueOutboundMessage({
    mandateId: mandate.id,
    conversationId: conversation.id,
    phone: citizen.phone,
    text: replyText,
    source: actionType === AIActionType.USE_TEMPLATE ? "TEMPLATE" : "AI",
    scheduledFor
  });

  await createOrUpdateDemandFromAIResult({
    mandateId: mandate.id,
    citizenId: citizen.id,
    conversationId: conversation.id,
    latestCitizenMessage: payload.message.text,
    aiResult
  }).catch(() => null);

  logWhatsAppEvent("info", "incoming_processed", {
    queueRecordId: payload.queueRecordId,
    conversationId: conversation.id,
    actionType
  });
}

export async function processOutgoingMessageJob(payload: OutgoingMessageJobPayload) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const message = await prisma.message.findUnique({
    where: {
      id: payload.messageId
    },
    include: {
      conversation: {
        include: {
          citizen: true
        }
      }
    }
  });

  if (!message) {
    throw new Error("Mensagem de saída não encontrada.");
  }

  const scheduledFor = new Date(payload.scheduledFor);

  if (scheduledFor.getTime() > Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(scheduledFor.getTime() - Date.now(), 3_000)));
  }

  const compliance = await canSendMessage({
    mandateId: payload.mandateId,
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    phone: payload.phone,
    message: payload.text,
    metadata: {
      stage: "outgoing-worker",
      queueRecordId: payload.queueRecordId
    }
  });

  if (!compliance.allowed) {
    await prisma.message.update({
      where: {
        id: payload.messageId
      },
      data: {
        failedAt: new Date(),
        failureReason: compliance.reason,
        retryCount: {
          increment: 1
        },
        complianceStatus:
          compliance.actionTaken === "PACE"
            ? ComplianceStatus.PACED
            : compliance.actionTaken === "ESCALATE"
              ? ComplianceStatus.ESCALATED
              : ComplianceStatus.BLOCKED
      }
    });

    throw new Error(compliance.reason);
  }

  const sentMessage = await sendWhatsAppMessage(payload.phone, payload.text);

  await prisma.message.update({
    where: {
      id: payload.messageId
    },
    data: {
      sentAt: new Date(),
      providerMessageId: sentMessage.providerMessageId ?? undefined,
      retryCount: 0,
      complianceStatus: ComplianceStatus.APPROVED
    }
  });

  await prisma.conversation.update({
    where: {
      id: payload.conversationId
    },
    data: {
      lastMessageAt: new Date(),
      currentQueue: QUEUE_NAMES.incoming
    }
  });
}

export async function processHumanEscalationJob(payload: HumanEscalationJobPayload) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const activeTakeover = await prisma.humanTakeover.findFirst({
    where: {
      conversationId: payload.conversationId,
      active: true
    }
  });

  if (!activeTakeover) {
    await prisma.humanTakeover.create({
      data: {
        mandateId: payload.mandateId,
        conversationId: payload.conversationId,
        userId: payload.userId ?? undefined,
        reason: payload.reason,
        active: true
      }
    });
  }

  await prisma.conversation.update({
    where: {
      id: payload.conversationId
    },
    data: {
      status: ConversationStatus.HUMAN,
      aiPaused: true,
      humanTakeoverActive: true,
      humanPriority: true,
      currentQueue: QUEUE_NAMES.human
    }
  });
}
