import {
  CampaignRecipientStatus,
  ContactStatus,
  MessageDirection,
  Prisma,
  QueueStatus,
  WhatsAppMessageLogStatus,
} from "@prisma/client";

import { isWhatsAppDryRunEnabled, personalizeCampaignText } from "@/lib/campaign-execution";
import { prisma } from "@/lib/prisma";

export const CAMPAIGN_OPERATIONS_PAGE_SIZE = 25;

export const CAMPAIGN_OPERATION_FILTERS = [
  "all",
  "sent",
  "pending",
  "failed",
  "opt_out",
  "active",
  "birthday_today"
] as const;

export type CampaignOperationFilter = (typeof CAMPAIGN_OPERATION_FILTERS)[number];

export type OperationalRecipientStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "SIMULATED_SENT"
  | "FAILED"
  | "SKIPPED"
  | "OPTED_OUT";

type OperationMode = "SIMULACAO" | "REAL";

type QueueSummaryRow = {
  status: QueueStatus;
  count: number;
  averageDelaySeconds: number | null;
};

type QueueRecordRow = {
  id: string;
  status: QueueStatus;
  scheduledFor: Date;
  createdAt: Date;
  processedAt: Date | null;
  failedAt: Date | null;
  retryCount: number;
  campaignRecipientId: string;
};

type CampaignOperationEvent = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  tone: "info" | "success" | "warning" | "danger";
};

function getTodayMonthDayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function toShortCode(id: string) {
  return id.slice(-8).toUpperCase();
}

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value ?? 0;
}

function buildRecipientWhere(
  campaignId: string,
  filter: CampaignOperationFilter
): Prisma.CampaignRecipientWhereInput {
  switch (filter) {
    case "sent":
      return {
        campaignId,
        status: CampaignRecipientStatus.SENT
      };
    case "pending":
      return {
        campaignId,
        status: CampaignRecipientStatus.PENDING
      };
    case "failed":
      return {
        campaignId,
        status: CampaignRecipientStatus.FAILED
      };
    case "opt_out":
      return {
        campaignId,
        OR: [
          {
            status: CampaignRecipientStatus.UNSUBSCRIBED
          },
          {
            contact: {
              status: ContactStatus.UNSUBSCRIBED
            }
          },
          {
            contact: {
              optIn: false
            }
          }
        ]
      };
    case "active":
      return {
        campaignId,
        contact: {
          status: ContactStatus.ACTIVE,
          optIn: true
        }
      };
    case "all":
    case "birthday_today":
    default:
      return {
        campaignId
      };
  }
}

function buildSyntheticEvents(queueRecord: QueueRecordRow | undefined) {
  if (!queueRecord) {
    return [] as CampaignOperationEvent[];
  }

  const events: CampaignOperationEvent[] = [
    {
      id: `${queueRecord.id}-queued`,
      title: "Job enfileirado",
      message: "Registro existente na fila de saida para processamento pelo worker.",
      createdAt: queueRecord.createdAt.toISOString(),
      tone: "info"
    }
  ];

  const delaySeconds = Math.max(
    0,
    Math.round((queueRecord.scheduledFor.getTime() - queueRecord.createdAt.getTime()) / 1000)
  );

  if (delaySeconds > 0) {
    events.push({
      id: `${queueRecord.id}-delay`,
      title: "Delay humano aplicado",
      message: `Janela de ${delaySeconds}s antes do envio.`,
      createdAt: queueRecord.scheduledFor.toISOString(),
      tone: "warning"
    });
  }

  if (queueRecord.status === QueueStatus.PROCESSING) {
    events.push({
      id: `${queueRecord.id}-processing`,
      title: "Job em processamento",
      message: "Worker executando a tentativa atual.",
      createdAt: (queueRecord.processedAt ?? queueRecord.scheduledFor).toISOString(),
      tone: "info"
    });
  }

  if (queueRecord.retryCount > 0) {
    events.push({
      id: `${queueRecord.id}-retry`,
      title: "Retry aplicado",
      message: `${queueRecord.retryCount} tentativa(s) adicional(is) registrada(s) na fila.`,
      createdAt: (queueRecord.failedAt ?? queueRecord.processedAt ?? queueRecord.scheduledFor).toISOString(),
      tone: "warning"
    });
  }

  return events;
}

function mapEventTone(level: string) {
  if (level === "CRITICAL") return "danger";
  if (level === "WARN") return "warning";
  if (level === "STABLE") return "success";
  return "info";
}

function mergeTimelineEvents(
  persistedEvents: Array<{
    id: string;
    title: string;
    message: string;
    createdAt: Date;
    level: string;
  }>,
  queueRecord: QueueRecordRow | undefined
) {
  const seenTitles = new Set(persistedEvents.map((event) => event.title));
  const syntheticEvents = buildSyntheticEvents(queueRecord).filter(
    (event) => !seenTitles.has(event.title)
  );

  return [...persistedEvents.map((event) => ({
    id: event.id,
    title: event.title,
    message: event.message,
    createdAt: event.createdAt.toISOString(),
    tone: mapEventTone(event.level)
  })), ...syntheticEvents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
}

function deriveOperationalStatus(input: {
  recipientStatus: CampaignRecipientStatus;
  contactStatus: ContactStatus;
  contactOptIn: boolean;
  latestQueueStatus?: QueueStatus;
  latestMessageStatus?: WhatsAppMessageLogStatus;
}): OperationalRecipientStatus {
  if (
    input.recipientStatus === CampaignRecipientStatus.UNSUBSCRIBED ||
    input.contactStatus === ContactStatus.UNSUBSCRIBED ||
    !input.contactOptIn ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.OPTED_OUT
  ) {
    return "OPTED_OUT";
  }

  if (input.latestQueueStatus === QueueStatus.PROCESSING) {
    return "SENDING";
  }

  if (
    input.latestQueueStatus === QueueStatus.SIMULATED_SENT ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.SIMULATED_SENT
  ) {
    return "SIMULATED_SENT";
  }

  if (input.recipientStatus === CampaignRecipientStatus.FAILED || input.latestQueueStatus === QueueStatus.FAILED) {
    return "FAILED";
  }

  if (input.recipientStatus === CampaignRecipientStatus.SKIPPED) {
    return "SKIPPED";
  }

  if (
    input.recipientStatus === CampaignRecipientStatus.SENT ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.ACCEPTED ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.SENT ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.DELIVERED ||
    input.latestMessageStatus === WhatsAppMessageLogStatus.READ
  ) {
    return "SENT";
  }

  return "QUEUED";
}

async function getQueueSummary(campaignId: string) {
  const rows = await prisma.$queryRaw<QueueSummaryRow[]>`
    SELECT
      status::text AS status,
      COUNT(*)::int AS count,
      AVG(EXTRACT(EPOCH FROM ("scheduledFor" - "createdAt")))::float AS "averageDelaySeconds"
    FROM "MessageQueue"
    WHERE
      "direction" = ${MessageDirection.OUTBOUND}::"MessageDirection"
      AND metadata->>'kind' = 'CAMPAIGN'
      AND metadata->>'campaignId' = ${campaignId}
    GROUP BY status
  `;

  return rows;
}

async function getQueueRowsForRecipients(recipientIds: string[]) {
  if (recipientIds.length === 0) {
    return [] as QueueRecordRow[];
  }

  return prisma.$queryRaw<QueueRecordRow[]>`
    SELECT
      id,
      status::text AS status,
      "scheduledFor",
      "createdAt",
      "processedAt",
      "failedAt",
      "retryCount",
      metadata->>'campaignRecipientId' AS "campaignRecipientId"
    FROM "MessageQueue"
    WHERE
      "direction" = ${MessageDirection.OUTBOUND}::"MessageDirection"
      AND metadata->>'kind' = 'CAMPAIGN'
      AND metadata->>'campaignRecipientId' IN (${Prisma.join(recipientIds)})
    ORDER BY "createdAt" DESC
  `;
}

async function getBirthdayRecipientIds(input: {
  campaignId: string;
  page: number;
}) {
  const offset = (input.page - 1) * CAMPAIGN_OPERATIONS_PAGE_SIZE;
  const todayKey = getTodayMonthDayKey();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT recipient.id
    FROM "CampaignRecipient" recipient
    INNER JOIN "Contact" contact ON contact.id = recipient."contactId"
    WHERE
      recipient."campaignId" = ${input.campaignId}
      AND contact."birthday" IS NOT NULL
      AND TO_CHAR(contact."birthday", 'MM-DD') = ${todayKey}
    ORDER BY recipient."updatedAt" DESC
    LIMIT ${CAMPAIGN_OPERATIONS_PAGE_SIZE}
    OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "CampaignRecipient" recipient
    INNER JOIN "Contact" contact ON contact.id = recipient."contactId"
    WHERE
      recipient."campaignId" = ${input.campaignId}
      AND contact."birthday" IS NOT NULL
      AND TO_CHAR(contact."birthday", 'MM-DD') = ${todayKey}
  `;

  return {
    ids: rows.map((row) => row.id),
    total: countRows[0]?.count ?? 0
  };
}

export async function getCampaignOperationsView(input: {
  mandateId: string;
  campaignId?: string;
  filter: CampaignOperationFilter;
  page: number;
}) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      mandateId: input.mandateId
    },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      sentCount: true,
      failedCount: true,
      template: {
        select: {
          name: true
        }
      },
      operationState: {
        select: {
          pipelineStage: true,
          deliveryRate: true
        }
      },
      _count: {
        select: {
          recipients: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 12
  });

  const selectedCampaignId =
    campaigns.find((campaign) => campaign.id === input.campaignId)?.id ?? campaigns[0]?.id;

  if (!selectedCampaignId) {
    return {
      campaigns: [],
      selectedCampaign: null
    };
  }

  const selectedCampaign = await prisma.campaign.findFirst({
    where: {
      id: selectedCampaignId,
      mandateId: input.mandateId
    },
    select: {
      id: true,
      name: true,
      status: true,
      delaySeconds: true,
      updatedAt: true,
      createdAt: true,
      template: {
        select: {
          name: true,
          body: true,
          metaTemplateName: true
        }
      },
      operationState: {
        select: {
          pipelineStage: true,
          riskScore: true,
          queuePressure: true,
          currentDelayMin: true,
          currentDelayMax: true,
          activeThroughput: true,
          safeThroughput: true
        }
      }
    }
  });

  if (!selectedCampaign) {
    return {
      campaigns,
      selectedCampaign: null
    };
  }

  const [recipientStatusGroups, queueSummaryRows, logGroups] = await Promise.all([
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: {
        campaignId: selectedCampaign.id
      },
      _count: {
        _all: true
      }
    }),
    getQueueSummary(selectedCampaign.id),
    prisma.whatsAppMessageLog.groupBy({
      by: ["status"],
      where: {
        campaignId: selectedCampaign.id,
        direction: "OUTBOUND"
      },
      _count: {
        _all: true
      }
    })
  ]);

  const recipientCounts = {
    total: 0,
    pending: 0,
    failed: 0,
    skipped: 0,
    optOut: 0
  };

  for (const row of recipientStatusGroups) {
    recipientCounts.total += row._count._all;

    if (row.status === CampaignRecipientStatus.PENDING) recipientCounts.pending = row._count._all;
    if (row.status === CampaignRecipientStatus.FAILED) recipientCounts.failed = row._count._all;
    if (row.status === CampaignRecipientStatus.SKIPPED) recipientCounts.skipped = row._count._all;
    if (row.status === CampaignRecipientStatus.UNSUBSCRIBED) recipientCounts.optOut = row._count._all;
  }

  const queueCounts = {
    queued: 0,
    sending: 0
  };
  let averageDelaySeconds = selectedCampaign.delaySeconds;
  let delayWeight = 0;
  let weightedDelay = 0;

  for (const row of queueSummaryRows) {
    const count = toNumber(row.count);

    if (row.status === QueueStatus.QUEUED || row.status === QueueStatus.PENDING) {
      queueCounts.queued += count;
    }

    if (row.status === QueueStatus.PROCESSING) {
      queueCounts.sending += count;
    }

    if (row.averageDelaySeconds != null) {
      weightedDelay += row.averageDelaySeconds * count;
      delayWeight += count;
    }
  }

  if (delayWeight > 0) {
    averageDelaySeconds = Math.max(1, Math.round(weightedDelay / delayWeight));
  }

  queueCounts.queued = Math.max(queueCounts.queued, Math.max(0, recipientCounts.pending - queueCounts.sending));

  const logCounts = {
    simulatedSent: 0,
    sent: 0
  };

  for (const row of logGroups) {
    const count = row._count._all;

    if (row.status === WhatsAppMessageLogStatus.SIMULATED_SENT) {
      logCounts.simulatedSent += count;
      continue;
    }

    if (
      row.status === WhatsAppMessageLogStatus.ACCEPTED ||
      row.status === WhatsAppMessageLogStatus.SENT ||
      row.status === WhatsAppMessageLogStatus.DELIVERED ||
      row.status === WhatsAppMessageLogStatus.READ
    ) {
      logCounts.sent += count;
    }
  }

  const recipientWhere = buildRecipientWhere(selectedCampaign.id, input.filter);
  let recipientIdsForPage: string[] = [];
  let totalRecipientsForFilter = 0;
  let currentPage = input.page;

  if (input.filter === "birthday_today") {
    const birthdayRows = await getBirthdayRecipientIds({
      campaignId: selectedCampaign.id,
      page: input.page
    });

    recipientIdsForPage = birthdayRows.ids;
    totalRecipientsForFilter = birthdayRows.total;
  } else {
    totalRecipientsForFilter = await prisma.campaignRecipient.count({
      where: recipientWhere
    });

    const recipientIdRows = await prisma.campaignRecipient.findMany({
      where: recipientWhere,
      select: {
        id: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      skip: (input.page - 1) * CAMPAIGN_OPERATIONS_PAGE_SIZE,
      take: CAMPAIGN_OPERATIONS_PAGE_SIZE
    });

    recipientIdsForPage = recipientIdRows.map((row) => row.id);
  }

  const totalPages = Math.max(1, Math.ceil(totalRecipientsForFilter / CAMPAIGN_OPERATIONS_PAGE_SIZE));

  if (currentPage > totalPages) {
    currentPage = totalPages;

    if (input.filter === "birthday_today") {
      const birthdayRows = await getBirthdayRecipientIds({
        campaignId: selectedCampaign.id,
        page: currentPage
      });

      recipientIdsForPage = birthdayRows.ids;
    } else {
      const recipientIdRows = await prisma.campaignRecipient.findMany({
        where: recipientWhere,
        select: {
          id: true
        },
        orderBy: {
          updatedAt: "desc"
        },
        skip: (currentPage - 1) * CAMPAIGN_OPERATIONS_PAGE_SIZE,
        take: CAMPAIGN_OPERATIONS_PAGE_SIZE
      });

      recipientIdsForPage = recipientIdRows.map((row) => row.id);
    }
  }

  const recipients = recipientIdsForPage.length
    ? await prisma.campaignRecipient.findMany({
        where: {
          id: {
            in: recipientIdsForPage
          }
        },
        include: {
          contact: true,
          eventLogs: {
            orderBy: {
              createdAt: "desc"
            },
            take: 6
          },
          messageLogs: {
            orderBy: {
              createdAt: "desc"
            },
            take: 2
          }
        }
      })
    : [];

  const recipientOrder = new Map(recipientIdsForPage.map((id, index) => [id, index]));
  const queueRows = await getQueueRowsForRecipients(recipientIdsForPage);
  const latestQueueByRecipient = new Map<string, QueueRecordRow>();

  for (const queueRow of queueRows) {
    if (!latestQueueByRecipient.has(queueRow.campaignRecipientId)) {
      latestQueueByRecipient.set(queueRow.campaignRecipientId, queueRow);
    }
  }

  const mappedRecipients = recipients
    .sort((a, b) => (recipientOrder.get(a.id) ?? 0) - (recipientOrder.get(b.id) ?? 0))
    .map((recipient) => {
      const latestQueue = latestQueueByRecipient.get(recipient.id);
      const latestMessage = recipient.messageLogs[0];
      const status = deriveOperationalStatus({
        recipientStatus: recipient.status,
        contactStatus: recipient.contact.status,
        contactOptIn: recipient.contact.optIn,
        latestQueueStatus: latestQueue?.status,
        latestMessageStatus: latestMessage?.status
      });

      return {
        id: recipient.id,
        code: toShortCode(recipient.contact.id),
        name: recipient.contact.name,
        phone: recipient.contact.phone,
        status,
        preview:
          recipient.messagePreview ??
          personalizeCampaignText(selectedCampaign.template.body, recipient.contact.name),
        updatedAt: recipient.updatedAt.toISOString(),
        failureReason: recipient.errorMessage,
        contactStatus: recipient.contact.status,
        isBirthdayToday:
          recipient.contact.birthday != null &&
          getTodayMonthDayKey(recipient.contact.birthday) === getTodayMonthDayKey(),
        timeline: mergeTimelineEvents(
          recipient.eventLogs.map((event) => ({
            id: event.id,
            title: event.title,
            message: event.message,
            createdAt: event.createdAt,
            level: event.level
          })),
          latestQueue
        )
      };
    });

  return {
    campaigns,
    selectedCampaign: {
      id: selectedCampaign.id,
      name: selectedCampaign.name,
      status: selectedCampaign.status,
      updatedAt: selectedCampaign.updatedAt.toISOString(),
      templateName: selectedCampaign.template.name,
      templateMetaName: selectedCampaign.template.metaTemplateName,
      operationState: selectedCampaign.operationState,
      summary: {
        totalRecipients: recipientCounts.total,
        queued: queueCounts.queued,
        sending: queueCounts.sending,
        sent: logCounts.sent,
        simulatedSent: logCounts.simulatedSent,
        failed: recipientCounts.failed,
        skipped: recipientCounts.skipped,
        optOut: recipientCounts.optOut,
        averageDelaySeconds,
        mode: (isWhatsAppDryRunEnabled() ? "SIMULACAO" : "REAL") as OperationMode
      },
      recipients: mappedRecipients,
      pagination: {
        page: currentPage,
        pageSize: CAMPAIGN_OPERATIONS_PAGE_SIZE,
        total: totalRecipientsForFilter,
        totalPages
      },
      filter: input.filter,
      reviewHref: `/admin/campaigns?preflightCampaignId=${selectedCampaign.id}`
    }
  };
}
