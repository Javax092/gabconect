import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  MessageDirection,
  QueuePriority,
  QueueStatus,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError } from "@/lib/api";
import { resolveCampaignAudience } from "@/lib/campaign-audience";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { prisma } from "@/lib/prisma";
import {
  enqueueJob,
  QUEUE_NAMES,
  updateQueueRecord,
  type CampaignOutgoingMessageJobPayload
} from "@/lib/queue";
import { logWhatsAppEvent } from "@/lib/whatsapp";
import {
  createCampaignRecipients,
  markCampaignCompletedIfFinished,
  sendWhatsAppTemplateMessage,
  shouldPauseCampaignAfterFailure,
  syncCampaignCounters
} from "@/lib/whatsapp-campaigns";

const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;
const LOCAL_EXECUTION_CAP = 3;

function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getMonthDayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function isWhatsAppDryRunEnabled() {
  return process.env.WHATSAPP_DRY_RUN === "true";
}

export function isWithinBusinessHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

export function assertBusinessHours(date = new Date()) {
  if (!isWithinBusinessHours(date)) {
    throw new ApiRouteError(
      409,
      `Campanhas só podem ser enfileiradas em horário comercial (${BUSINESS_HOURS_START}:00-${BUSINESS_HOURS_END}:00).`,
      "OUTSIDE_BUSINESS_HOURS"
    );
  }
}

function resolveExecutionCap() {
  return process.env.NODE_ENV === "production" ? Number.POSITIVE_INFINITY : LOCAL_EXECUTION_CAP;
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

export function personalizeCampaignText(templateBody: string, contactName: string) {
  return templateBody
    .replace(/\{\{\s*name\s*\}\}/gi, contactName)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstNameOf(contactName));
}

export async function queueCampaignRecipients(input: {
  mandateId: string;
  campaignId: string;
  recommendedDailyLimit?: number;
  recommendedDelaySeconds?: number;
}) {
  assertBusinessHours();

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: {
      id: input.campaignId
    },
    include: {
      template: true,
      audienceConfig: true
    }
  });

  const recipientSummary = await createCampaignRecipients(campaign.id, input.mandateId, campaign.segmentTags, {
    birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
    templateBody: campaign.template.body,
    audienceFilter: {
      birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
      tags: campaign.audienceConfig?.tags ?? campaign.segmentTags,
      groups: campaign.audienceConfig?.groups ?? [],
      priorities: campaign.audienceConfig?.priorities ?? [],
      locations: campaign.audienceConfig?.locations ?? [],
      interests: campaign.audienceConfig?.interests ?? [],
      contactTypes: campaign.audienceConfig?.contactTypes ?? [],
      selectedContactIds: campaign.audienceConfig?.selectedContactIds ?? []
    }
  });

  console.info("[campaign-queue] recipients-prepared", {
    campaignId: campaign.id,
    mandateId: input.mandateId,
    selectedContactIds: campaign.audienceConfig?.selectedContactIds.length ?? 0,
    eligibleContacts: recipientSummary.eligibleContacts,
    createdRecipients: recipientSummary.createdRecipients,
    blockedBy: {
      invalidPhone: recipientSummary.totalInvalidos,
      explicitBlock: recipientSummary.totalBloqueados,
      optOut: recipientSummary.totalOptOut,
      missingPhone: recipientSummary.totalSemTelefone,
      missingOptIn: recipientSummary.totalSemOptIn
    }
  });

  const { start, end } = getDayBounds();
  const dailySentCount = await prisma.campaignRecipient.count({
    where: {
      campaignId: campaign.id,
      status: CampaignRecipientStatus.SENT,
      sentAt: {
        gte: start,
        lt: end
      }
    }
  });

  const safeDailyLimit = Math.min(
    campaign.dailyLimit,
    input.recommendedDailyLimit ?? campaign.dailyLimit,
    resolveExecutionCap()
  );
  const remainingCapacity = Math.max(0, safeDailyLimit - dailySentCount);

  if (remainingCapacity === 0) {
    return {
      recipientSummary,
      queuedCount: 0,
      safeDailyLimit
    };
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId: campaign.id,
      status: CampaignRecipientStatus.PENDING,
      queuedAt: null
    },
    include: {
      contact: true
    },
    orderBy: {
      createdAt: "asc"
    },
    take: remainingCapacity
  });

  let queuedCount = 0;

  for (const [index, recipient] of recipients.entries()) {
    if (!recipient.contact.optIn || recipient.contact.status !== ContactStatus.ACTIVE) {
      await prisma.campaignRecipient.update({
        where: {
          id: recipient.id
        },
        data: {
          status:
            recipient.contact.status === ContactStatus.UNSUBSCRIBED
              ? CampaignRecipientStatus.UNSUBSCRIBED
              : CampaignRecipientStatus.SKIPPED,
          errorMessage: "Contato inelegível no momento do enfileiramento."
        }
      });
      continue;
    }

    const personalizedText = personalizeCampaignText(campaign.template.body, recipient.contact.name);
    const scheduledFor = new Date(Date.now() + index * (input.recommendedDelaySeconds ?? campaign.delaySeconds) * 1000);

    await prisma.campaignRecipient.update({
      where: {
        id: recipient.id
      },
      data: {
        queuedAt: new Date(),
        messagePreview: personalizedText,
        errorMessage: null
      }
    });

    const delaySeconds = index * (input.recommendedDelaySeconds ?? campaign.delaySeconds);

    const queueResult = await enqueueJob(QUEUE_NAMES.outgoing, {
      mandateId: input.mandateId,
      direction: MessageDirection.OUTBOUND,
      priority: QueuePriority.NORMAL,
      scheduledFor,
      payload: {
        queueRecordId: "",
        kind: "CAMPAIGN",
        mandateId: input.mandateId,
        campaignId: campaign.id,
        campaignRecipientId: recipient.id,
        contactId: recipient.contact.id,
        phone: recipient.contact.phone,
        contactName: recipient.contact.name,
        templateId: campaign.template.id,
        templateBody: campaign.template.body,
        metaTemplateName: campaign.template.metaTemplateName,
        language: campaign.template.language,
        personalizedText,
        scheduledFor: scheduledFor.toISOString()
      } satisfies CampaignOutgoingMessageJobPayload
    });

    await appendCampaignEvent({
      mandateId: input.mandateId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      eventType: "RECIPIENT_QUEUED",
      title: "Destinatario enfileirado",
      message: "Contato elegivel confirmado para a fila operacional.",
      metadata: {
        contactId: recipient.contact.id,
        phone: recipient.contact.phone
      }
    });

    await appendCampaignEvent({
      mandateId: input.mandateId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      eventType: "campaign.job_queued",
      title: "Job enfileirado",
      message: `Delivery inserido na fila de saida (${queueResult.mode}) para processamento pelo worker.`,
      metadata: {
        queueRecordId: queueResult.queueRecordId,
        scheduledFor: scheduledFor.toISOString()
      }
    });

    await appendCampaignEvent({
      mandateId: input.mandateId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      eventType: "campaign.delay_applied",
      title: "Delay humano aplicado",
      message: `Janela de ${delaySeconds}s aplicada antes do envio deste contato.`,
      metadata: {
        delaySeconds,
        scheduledFor: scheduledFor.toISOString()
      }
    });

    logWhatsAppEvent("info", "campaign_queued", {
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      status: "queued",
      dryRun: isWhatsAppDryRunEnabled()
    });
    queuedCount += 1;
  }

  await syncCampaignCounters(campaign.id);
  await syncCampaignOperationState(campaign.id);

  console.info("[campaign-queue] batch-enqueued", {
    campaignId: campaign.id,
    mandateId: input.mandateId,
    queuedCount,
    safeDailyLimit
  });

  return {
    recipientSummary,
    queuedCount,
    safeDailyLimit
  };
}

export async function processCampaignOutgoingJob(payload: CampaignOutgoingMessageJobPayload) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  await appendCampaignEvent({
    mandateId: payload.mandateId,
    campaignId: payload.campaignId,
    campaignRecipientId: payload.campaignRecipientId,
    eventType: "campaign.processing",
    title: "Job em processamento",
    message: "Worker retirou o destinatario da fila e iniciou a tentativa de envio."
  });

  logWhatsAppEvent("info", "campaign_processing", {
    campaignId: payload.campaignId,
    campaignRecipientId: payload.campaignRecipientId,
    status: "processing"
  });

  const recipient = await prisma.campaignRecipient.findUnique({
    where: {
      id: payload.campaignRecipientId
    },
    include: {
      campaign: true,
      contact: true
    }
  });

  if (!recipient) {
    throw new Error("Delivery da campanha não encontrado.");
  }

  if (recipient.campaign.status !== CampaignStatus.RUNNING) {
    throw new Error("A campanha não está em execução.");
  }

  if (!isWithinBusinessHours()) {
    throw new Error("Worker bloqueou envio fora do horário comercial.");
  }

  try {
    if (isWhatsAppDryRunEnabled()) {
      const simulatedAt = new Date();

      await prisma.whatsAppMessageLog.create({
        data: {
          mandateId: payload.mandateId,
          contactId: payload.contactId,
          templateId: payload.templateId,
          campaignId: payload.campaignId,
          campaignRecipientId: payload.campaignRecipientId,
          direction: "OUTBOUND",
          status: WhatsAppMessageLogStatus.SIMULATED_SENT,
          phone: payload.phone,
          payload: {
            simulated: true,
            personalizedText: payload.personalizedText,
            metaTemplateName: payload.metaTemplateName
          },
          sentAt: simulatedAt
        }
      });

      await prisma.campaignRecipient.update({
        where: {
          id: payload.campaignRecipientId
        },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: simulatedAt,
          errorMessage: null
        }
      });

      await updateQueueRecord(payload.queueRecordId, QueueStatus.SIMULATED_SENT, {
        processedAt: simulatedAt
      });

      await appendCampaignEvent({
        mandateId: payload.mandateId,
        campaignId: payload.campaignId,
        campaignRecipientId: payload.campaignRecipientId,
        eventType: "campaign.simulated_sent",
        title: "Envio simulado",
        message: "Worker executou o lote em modo dry-run sem chamar a Meta."
      });
      await syncCampaignCounters(payload.campaignId);
      await syncCampaignOperationState(payload.campaignId);
      await markCampaignCompletedIfFinished(payload.campaignId);

      logWhatsAppEvent("info", "campaign_simulated_sent", {
        campaignId: payload.campaignId,
        campaignRecipientId: payload.campaignRecipientId,
        status: "simulated_sent"
      });
      return;
    }

    const delivery = await sendWhatsAppTemplateMessage({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      contact: {
        id: payload.contactId,
        phone: payload.phone,
        name: payload.contactName
      },
      template: {
        id: payload.templateId,
        metaTemplateName: payload.metaTemplateName,
        language: payload.language,
        body: payload.templateBody,
        status: WhatsAppTemplateStatus.APPROVED
      }
    });

    await prisma.campaignRecipient.update({
      where: {
        id: payload.campaignRecipientId
      },
      data: {
        status: CampaignRecipientStatus.SENT,
        sentAt: delivery.sentAt,
        errorMessage: null
      }
    });

    await appendCampaignEvent({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      eventType: "campaign.sent",
      title: "Envio aceito pela Meta",
      message: "Mensagem de campanha entregue ao sender oficial do WhatsApp."
    });
    await syncCampaignCounters(payload.campaignId);
    await syncCampaignOperationState(payload.campaignId);
    await markCampaignCompletedIfFinished(payload.campaignId);

    logWhatsAppEvent("info", "campaign_sent", {
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      status: "sent",
      providerMessageId: delivery.providerMessageId
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar delivery da campanha.";

    await prisma.campaignRecipient.update({
      where: {
        id: payload.campaignRecipientId
      },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: message
      }
    });

    if (await shouldPauseCampaignAfterFailure(payload.campaignId)) {
      await prisma.campaign.update({
        where: {
          id: payload.campaignId
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
    }

    await appendCampaignEvent({
      mandateId: payload.mandateId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      level: "WARN",
      eventType: "campaign.failed",
      title: "Falha no envio",
      message,
      recommendedAction: "Validar motivo, revisar fila e permitir retry controlado se o risco seguir aceitavel."
    });

    await syncCampaignCounters(payload.campaignId);
    await syncCampaignOperationState(payload.campaignId);

    logWhatsAppEvent("error", "campaign_failed", {
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      status: "failed",
      reason: message
    });
    throw error;
  }
}

export async function getCampaignAudiencePreview(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: {
    birthdayMonthDay?: string | null;
    tags?: string[];
    groups?: string[];
    priorities?: string[];
    locations?: string[];
    interests?: string[];
    contactTypes?: string[];
    selectedContactIds?: string[];
  };
  campaignId?: string;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
  showOnlyEligible?: boolean;
  query?: string;
  optInFilter?: "ALL" | "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT";
  contactStatus?: "ALL" | "ACTIVE" | "UNSUBSCRIBED" | "BLOCKED" | "INVALID";
  birthdayFilter?: "ALL" | "WITH_BIRTHDAY" | "TODAY";
  limit?: number;
  page?: number;
  sortBy?: "name" | "code" | "importedAt";
  sortOrder?: "asc" | "desc";
}) {
  return resolveCampaignAudience(input);
}
