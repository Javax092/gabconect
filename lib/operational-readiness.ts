import { MessageDirection, QueueStatus, WhatsAppMessageLogStatus } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getQueueHealth } from "@/lib/queue";
import { ApiRouteError } from "@/lib/api";

const WORKER_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;

function getModeLabel() {
  return process.env.WHATSAPP_DRY_RUN === "true" ? "SIMULACAO" : "REAL";
}

function getItemStatus(configured: boolean) {
  return configured ? "configurado" : "ausente";
}

export async function getOperationalReadiness(mandateId: string) {
  const queueHealth = await getQueueHealth();
  const [workerHeartbeats, queueCounts, latestInboundMessage, latestLog, latestFailedLogs] = await Promise.all([
    prisma.workerHeartbeat.findMany({
      where: {
        OR: [{ mandateId }, { mandateId: null }]
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
      include: {
        conversation: {
          include: {
            citizen: true
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
      include: {
        contact: true,
        campaign: true
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
      take: 5
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

  const envChecklist = [
    { key: "WHATSAPP_ACCESS_TOKEN", label: "Token de acesso Meta", configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN) },
    { key: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID", configured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID) },
    { key: "WHATSAPP_VERIFY_TOKEN", label: "Verify token do webhook", configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN) },
    { key: "META_APP_SECRET", label: "Assinatura Meta", configured: Boolean(process.env.META_APP_SECRET) },
    { key: "APP_URL", label: "URL pública da aplicação", configured: Boolean(env.appUrl) },
    { key: "REDIS_URL", label: "Redis", configured: Boolean(process.env.REDIS_URL) },
    { key: "OPENAI_API_KEY", label: "OpenAI API Key", configured: Boolean(process.env.OPENAI_API_KEY) }
  ].map((item) => ({
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
    envChecklist,
    latestInboundMessage: latestInboundMessage
      ? {
          createdAt: latestInboundMessage.createdAt.toISOString(),
          from: latestInboundMessage.conversation.citizen.phone,
          citizenName: latestInboundMessage.conversation.citizen.name,
          content: latestInboundMessage.content
        }
      : null,
    latestDelivery: latestLog
      ? {
          createdAt: latestLog.createdAt.toISOString(),
          status: latestLog.status,
          phone: latestLog.phone,
          contactName: latestLog.contact?.name ?? null,
          campaignName: latestLog.campaign?.name ?? null,
          errorMessage: latestLog.errorMessage
        }
      : null,
    recentErrors: latestFailedLogs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      message: log.errorMessage ?? "Falha retornada pela Meta.",
      phone: log.phone
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
