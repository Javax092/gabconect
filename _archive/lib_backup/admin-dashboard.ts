import { CampaignStatus, QueueStatus } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const ACTIVE_CAMPAIGN_STATUSES = [
  CampaignStatus.DRAFT,
  CampaignStatus.SCHEDULED,
  CampaignStatus.RUNNING,
  CampaignStatus.PAUSED
] as const;

const WORKER_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;

function getModeLabel() {
  return process.env.WHATSAPP_DRY_RUN === "true" ? "SIMULACAO" : "REAL";
}

export type AdminDashboardOverview = Awaited<ReturnType<typeof getAdminDashboardOverview>>;
export type AdminDashboardDeferredData = Awaited<ReturnType<typeof getAdminDashboardDeferredData>>;

export async function getAdminDashboardOverview(mandateId: string) {
  const [queueCounts, outgoingHeartbeat, humanPendings, riskState] = await Promise.all([
    prisma.messageQueue.groupBy({
      by: ["status"],
      where: { mandateId },
      _count: { _all: true }
    }),
    prisma.workerHeartbeat.findFirst({
      where: {
        workerName: "outgoing",
        OR: [{ mandateId }, { mandateId: null }]
      },
      select: { lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" }
    }),
    prisma.conversation.count({
      where: {
        mandateId,
        OR: [{ status: "HUMAN" }, { humanTakeoverActive: true }, { humanPriority: true }]
      }
    }),
    prisma.campaignOperationState.findFirst({
      where: {
        campaign: {
          mandateId,
          status: { in: [...ACTIVE_CAMPAIGN_STATUSES] }
        }
      },
      select: { spamProbability: true },
      orderBy: [{ spamProbability: "desc" }, { updatedAt: "desc" }]
    })
  ]);

  const queued = queueCounts
    .filter((item) => item.status === QueueStatus.QUEUED)
    .reduce((total, item) => total + item._count._all, 0);
  const outgoingWorkerReady = outgoingHeartbeat
    ? Date.now() - outgoingHeartbeat.lastSeenAt.getTime() <= WORKER_HEARTBEAT_WINDOW_MS
    : false;

  return {
    mode: getModeLabel(),
    outgoingWorkerReady,
    webhookConfigured: Boolean(env.appUrl && process.env.WHATSAPP_VERIFY_TOKEN),
    queued,
    humanPendings,
    riskProbability: riskState?.spamProbability ?? 0
  };
}

export async function getAdminDashboardDeferredData(mandateId: string) {
  const [recentConversations, recentCompliance, activeCampaigns] = await Promise.all([
    prisma.conversation.findMany({
      where: { mandateId },
      select: {
        id: true,
        status: true,
        humanPriority: true,
        riskScore: true,
        currentQueue: true,
        lastMessageAt: true,
        metaWindowOpen: true,
        citizen: {
          select: {
            name: true
          }
        },
        messages: {
          select: {
            content: true
          },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ humanPriority: "desc" }, { lastMessageAt: "desc" }],
      take: 6
    }),
    prisma.complianceLog.findMany({
      where: { mandateId },
      select: {
        id: true,
        actionTaken: true,
        reason: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.campaign.findMany({
      where: {
        mandateId,
        status: { in: [...ACTIVE_CAMPAIGN_STATUSES] }
      },
      select: {
        id: true,
        name: true,
        status: true,
        template: {
          select: {
            name: true
          }
        },
        operationState: {
          select: {
            pipelineStage: true,
            riskScore: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 5
    })
  ]);

  return {
    recentConversations: recentConversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      humanPriority: conversation.humanPriority,
      riskScore: conversation.riskScore,
      currentQueue: conversation.currentQueue,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      metaWindowOpen: conversation.metaWindowOpen,
      citizenName: conversation.citizen.name,
      latestMessage: conversation.messages[0]?.content ?? null
    })),
    recentCompliance: recentCompliance.map((entry) => ({
      id: entry.id,
      actionTaken: entry.actionTaken,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString()
    })),
    activeCampaigns: activeCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      templateName: campaign.template.name,
      pipelineStage: campaign.operationState?.pipelineStage ?? null,
      riskScore: campaign.operationState?.riskScore ?? 0
    }))
  };
}
