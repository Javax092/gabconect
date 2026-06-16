import {
  CampaignRecipientStatus,
  CampaignStatus,
  QueueStatus,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enqueueJob, QUEUE_NAMES, updateQueueRecord } from "@/lib/queue";
import { runSendGate } from "@/lib/send-gate";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp-campaigns";
import { recordSendAttempt } from "@/lib/send-attempts";
import { appendCampaignEvent } from "@/lib/campaign-infrastructure";
import { syncCampaignCounters } from "@/lib/whatsapp-campaigns";
import { logWhatsAppEvent, WhatsAppApiError } from "@/lib/whatsapp";

/* =========================
   CONFIG
========================= */

export function isWhatsAppDryRunEnabled() {
  return process.env.WHATSAPP_DRY_RUN?.toLowerCase() === "true";
}

/* =========================
   PROCESS JOB
========================= */

export async function processCampaignOutgoingJob(
  payload: any, // mantém flexível pra compatibilidade com queue
) {
  console.info("[campaign-worker] start", {
    campaignId: payload.campaignId,
    recipientId: payload.campaignRecipientId,
    queueRecordId: payload.queueRecordId,
  });

  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: payload.campaignRecipientId },
    include: { campaign: true, contact: true },
  });

  if (!recipient) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);
    throw new Error("Recipient not found");
  }

  /* =========================
     SAFETY CHECK
  ========================= */

  if (recipient.campaign.status !== CampaignStatus.RUNNING) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);

    await recordSendAttempt({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contactId: payload.contactId,
      phone: payload.phone,
      template: payload.metaTemplateName,
      status: "CANCELLED",
      reason: "Campaign not running",
      queueRecordId: payload.queueRecordId,
    });

    return;
  }

  /* =========================
     SEND GATE
  ========================= */

  try {
    const gate = await runSendGate({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contactId: payload.contactId,
      phone: payload.phone,
      templateId: payload.templateId,
      templateName: payload.metaTemplateName,
      queueRecordId: payload.queueRecordId,
      kind: "CAMPAIGN",
      dryRun: isWhatsAppDryRunEnabled(),
    });

    if (!gate.allowed) {
      await prisma.campaignRecipient.update({
        where: { id: payload.campaignRecipientId },
        data: {
          status: CampaignRecipientStatus.SKIPPED,
          errorMessage: gate.reason,
        },
      });

      await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);

      await appendCampaignEvent({
        mandateId: payload.mandateId,
        campaignId: payload.campaignId,
        campaignRecipientId: payload.campaignRecipientId,
        eventType: "SEND_BLOCKED",
        title: "Bloqueado pelo Send Gate",
        message: gate.reason,
      });

      return;
    }

    /* =========================
       DRY RUN (SIMULAÇÃO)
    ========================= */

    if (isWhatsAppDryRunEnabled()) {
      const now = new Date();

      await prisma.campaignRecipient.update({
        where: { id: payload.campaignRecipientId },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: now,
        },
      });

      await prisma.whatsAppMessageLog.create({
        data: {
          mandateId: payload.mandateId,
          contactId: payload.contactId,
          campaignId: payload.campaignId,
          campaignRecipientId: payload.campaignRecipientId,
          templateId: payload.templateId,
          direction: "OUTBOUND",
          status: WhatsAppMessageLogStatus.SIMULATED_SENT,
          phone: payload.phone,
          payload: {
            simulated: true,
            text: payload.personalizedText,
          },
          sentAt: now,
        },
      });

      await updateQueueRecord(
        payload.queueRecordId,
        QueueStatus.SIMULATED_SENT,
      );

      await recordSendAttempt({
        mandateId: payload.mandateId,
        campaignId: payload.campaignId,
        campaignRecipientId: payload.campaignRecipientId,
        contactId: payload.contactId,
        phone: payload.phone,
        template: payload.metaTemplateName,
        status: "SIMULATED",
        reason: "Dry-run enabled",
        queueRecordId: payload.queueRecordId,
      });

      await syncCampaignCounters(payload.campaignId);

      return;
    }

    /* =========================
       REAL SEND (META)
    ========================= */

    const delivery = await sendWhatsAppTemplateMessage({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contact: {
        id: payload.contactId,
        phone: payload.phone,
        name: payload.contactName,
      },
      template: {
        id: payload.templateId,
        metaTemplateName: payload.metaTemplateName,
        language: payload.language,
        body: payload.templateBody,
        status: WhatsAppTemplateStatus.APPROVED,
      },
    });

    await prisma.campaignRecipient.update({
      where: { id: payload.campaignRecipientId },
      data: {
        status: CampaignRecipientStatus.SENT,
        sentAt: delivery.sentAt,
      },
    });

    await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT);

    await recordSendAttempt({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contactId: payload.contactId,
      phone: payload.phone,
      template: payload.metaTemplateName,
      status: "SENT",
      reason: "Delivered to WhatsApp API",
      providerMessageId: delivery.providerMessageId,
      queueRecordId: payload.queueRecordId,
    });

    await appendCampaignEvent({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      eventType: "SENT",
      title: "Mensagem enviada",
      message: "Mensagem entregue à API da Meta",
    });

    await syncCampaignCounters(payload.campaignId);

    logWhatsAppEvent("info", "campaign_sent", {
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      providerMessageId: delivery.providerMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    const retryable =
      error instanceof WhatsAppApiError ? error.retryable : true;

    console.error("[campaign-worker] error", {
      campaignId: payload.campaignId,
      recipientId: payload.campaignRecipientId,
      message,
      retryable,
    });

    await prisma.campaignRecipient.update({
      where: { id: payload.campaignRecipientId },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: message,
      },
    });

    await recordSendAttempt({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contactId: payload.contactId,
      phone: payload.phone,
      template: payload.metaTemplateName,
      status: "ERROR",
      reason: message,
      queueRecordId: payload.queueRecordId,
      metadata: { retryable },
    });

    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);

    throw error;
  }
}
