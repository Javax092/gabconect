import {
  CampaignRecipientStatus,
  MessageDirection,
  QueueStatus,
  type Prisma
} from "@prisma/client";

import { getCampaignAudiencePreview } from "@/lib/campaign-execution";
import { prisma } from "@/lib/prisma";

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getCampaignIdFromQueueMetadata(metadata: Prisma.JsonValue | null | undefined) {
  const record = asRecord(metadata);
  return typeof record.campaignId === "string" ? record.campaignId : null;
}

function toAudienceFilter(campaign: {
  segmentTags: string[];
  audienceConfig: {
    birthdayMonthDay: string | null;
    tags: string[];
    groups: string[];
    priorities: string[];
    locations: string[];
    interests: string[];
    contactTypes: string[];
    selectedContactIds: string[];
  } | null;
}) {
  return {
    birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
    tags: campaign.audienceConfig?.tags ?? campaign.segmentTags,
    groups: campaign.audienceConfig?.groups ?? [],
    priorities: campaign.audienceConfig?.priorities ?? [],
    locations: campaign.audienceConfig?.locations ?? [],
    interests: campaign.audienceConfig?.interests ?? [],
    contactTypes: campaign.audienceConfig?.contactTypes ?? [],
    selectedContactIds: campaign.audienceConfig?.selectedContactIds ?? []
  };
}

function inferStoppedStage(input: {
  campaignStatus: string;
  eligibleContacts: number;
  recipientTotal: number;
  queuedJobs: number;
  processingJobs: number;
  sentJobs: number;
  failedJobs: number;
  messageLogs: number;
  latestQueueError: string | null;
  workerHeartbeat: { status: string; lastSeenAt: Date; note: string | null } | null;
}) {
  if (input.eligibleContacts === 0) {
    return "AUDIENCE_EMPTY";
  }

  if (input.campaignStatus === "DRAFT" && input.recipientTotal === 0) {
    return "NOT_STARTED";
  }

  if (input.recipientTotal === 0) {
    return "RECIPIENTS_NOT_MATERIALIZED";
  }

  if (input.queuedJobs === 0 && input.processingJobs === 0 && input.sentJobs === 0 && input.failedJobs === 0) {
    return "JOBS_NOT_CREATED";
  }

  if (input.queuedJobs > 0 && input.messageLogs === 0) {
    return input.workerHeartbeat ? "WAITING_WORKER_OR_SCHEDULED_DELAY" : "WORKER_NOT_REPORTING";
  }

  if (input.processingJobs > 0 && input.messageLogs === 0) {
    return "JOB_PROCESSING_WITHOUT_MESSAGE_LOG";
  }

  if (input.failedJobs > 0 && input.sentJobs === 0) {
    return input.latestQueueError ? "QUEUE_FAILED" : "SEND_FAILED";
  }

  if (input.messageLogs > 0) {
    return "MESSAGE_LOGS_CREATED";
  }

  return "UNKNOWN";
}

export async function getCampaignDebugReport(campaignId?: string) {
  const campaign = campaignId
    ? await prisma.campaign.findUnique({
        where: {
          id: campaignId
        },
        include: {
          template: true,
          audienceConfig: true,
          operationState: true
        }
      })
    : await prisma.campaign.findFirst({
        orderBy: {
          createdAt: "desc"
        },
        include: {
          template: true,
          audienceConfig: true,
          operationState: true
        }
      });

  if (!campaign) {
    return {
      found: false,
      stoppedAt: "CAMPAIGN_NOT_FOUND",
      message: campaignId ? "Campanha não encontrada." : "Nenhuma campanha encontrada."
    };
  }

  const audienceFilter = toAudienceFilter(campaign);
  const selectedContactIds = campaign.audienceConfig?.selectedContactIds ?? [];

  const [
    audience,
    recipientRows,
    queueRecords,
    latestMessageLogs,
    latestSendAttempts,
    workerHeartbeat,
    latestEvents
  ] = await Promise.all([
    getCampaignAudiencePreview({
      mandateId: campaign.mandateId,
      campaignId: campaign.id,
      templateBody: campaign.template.body,
      audienceFilter,
      selectedContactIds,
      selectedOnly: selectedContactIds.length > 0,
      showOnlyEligible: false
    }),
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: {
        campaignId: campaign.id
      },
      _count: {
        _all: true
      }
    }),
    prisma.messageQueue.findMany({
      where: {
        mandateId: campaign.mandateId,
        direction: MessageDirection.OUTBOUND
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 1000
    }),
    prisma.whatsAppMessageLog.findMany({
      where: {
        campaignId: campaign.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      select: {
        id: true,
        status: true,
        providerMessageId: true,
        phone: true,
        errorMessage: true,
        sentAt: true,
        failedAt: true,
        createdAt: true
      }
    }),
    prisma.sendAttempt.findMany({
      where: {
        campaignId: campaign.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      select: {
        id: true,
        status: true,
        reason: true,
        providerMessageId: true,
        queueRecordId: true,
        retryCount: true,
        createdAt: true
      }
    }),
    prisma.workerHeartbeat.findUnique({
      where: {
        workerName: "outgoing"
      },
      select: {
        status: true,
        note: true,
        lastSeenAt: true
      }
    }),
    prisma.campaignEventLog.findMany({
      where: {
        campaignId: campaign.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      select: {
        eventType: true,
        level: true,
        title: true,
        message: true,
        createdAt: true
      }
    })
  ]);

  const campaignQueueRecords = queueRecords.filter(
    (record) => getCampaignIdFromQueueMetadata(record.metadata) === campaign.id
  );
  const queueCounts = {
    total: campaignQueueRecords.length,
    queued: campaignQueueRecords.filter((record) => record.status === QueueStatus.QUEUED).length,
    processing: campaignQueueRecords.filter((record) => record.status === QueueStatus.PROCESSING).length,
    sent: campaignQueueRecords.filter((record) => record.status === QueueStatus.SENT).length,
    failed: campaignQueueRecords.filter((record) => record.status === QueueStatus.FAILED).length,
    cancelled: campaignQueueRecords.filter((record) => record.status === QueueStatus.CANCELLED).length,
    simulatedSent: campaignQueueRecords.filter((record) => record.status === QueueStatus.SIMULATED_SENT).length
  };
  const recipientCounts = {
    total: 0,
    pending: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    cancelled: 0
  };

  for (const row of recipientRows) {
    recipientCounts.total += row._count._all;
    if (row.status === CampaignRecipientStatus.PENDING) recipientCounts.pending = row._count._all;
    if (row.status === CampaignRecipientStatus.QUEUED) recipientCounts.queued = row._count._all;
    if (row.status === CampaignRecipientStatus.SENT) recipientCounts.sent = row._count._all;
    if (row.status === CampaignRecipientStatus.FAILED) recipientCounts.failed = row._count._all;
    if (row.status === CampaignRecipientStatus.SKIPPED) recipientCounts.skipped = row._count._all;
    if (row.status === CampaignRecipientStatus.UNSUBSCRIBED) recipientCounts.unsubscribed = row._count._all;
    if (row.status === CampaignRecipientStatus.CANCELLED) recipientCounts.cancelled = row._count._all;
  }

  const latestFailedQueue = campaignQueueRecords.find((record) => record.status === QueueStatus.FAILED);
  const stoppedAt = inferStoppedStage({
    campaignStatus: campaign.status,
    eligibleContacts: audience.totalElegiveis,
    recipientTotal: recipientCounts.total,
    queuedJobs: queueCounts.queued,
    processingJobs: queueCounts.processing,
    sentJobs: queueCounts.sent + queueCounts.simulatedSent,
    failedJobs: queueCounts.failed,
    messageLogs: latestMessageLogs.length,
    latestQueueError: latestFailedQueue?.error ?? null,
    workerHeartbeat
  });

  return {
    found: true,
    stoppedAt,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      mode: campaign.campaignMode,
      dailyLimit: campaign.dailyLimit,
      delaySeconds: campaign.delaySeconds,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      template: {
        id: campaign.template.id,
        name: campaign.template.name,
        metaTemplateName: campaign.template.metaTemplateName,
        language: campaign.template.language,
        status: campaign.template.status
      },
      operationState: campaign.operationState
    },
    audience: {
      eligibleContacts: audience.totalElegiveis,
      foundContacts: audience.totalEncontrados,
      matchedContacts: audience.totalMatched,
      blockedBy: audience.blockedBy
    },
    recipients: recipientCounts,
    jobs: {
      ...queueCounts,
      latest: campaignQueueRecords.slice(0, 10).map((record) => ({
        id: record.id,
        status: record.status,
        scheduledFor: record.scheduledFor,
        processedAt: record.processedAt,
        failedAt: record.failedAt,
        error: record.error,
        retryCount: record.retryCount,
        createdAt: record.createdAt
      }))
    },
    worker: workerHeartbeat,
    messageLogs: latestMessageLogs,
    sendAttempts: latestSendAttempts,
    events: latestEvents
  };
}
