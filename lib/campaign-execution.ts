import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  MessageDirection,
  QueuePriority,
  QueueStatus,
  WhatsAppTemplateStatus,
} from "@prisma/client";

import { ApiRouteError } from "@/lib/api";
import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import {
  getMonthDayKey,
  materializeCampaignAudience,
  resolveCampaignAudience,
  type CampaignAudienceFilter,
} from "@/lib/campaign-audience";
import { prisma } from "@/lib/prisma";
import { runSendGate } from "@/lib/send-gate";
import { recordSendAttempt } from "@/lib/send-attempts";
import {
  createCampaignRecipients,
  syncCampaignCounters,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsapp-campaigns";
import { syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { enqueueOutgoingJob, getQueueHealth } from "@/lib/queue";
import { updateQueueRecord as updateMessageQueueRecord } from "@/lib/queue/updateQueueRecord";
import { getWhatsAppHealthCheck } from "@/lib/whatsapp";

import {
  getCampaignModeDailyCap,
  getMassCampaignTestLimit,
  getRandomSendDelaySeconds,
} from "@/lib/mass-campaign-config";
import {
  evaluateFirstContactEligibility,
  FIRST_CONTACT_ALLOWED,
  FIRST_CONTACT_SENT,
  CONSENT_PENDING,
  MANUAL_CRM_SOURCE,
} from "@/lib/first-contact";

/* =========================
   CONFIG
========================= */

const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;
const WORKER_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;

/* =========================
   UTILS
========================= */

function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export function isWhatsAppDryRunEnabled() {
  return process.env.WHATSAPP_DRY_RUN?.trim().toLowerCase() === "true";
}

export function isWithinBusinessHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

export function assertBusinessHours() {
  if (!isWithinBusinessHours()) {
    throw new ApiRouteError(
      409,
      `Fora do horário comercial (${BUSINESS_HOURS_START}:00-${BUSINESS_HOURS_END}:00)`,
      "OUTSIDE_BUSINESS_HOURS",
    );
  }
}

function firstNameOf(name: string) {
  return name?.trim()?.split(/\s+/)?.[0] ?? name;
}

function normalizeCampaignPhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function redactCampaignPhone(phone: string) {
  return phone.replace(/\d(?=\d{4})/g, "*");
}

function assertE164WithoutPlus(phone: string) {
  if (!/^\d{10,15}$/.test(phone)) {
    throw new ApiRouteError(
      400,
      "Telefone do destinatário deve estar em E.164 sem '+', exemplo 5592999999999.",
      "INVALID_DESTINATION_PHONE",
      { phone },
    );
  }
}

export async function assertRealCampaignDeliveryReadiness(input: {
  templateName: string;
  templateLanguage: string;
  templateStatus: WhatsAppTemplateStatus;
  templateCategory?: string | null;
  templateBody?: string | null;
}) {
  if (isWhatsAppDryRunEnabled()) {
    throw new ApiRouteError(
      409,
      "WHATSAPP_DRY_RUN=true bloqueia campanha real.",
      "DRY_RUN_ENABLED",
    );
  }

  if (input.templateStatus !== WhatsAppTemplateStatus.APPROVED) {
    throw new ApiRouteError(
      400,
      "Template local não está aprovado.",
      "TEMPLATE_NOT_APPROVED",
    );
  }

  const [queueHealth, heartbeat, whatsAppHealth] = await Promise.all([
    getQueueHealth(),
    prisma.workerHeartbeat.findUnique({
      where: { workerName: "outgoing" },
      select: { status: true, lastSeenAt: true, note: true },
    }),
    getWhatsAppHealthCheck({
      templateName: input.templateName,
      language: input.templateLanguage,
      category: input.templateCategory,
      localBody: input.templateBody,
    }),
  ]);

  if (!whatsAppHealth.ok) {
    throw new ApiRouteError(
      409,
      whatsAppHealth.status === "TEMPLATE_INVALID"
        ? "Template/idioma inválido para o WABA configurado."
        : "WhatsApp Cloud API não está pronta para envio real.",
      whatsAppHealth.status,
      whatsAppHealth,
    );
  }

  if (queueHealth.redis !== "ready" || queueHealth.queues !== "bullmq") {
    throw new ApiRouteError(
      503,
      "Redis/BullMQ indisponível para enfileirar campanha real.",
      "QUEUE_UNAVAILABLE",
      queueHealth,
    );
  }

  const workerOnline =
    heartbeat?.status === "online" &&
    Date.now() - heartbeat.lastSeenAt.getTime() <= WORKER_HEARTBEAT_WINDOW_MS;

  if (!workerOnline) {
    throw new ApiRouteError(
      503,
      "Worker outgoing indisponível ou sem heartbeat recente.",
      "OUTGOING_WORKER_UNAVAILABLE",
      {
        workerName: "outgoing",
        status: heartbeat?.status ?? "missing",
        lastSeenAt: heartbeat?.lastSeenAt?.toISOString() ?? null,
        note: heartbeat?.note ?? null,
      },
    );
  }

  return {
    queueHealth,
    whatsAppHealth,
    worker: {
      status: heartbeat.status,
      lastSeenAt: heartbeat.lastSeenAt.toISOString(),
    },
  };
}

export function personalizeCampaignText(
  templateBody: string,
  contactName: string,
) {
  return templateBody
    .replace(/\{\{\s*name\s*\}\}/gi, contactName)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstNameOf(contactName));
}

/* =========================
   QUEUE CAMPAIGN
========================= */

export async function queueCampaignRecipients(input: {
  mandateId: string;
  campaignId: string;
  recommendedDailyLimit?: number;
  recommendedDelaySeconds?: number;
  bypassBusinessHours?: boolean;
}) {
  if (!input.bypassBusinessHours) {
    assertBusinessHours();
  }

  const testLimit = getMassCampaignTestLimit();

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: input.campaignId },
    include: { template: true, audienceConfig: true },
  });

  console.info("[campaign:start]", {
    campaignId: campaign.id,
    mandateId: input.mandateId,
    mode: campaign.campaignMode,
    templateName: campaign.template.metaTemplateName,
    language: campaign.template.language,
  });

  const recipientSummary = await createCampaignRecipients(
    campaign.id,
    input.mandateId,
    campaign.segmentTags,
    {
      birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
      templateBody: campaign.template.body,
      audienceFilter: {
        birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
        tags: campaign.audienceConfig?.tags ?? [],
        groups: campaign.audienceConfig?.groups ?? [],
        priorities: campaign.audienceConfig?.priorities ?? [],
        locations: campaign.audienceConfig?.locations ?? [],
        interests: campaign.audienceConfig?.interests ?? [],
        contactTypes: campaign.audienceConfig?.contactTypes ?? [],
        selectedContactIds: campaign.audienceConfig?.selectedContactIds ?? [],
      },
      campaignMode: campaign.campaignMode,
    },
  );

  const { start, end } = getDayBounds();

  const dailySentCount = await prisma.campaignRecipient.count({
    where: {
      campaignId: campaign.id,
      status: CampaignRecipientStatus.SENT,
      sentAt: { gte: start, lt: end },
    },
  });

  const safeDailyLimit = Math.min(
    campaign.dailyLimit,
    getCampaignModeDailyCap(campaign.campaignMode),
    input.recommendedDailyLimit ?? campaign.dailyLimit,
    testLimit,
  );

  const remainingCapacity = Math.max(0, safeDailyLimit - dailySentCount);

  if (remainingCapacity <= 0) {
    console.warn("[campaign:enqueue]", {
      campaignId: campaign.id,
      mandateId: input.mandateId,
      eligibleContacts: recipientSummary.eligibleContacts,
      createdRecipients: recipientSummary.createdRecipients,
      queuedCount: 0,
      reason: "DAILY_CAP_REACHED",
      safeDailyLimit,
    });
    return { queuedCount: 0, safeDailyLimit, recipientSummary };
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId: campaign.id,
      status: CampaignRecipientStatus.PENDING,
      queuedAt: null,
    },
    include: { contact: true },
    orderBy: { createdAt: "asc" },
    take: remainingCapacity,
  });

  let queuedCount = 0;
  let accumulatedDelaySeconds = 0;

  const skipValidation = isAudienceValidationBypassed();
  const selectedContactIds = campaign.audienceConfig?.selectedContactIds ?? [];

  for (const recipient of recipients) {
    const firstContact = evaluateFirstContactEligibility({
      campaignMode: campaign.campaignMode,
      selectedContactIds,
      contactId: recipient.contact.id,
      source: recipient.contact.source,
      phone: recipient.contact.phone,
      optIn: recipient.contact.optIn,
      status: recipient.contact.status,
      consentStatus: recipient.contact.consentStatus,
      blockedFromCampaigns: recipient.contact.blockedFromCampaigns,
      firstContactSentAt: recipient.contact.firstContactSentAt,
    });
    if (
      !skipValidation &&
      !firstContact.allowed &&
      (!recipient.contact.optIn || recipient.contact.status !== ContactStatus.ACTIVE)
    ) {
      console.warn("[first-contact:blocked]", {
        campaignId: campaign.id,
        contactId: recipient.contact.id,
        reason: firstContact.reason,
      });
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status:
            recipient.contact.status === ContactStatus.UNSUBSCRIBED
              ? CampaignRecipientStatus.UNSUBSCRIBED
              : CampaignRecipientStatus.SKIPPED,
        },
      });
      continue;
    }

    if (firstContact.allowed) {
      console.info("[first-contact:allowed]", {
        campaignId: campaign.id,
        contactId: recipient.contact.id,
        reason: FIRST_CONTACT_ALLOWED,
      });
    }

    const personalizedText = personalizeCampaignText(
      campaign.template.body,
      recipient.contact.name,
    );

    const baseDelay = input.recommendedDelaySeconds ?? campaign.delaySeconds;
    const randomDelay = getRandomSendDelaySeconds();

    accumulatedDelaySeconds += Math.max(baseDelay, randomDelay);

    const scheduledFor = new Date(Date.now() + accumulatedDelaySeconds * 1000);
    const normalizedPhone = normalizeCampaignPhone(recipient.contact.phone);
    assertE164WithoutPlus(normalizedPhone);

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.QUEUED,
        queuedAt: new Date(),
        messagePreview: personalizedText,
      },
    });

    const queueResult = await enqueueOutgoingJob({
      mandateId: input.mandateId,
      direction: MessageDirection.OUTBOUND,
      priority: QueuePriority.NORMAL,
      scheduledFor,
      requireBullMQ: true,
      payload: {
        kind: "CAMPAIGN",
        mandateId: input.mandateId,
        campaignId: campaign.id,
        campaignRecipientId: recipient.id,
        contactId: recipient.contact.id,
        phone: normalizedPhone,
        contactName: recipient.contact.name,
        templateId: campaign.template.id,
        templateBody: campaign.template.body,
        metaTemplateName: campaign.template.metaTemplateName,
        language: campaign.template.language,
        personalizedText,
        scheduledFor: scheduledFor.toISOString(),
      },
    });

    await recordSendAttempt({
      mandateId: input.mandateId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      contactId: recipient.contact.id,
      phone: normalizedPhone,
      template: campaign.template.metaTemplateName,
      status: "QUEUED",
      reason: "Queued",
      queueRecordId: queueResult.queueRecordId,
    });

    queuedCount++;

    console.info("[campaign:enqueue]", {
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      queueRecordId: queueResult.queueRecordId,
      contactId: recipient.contact.id,
      phone: redactCampaignPhone(normalizedPhone),
      scheduledFor: scheduledFor.toISOString(),
    });
  }

  await syncCampaignCounters(campaign.id);
  await syncCampaignOperationState(campaign.id);

  return { queuedCount, safeDailyLimit, recipientSummary };
}

/* =========================
   WORKER
========================= */

export type CampaignJobPayload = {
  queueRecordId: string;
  mandateId: string;
  campaignId: string;
  campaignRecipientId: string;
  contactId: string;
  phone: string;
  contactName: string;
  templateId: string;
  templateBody: string;
  metaTemplateName: string;
  language: string;
  personalizedText?: string;
  scheduledFor: string;
};

async function updateQueueRecord(queueRecordId: string, status: QueueStatus) {
  await updateMessageQueueRecord(queueRecordId, status);
}

async function markFirstContactSent(input: {
  contactId: string;
  sentAt: Date;
  campaignId: string;
  campaignRecipientId: string;
}) {
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      firstContactSentAt: input.sentAt,
      firstContactStatus: FIRST_CONTACT_SENT,
      consentStatus: CONSENT_PENDING,
      source: MANUAL_CRM_SOURCE,
    },
  });
  console.info("[first-contact:sent]", {
    campaignId: input.campaignId,
    campaignRecipientId: input.campaignRecipientId,
    contactId: input.contactId,
  });
}

export async function processCampaignJob(payload: CampaignJobPayload) {
  console.info("[worker:outgoing:received]", {
    queueRecordId: payload.queueRecordId,
    kind: "CAMPAIGN",
    campaignId: payload.campaignId,
    campaignRecipientId: payload.campaignRecipientId,
    contactId: payload.contactId,
    scheduledFor: payload.scheduledFor,
  });

  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: payload.campaignRecipientId },
    include: {
      campaign: {
        include: {
          audienceConfig: true,
        },
      },
      contact: true,
    },
  });

  if (!recipient) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);
    throw new Error("Recipient not found");
  }

  if (recipient.campaign.status !== CampaignStatus.RUNNING) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);
    return;
  }

  try {
    const firstContact = evaluateFirstContactEligibility({
      campaignMode: recipient.campaign.campaignMode,
      selectedContactIds: recipient.campaign.audienceConfig?.selectedContactIds ?? [],
      contactId: recipient.contact.id,
      source: recipient.contact.source,
      phone: recipient.contact.phone,
      optIn: recipient.contact.optIn,
      status: recipient.contact.status,
      consentStatus: recipient.contact.consentStatus,
      blockedFromCampaigns: recipient.contact.blockedFromCampaigns,
      firstContactSentAt: recipient.contact.firstContactSentAt,
    });

    await prisma.campaignRecipient.update({
      where: { id: payload.campaignRecipientId },
      data: {
        status: CampaignRecipientStatus.PROCESSING,
      },
    });

    const gate = await runSendGate({
      ...payload,
      kind: "CAMPAIGN",
      dryRun: isWhatsAppDryRunEnabled(),
    });

    if (!gate.allowed) {
      await prisma.campaignRecipient.update({
        where: { id: payload.campaignRecipientId },
        data: {
          status: CampaignRecipientStatus.FAILED,
          errorMessage: gate.reason,
        },
      });
      await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);
      return;
    }

    if (isWhatsAppDryRunEnabled()) {
      const sentAt = new Date();
      await prisma.campaignRecipient.update({
        where: { id: payload.campaignRecipientId },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt,
        },
      });

      if (firstContact.allowed) {
        await markFirstContactSent({
          contactId: recipient.contact.id,
          sentAt,
          campaignId: payload.campaignId,
          campaignRecipientId: payload.campaignRecipientId,
        });
      }

      await updateQueueRecord(
        payload.queueRecordId,
        QueueStatus.SIMULATED_SENT,
      );
      return;
    }

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

    if (firstContact.allowed) {
      await markFirstContactSent({
        contactId: recipient.contact.id,
        sentAt: delivery.sentAt,
        campaignId: payload.campaignId,
        campaignRecipientId: payload.campaignRecipientId,
      });
    }

    await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT);
  } catch (err) {
    console.error("[whatsapp:send:failed]", {
      queueRecordId: payload.queueRecordId,
      campaignId: payload.campaignId,
      campaignRecipientId: payload.campaignRecipientId,
      error: err instanceof Error ? err.message : "Unknown error",
    });

    await prisma.campaignRecipient.update({
      where: { id: payload.campaignRecipientId },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });

    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);
    throw err;
  }
}

/* =========================
   PREVIEW
========================= */

export async function getCampaignAudiencePreview(input: {
  mandateId: string;
  campaignId?: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
  showOnlyEligible?: boolean;
  query?: string;
  optInFilter?: "ALL" | "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT";
  contactStatus?: "ALL" | "ACTIVE" | "UNSUBSCRIBED" | "BLOCKED" | "INVALID";
  birthdayFilter?: "ALL" | "WITH_BIRTHDAY" | "TODAY";
  page?: number;
  limit?: number;
  sortBy?: "name" | "code" | "importedAt";
  sortOrder?: "asc" | "desc";
  campaignMode?: string | null;
}) {
  return resolveCampaignAudience(input);
}

/* =========================
   EXPORT ADICIONAL (CORREÇÃO PEDIDA)
========================= */

export { resolveAudienceFilterByMode } from "./mode";
export { getMonthDayKey, materializeCampaignAudience, resolveCampaignAudience };
export type { CampaignAudienceFilter };
