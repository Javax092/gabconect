import { MessageDirection, QueueStatus, SendAttemptStatus, WhatsAppMessageLogStatus } from "@prisma/client";

import { env } from "@/lib/env";
import { getEstimatedCampaignCapacityPerHour, getSendLimitConfig } from "@/lib/mass-campaign-config";
import { prisma } from "@/lib/prisma";
import { getQueueHealth } from "@/lib/queue";
import { ApiRouteError } from "@/lib/api";
import { getProductionEnvChecklist, redactPhone } from "@/lib/security";

const WORKER_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;

function getModeLabel() {
  return process.env.WHATSAPP_DRY_RUN === "true" ? "SIMULACAO" : "REAL";
}

function getItemStatus(configured: boolean) {
  return configured ? "configurado" : "ausente";
}

export async function getOperationalReadiness(mandateId: string) {
  const queueHealth = await getQueueHealth();
  const nowDate = new Date();
  const since24h = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000);
  const staleQueueCutoff = new Date(nowDate.getTime() - 10 * 60 * 1000);
  const [
    workerHeartbeats,
    queueCounts,
    latestInboundMessage,
    latestLog,
    latestFailedLogs,
    attemptGroups,
    staleQueueCount,
    completedQueueRecords
  ] = await Promise.all([
    prisma.workerHeartbeat.findMany({
      where: {
        OR: [{ mandateId }, { mandateId: null }]
      },
      select: {
        workerName: true,
        note: true,
        lastSeenAt: true
      },
      orderBy: [{ workerName: "asc" }]
    }),
    prisma.messageQueue.groupBy({
      by: ["direction", "status"],
      where: {
        mandateId
      },
      _count: {
        _all: true
      }
    }),
    prisma.message.findFirst({
      where: {
        conversation: {
          mandateId
        },
        direction: MessageDirection.INBOUND
      },
      select: {
        createdAt: true,
        content: true,
        conversation: {
          select: {
            citizen: {
              select: {
                phone: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.whatsAppMessageLog.findFirst({
      where: {
        mandateId,
        direction: "OUTBOUND"
      },
      select: {
        createdAt: true,
        status: true,
        phone: true,
        errorMessage: true,
        contact: {
          select: {
            name: true
          }
        },
        campaign: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.whatsAppMessageLog.findMany({
      where: {
        mandateId,
        status: WhatsAppMessageLogStatus.FAILED
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        createdAt: true,
        errorMessage: true,
        phone: true
      },
      take: 5
    }),
    prisma.sendAttempt.groupBy({
      by: ["status"],
      where: {
        mandateId,
        createdAt: {
          gte: since24h
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.messageQueue.count({
      where: {
        mandateId,
        status: QueueStatus.QUEUED,
        scheduledFor: {
          lt: staleQueueCutoff
        }
      }
    }),
    prisma.messageQueue.findMany({
      where: {
        mandateId,
        direction: MessageDirection.OUTBOUND,
        status: {
          in: [QueueStatus.SENT, QueueStatus.SIMULATED_SENT]
        },
        processedAt: {
          not: null,
          gte: since24h
        }
      },
      select: {
        scheduledFor: true,
        processedAt: true
      },
      take: 200,
      orderBy: {
        processedAt: "desc"
      }
    })
  ]);

  const now = Date.now();
  const workers = ["incoming", "outgoing", "human"].map((name) => {
    const heartbeat = workerHeartbeats.find((item) => item.workerName === name);
    const recent = heartbeat ? now - heartbeat.lastSeenAt.getTime() <= WORKER_HEARTBEAT_WINDOW_MS : false;

    return {
      name,
      status: heartbeat ? (recent ? "online" : "stale") : "unknown",
      note: heartbeat?.note ?? null,
      lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null
    };
  });

  const outgoingWorkerReady = workers.some((worker) => worker.name === "outgoing" && worker.status === "online");
  const queueSummary = {
    queued: queueCounts
      .filter((item) => item.status === QueueStatus.QUEUED)
      .reduce((total, item) => total + item._count._all, 0),
    processing: queueCounts
      .filter((item) => item.status === QueueStatus.PROCESSING)
      .reduce((total, item) => total + item._count._all, 0),
    failed: queueCounts
      .filter((item) => item.status === QueueStatus.FAILED)
      .reduce((total, item) => total + item._count._all, 0)
  };
  const attemptCount = (status: SendAttemptStatus) =>
    attemptGroups.find((item) => item.status === status)?._count._all ?? 0;
  const sentAttempts = attemptCount(SendAttemptStatus.SENT) + attemptCount(SendAttemptStatus.SIMULATED);
  const blockedAttempts =
    attemptCount(SendAttemptStatus.BLOCKED) +
    attemptCount(SendAttemptStatus.CANCELLED) +
    attemptCount(SendAttemptStatus.RATE_LIMITED);
  const errorAttempts = attemptCount(SendAttemptStatus.ERROR);
  const optOutAttempts = attemptCount(SendAttemptStatus.OPT_OUT);
  const totalFinalAttempts = Math.max(1, sentAttempts + blockedAttempts + errorAttempts + optOutAttempts);
  const sendDurations = completedQueueRecords
    .map((record) =>
      record.processedAt ? Math.max(0, record.processedAt.getTime() - record.scheduledFor.getTime()) : null
    )
    .filter((value): value is number => value != null);
  const averageSendTimeSeconds =
    sendDurations.length > 0
      ? Math.round(sendDurations.reduce((total, value) => total + value, 0) / sendDurations.length / 1000)
      : 0;
  const sendLimitConfig = getSendLimitConfig();
  const operationalMetrics = {
    sent: sentAttempts,
    blocked: blockedAttempts,
    optOuts: optOutAttempts,
    errors: errorAttempts,
    deliveryRate: Number(((sentAttempts / totalFinalAttempts) * 100).toFixed(2)),
    pendingQueue: queueSummary.queued,
    averageSendTimeSeconds,
    estimatedSafeCapacityPerHour: getEstimatedCampaignCapacityPerHour()
  };
  const errorRate = (errorAttempts / totalFinalAttempts) * 100;
  const optOutRate = (optOutAttempts / totalFinalAttempts) * 100;
  const operationalAlerts = [
    ...(errorRate > sendLimitConfig.alertErrorRatePercent
      ? [
          {
            level: "CRITICAL" as const,
            type: "ERROR_RATE",
            message: `Taxa de erro acima de ${sendLimitConfig.alertErrorRatePercent}%.`
          }
        ]
      : []),
    ...(optOutRate > sendLimitConfig.alertOptOutRatePercent
      ? [
          {
            level: "WARN" as const,
            type: "OPT_OUT_RATE",
            message: `Opt-out acima de ${sendLimitConfig.alertOptOutRatePercent}%.`
          }
        ]
      : []),
    ...(staleQueueCount > 0
      ? [
          {
            level: "WARN" as const,
            type: "QUEUE_STALLED",
            message: `${staleQueueCount} item(ns) na fila passaram do horário previsto.`
          }
        ]
      : []),
    ...(queueHealth.redis !== "ready"
      ? [
          {
            level: "CRITICAL" as const,
            type: "REDIS_UNAVAILABLE",
            message: "Redis indisponível ou degradado."
          }
        ]
      : []),
    ...(!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID
      ? [
          {
            level: "CRITICAL" as const,
            type: "WHATSAPP_UNAVAILABLE",
            message: "Credenciais WhatsApp ausentes."
          }
        ]
      : [])
  ];

  const envChecklist = [
    { key: "WHATSAPP_ACCESS_TOKEN", label: "Token de acesso Meta", configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN) },
    { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID", configured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID) },
    { key: "WHATSAPP_VERIFY_TOKEN", label: "Verify token do webhook", configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN) },
    { key: "META_APP_SECRET", label: "Assinatura Meta", configured: Boolean(process.env.META_APP_SECRET) },
    { key: "APP_URL", label: "URL pública da aplicação (APP_URL ou NEXT_PUBLIC_APP_URL)", configured: Boolean(env.appUrl) },
    { key: "REDIS_URL", label: "Redis", configured: Boolean(process.env.REDIS_URL) },
    { key: "OPENAI_API_KEY", label: "OpenAI API Key", configured: Boolean(process.env.OPENAI_API_KEY) }
  ].map((item) => ({
    ...item,
    status: getItemStatus(item.configured)
  }));
  const productionEnvChecklist = getProductionEnvChecklist().map((item) => ({
    ...item,
    status: getItemStatus(item.configured)
  }));

  return {
    mode: getModeLabel(),
    queueHealth,
    queueSummary,
    webhook: {
      endpoint: `${env.appUrl}/api/webhooks/whatsapp`,
      configured: Boolean(env.appUrl && process.env.WHATSAPP_VERIFY_TOKEN),
      verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      appSecretConfigured: Boolean(process.env.META_APP_SECRET)
    },
    credentials: {
      accessTokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberIdConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID)
    },
    workers,
    outgoingWorkerReady,
    operationalMetrics,
    operationalAlerts,
    envChecklist,
    productionEnvChecklist,
    latestInboundMessage: latestInboundMessage
      ? {
          createdAt: latestInboundMessage.createdAt.toISOString(),
          from: redactPhone(latestInboundMessage.conversation.citizen.phone),
          citizenName: latestInboundMessage.conversation.citizen.name,
          contentPreview: latestInboundMessage.content.slice(0, 80)
        }
      : null,
    latestDelivery: latestLog
      ? {
          createdAt: latestLog.createdAt.toISOString(),
          status: latestLog.status,
          phone: redactPhone(latestLog.phone),
          contactName: latestLog.contact?.name ?? null,
          campaignName: latestLog.campaign?.name ?? null,
          errorMessage: latestLog.errorMessage
        }
      : null,
    recentErrors: latestFailedLogs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      message: log.errorMessage ?? "Falha retornada pela Meta.",
      phone: redactPhone(log.phone)
    }))
  };
}

export async function assertRealCampaignStartReady(input: {
  mandateId: string;
  templateApproved: boolean;
  audiencePreview: {
    totalElegiveis: number;
    totalInvalidos: number;
    totalBloqueados?: number;
    totalOptOut: number;
    totalSemTelefone: number;
  };
}) {
  if (process.env.WHATSAPP_DRY_RUN === "true") {
    return;
  }

  const readiness = await getOperationalReadiness(input.mandateId);
  const reasons: string[] = [];

  if (!input.templateApproved) {
    reasons.push("Template ausente ou não aprovado pela Meta.");
  }

  reasons.push(...(await collectRealSendInfrastructureReasons(readiness)));

  if (input.audiencePreview.totalElegiveis === 0) {
    reasons.push("Nenhum destinatário elegível para envio real.");
  }

  if (input.audiencePreview.totalSemTelefone > 0 || input.audiencePreview.totalInvalidos > 0) {
    reasons.push("Há contatos sem telefone válido na seleção revisada.");
  }

  if (input.audiencePreview.totalOptOut > 0) {
    reasons.push("Há contatos com opt-out ativo na seleção revisada.");
  }

  if ((input.audiencePreview.totalBloqueados ?? 0) > 0) {
    reasons.push("Há contatos bloqueados explicitamente para envio.");
  }

  if (reasons.length > 0) {
    throw new ApiRouteError(400, reasons[0] ?? "Envio real bloqueado.", "REAL_SEND_BLOCKED", {
      reasons,
      mode: readiness.mode
    });
  }
}

export async function assertRealSendInfrastructureReady(mandateId: string) {
  if (process.env.WHATSAPP_DRY_RUN === "true") {
    return;
  }

  const readiness = await getOperationalReadiness(mandateId);
  const reasons = await collectRealSendInfrastructureReasons(readiness);

  if (reasons.length > 0) {
    throw new ApiRouteError(400, reasons[0] ?? "Envio real bloqueado.", "REAL_SEND_BLOCKED", {
      reasons,
      mode: readiness.mode
    });
  }
}

async function collectRealSendInfrastructureReasons(readiness: Awaited<ReturnType<typeof getOperationalReadiness>>) {
  const reasons: string[] = [];

  if (!readiness.credentials.accessTokenConfigured) {
    reasons.push("WHATSAPP_ACCESS_TOKEN ausente.");
  }

  if (!readiness.credentials.phoneNumberIdConfigured) {
    reasons.push("WHATSAPP_PHONE_NUMBER_ID ausente.");
  }

  if (readiness.queueHealth.queues !== "bullmq") {
    reasons.push("Envio real exige Redis com BullMQ ativo.");
  }

  if (!readiness.outgoingWorkerReady) {
    reasons.push("Worker outgoing sem heartbeat recente.");
  }

  return reasons;
}
