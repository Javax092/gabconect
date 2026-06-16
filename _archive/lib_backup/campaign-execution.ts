import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  MessageDirection,
  QueuePriority,
  QueueStatus,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus,
} from "@prisma/client";

import { ApiRouteError } from "@/lib/api";
import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import {
  resolveCampaignAudience,
  type CampaignAudienceFilter,
} from "@/lib/campaign-execution";
import {
  appendCampaignEvent,
  syncCampaignOperationState,
} from "@/lib/campaign-infrastructure";
import {
  getCampaignModeDailyCap,
  getMassCampaignTestLimit,
  getRandomSendDelaySeconds,
} from "@/lib/mass-campaign-config";
import { prisma } from "@/lib/prisma";
import { CampaignMode } from "@/lib/validations/campaign";
import {
  enqueueJob,
  QUEUE_NAMES,
  updateQueueRecord,
  type CampaignOutgoingMessageJobPayload,
} from "@/lib/queue";
import { redactPhone } from "@/lib/security";
import { runSendGate } from "@/lib/send-gate";
import { recordSendAttempt } from "@/lib/send-attempts";
import { WhatsAppApiError, logWhatsAppEvent } from "@/lib/whatsapp";
import {
  createCampaignRecipients,
  markCampaignCompletedIfFinished,
  sendWhatsAppTemplateMessage,
  shouldPauseCampaignAfterFailure,
  syncCampaignCounters,
} from "@/lib/whatsapp-campaigns";

const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;

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

export function getMonthDayKey(date = new Date()) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * FIX: dry-run agora é seguro (default FALSE)
 */
export function isWhatsAppDryRunEnabled() {
  return process.env.WHATSAPP_DRY_RUN?.trim().toLowerCase() === "true";
}

export function isWithinBusinessHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

export function assertBusinessHours(date = new Date()) {
  if (!isWithinBusinessHours(date)) {
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

export function personalizeCampaignText(
  templateBody: string,
  contactName: string,
) {
  return templateBody
    .replace(/\{\{\s*name\s*\}\}/gi, contactName)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstNameOf(contactName));
}

/* =========================
   AUDIENCE
========================= */

export function resolveAudienceFilterByMode(input: {
  mode: CampaignMode;
  selectedContactIds?: string[];
  birthdayMonthDay?: string | null;
  tags?: string[];
  groups?: string[];
  priorities?: string[];
  locations?: string[];
  interests?: string[];
  contactTypes?: string[];
}): Required<CampaignAudienceFilter> {
  const safeSelected = input.selectedContactIds ?? [];

  if (input.mode === "TEST") {
    return {
      birthdayMonthDay: null,
      tags: [],
      groups: [],
      priorities: [],
      locations: [],
      interests: [],
      contactTypes: [],
      selectedContactIds: safeSelected,
    };
  }

  if (input.mode === "BIRTHDAY") {
    return {
      birthdayMonthDay: input.birthdayMonthDay ?? null,
      tags: [],
      groups: [],
      priorities: [],
      locations: [],
      interests: [],
      contactTypes: [],
      selectedContactIds: [],
    };
  }

  if (input.mode === "AUDIENCE") {
    return {
      birthdayMonthDay: null,
      tags: input.tags ?? [],
      groups: input.groups ?? [],
      priorities: input.priorities ?? [],
      locations: input.locations ?? [],
      interests: input.interests ?? [],
      contactTypes: input.contactTypes ?? [],
      selectedContactIds: [],
    };
  }

  throw new Error(`Unknown campaign mode: ${input.mode}`);
}

/* =========================
   QUEUE CAMPAIGN
========================= */

export async function queueCampaignRecipients(input: {
  mandateId: string;
  campaignId: string;
  recommendedDailyLimit?: number;
  recommendedDelaySeconds?: number;
}) {
  assertBusinessHours();

  const testLimit = getMassCampaignTestLimit();

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: input.campaignId },
    include: { template: true, audienceConfig: true },
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
    return { recipientSummary, queuedCount: 0, safeDailyLimit };
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

  for (const recipient of recipients) {
    if (
      !skipValidation &&
      (!recipient.contact.optIn ||
        recipient.contact.status !== ContactStatus.ACTIVE)
    ) {
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

    const personalizedText = personalizeCampaignText(
      campaign.template.body,
      recipient.contact.name,
    );

    const baseDelay = input.recommendedDelaySeconds ?? campaign.delaySeconds;

    const randomDelay = getRandomSendDelaySeconds();

    accumulatedDelaySeconds += Math.max(baseDelay, randomDelay);

    const scheduledFor = new Date(Date.now() + accumulatedDelaySeconds * 1000);

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.QUEUED,
        queuedAt: new Date(),
        messagePreview: personalizedText,
      },
    });

    const queueResult = await enqueueJob(QUEUE_NAMES.outgoing, {
      mandateId: input.mandateId,
      direction: MessageDirection.OUTBOUND,
      priority: QueuePriority.NORMAL,
      scheduledFor,
      payload: {
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
        scheduledFor: scheduledFor.toISOString(),
      } satisfies CampaignOutgoingMessageJobPayload,
    });

    await recordSendAttempt({
      mandateId: input.mandateId,
      campaignId: campaign.id,
      campaignRecipientId: recipient.id,
      contactId: recipient.contact.id,
      phone: recipient.contact.phone,
      template: campaign.template.metaTemplateName,
      status: "QUEUED",
      reason: "Queued",
      queueRecordId: queueResult.queueRecordId,
    });

    queuedCount++;
  }

  await syncCampaignCounters(campaign.id);
  await syncCampaignOperationState(campaign.id);

  return { recipientSummary, queuedCount, safeDailyLimit };
}

/* =========================
   WORKER
========================= */

export async function processCampaignOutgoingJob(
  payload: CampaignOutgoingMessageJobPayload,
) {
  await updateQueueRecord(payload.queueRecordId, QueueStatus.PROCESSING);

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: payload.campaignRecipientId },
    include: { campaign: true, contact: true },
  });

  if (!recipient) throw new Error("Recipient not found");

  if (recipient.campaign.status !== CampaignStatus.RUNNING) {
    await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);
    return;
  }

  try {
    const gate = await runSendGate({
      ...payload,
      kind: "CAMPAIGN",
      dryRun: isWhatsAppDryRunEnabled(),
    });

    if (!gate.allowed) {
      await updateQueueRecord(payload.queueRecordId, QueueStatus.CANCELLED);
      return;
    }

    if (isWhatsAppDryRunEnabled()) {
      await prisma.campaignRecipient.update({
        where: { id: payload.campaignRecipientId },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: new Date(),
        },
      });

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

    await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await prisma.campaignRecipient.update({
      where: { id: payload.campaignRecipientId },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: message,
      },
    });

    await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED);
  }
}

/* =========================
   PREVIEW
========================= */

export async function getCampaignAudiencePreview(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
}) {
  return resolveCampaignAudience(input);
}
