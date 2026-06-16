import {
  CampaignRecipientStatus,
  CampaignStatus,
  CampaignPipelineStage,
  CampaignWarmupStage,
  OperationEventLevel,
  Prisma,
} from "@prisma/client";

import { ensureReputationProfile } from "@/lib/campaign-safety";
import { prisma } from "@/lib/prisma";

/* -------------------------------------------------------------------------- */
/* WARMUP RULES                                                               */
/* -------------------------------------------------------------------------- */

export const DEFAULT_WARMUP_RULES = [
  {
    dayNumber: 1,
    label: "Dia 1",
    stage: CampaignWarmupStage.DAY_1,
    dailyLimit: 20,
    throughputCap: 12,
    minDelaySeconds: 45,
    maxDelaySeconds: 90,
    pauseOnRisk: 55,
  },
  {
    dayNumber: 2,
    label: "Dia 2",
    stage: CampaignWarmupStage.DAY_2,
    dailyLimit: 40,
    throughputCap: 18,
    minDelaySeconds: 35,
    maxDelaySeconds: 80,
    pauseOnRisk: 62,
  },
  {
    dayNumber: 3,
    label: "Dia 3",
    stage: CampaignWarmupStage.DAY_3,
    dailyLimit: 80,
    throughputCap: 28,
    minDelaySeconds: 25,
    maxDelaySeconds: 70,
    pauseOnRisk: 70,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* UTILS                                                                      */
/* -------------------------------------------------------------------------- */

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

export function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

export function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function extractPrefixedValues(tags: string[], prefix: string) {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => normalizeTag(tag).startsWith(`${prefix}:`))
        .map((tag) => toTitleCase(tag.split(":").slice(1).join(":")))
        .filter(Boolean)
    ),
  ].sort();
}

export function getStageLabel(stage: CampaignWarmupStage) {
  switch (stage) {
    case CampaignWarmupStage.DAY_1:
      return "Aquecimento inicial";
    case CampaignWarmupStage.DAY_2:
      return "Expansão gradual";
    case CampaignWarmupStage.DAY_3:
      return "Escala supervisionada";
    case CampaignWarmupStage.STABLE:
      return "Estável";
    case CampaignWarmupStage.COOLDOWN:
      return "Cooldown";
    case CampaignWarmupStage.PAUSED:
      return "Pausado";
    default:
      return "Dormiente";
  }
}

export function getPipelineLabel(stage: CampaignPipelineStage) {
  switch (stage) {
    case CampaignPipelineStage.QUEUED:
      return "Queued";
    case CampaignPipelineStage.WARMING:
      return "Warming";
    case CampaignPipelineStage.SENDING:
      return "Sending";
    case CampaignPipelineStage.THROTTLED:
      return "Throttled";
    case CampaignPipelineStage.PAUSED:
      return "Paused";
    case CampaignPipelineStage.RISK_DETECTED:
      return "Risk detected";
    case CampaignPipelineStage.HUMAN_REVIEW:
      return "Human review";
    case CampaignPipelineStage.COMPLETED:
      return "Completed";
    default:
      return "Queued";
  }
}

/* -------------------------------------------------------------------------- */
/* AUDIENCE                                                                   */
/* -------------------------------------------------------------------------- */

export function flattenAudience(input: {
  tags?: string[];
  groups?: string[];
  priorities?: string[];
}) {
  return [
    ...(input.tags ?? []),
    ...(input.groups ?? []),
    ...(input.priorities ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function countAudienceContacts(
  mandateId: string,
  audience: {
    tags?: string[];
    groups?: string[];
    priorities?: string[];
    locations?: string[];
    interests?: string[];
    contactTypes?: string[];
    selectedContactIds?: string[];
  }
) {
  const terms = [...new Set(flattenAudience(audience).map(normalizeTag).filter(Boolean))];

  return prisma.contact.count({
    where: {
      mandateId,
      ...(audience.selectedContactIds && audience.selectedContactIds.length > 0
        ? {
            id: {
              in: audience.selectedContactIds
            }
          }
        : {}),
      ...(terms.length > 0
        ? {
            tags: {
              hasEvery: terms
            }
          }
        : {})
    }
  });
}

function pipelineStageForStatus(status: CampaignStatus) {
  switch (status) {
    case CampaignStatus.RUNNING:
      return CampaignPipelineStage.SENDING;
    case CampaignStatus.PAUSED:
      return CampaignPipelineStage.PAUSED;
    case CampaignStatus.COMPLETED:
      return CampaignPipelineStage.COMPLETED;
    case CampaignStatus.FAILED:
    case CampaignStatus.CANCELLED:
      return CampaignPipelineStage.RISK_DETECTED;
    default:
      return CampaignPipelineStage.QUEUED;
  }
}

export async function syncCampaignOperationState(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      status: true,
      dailyLimit: true,
      delaySeconds: true,
      sentCount: true,
      failedCount: true
    }
  });

  if (!campaign) {
    return null;
  }

  const groups = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: {
      campaignId
    },
    _count: {
      _all: true
    }
  });
  const count = (status: CampaignRecipientStatus) =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  const sent = count(CampaignRecipientStatus.SENT);
  const failed = count(CampaignRecipientStatus.FAILED);
  const queued =
    count(CampaignRecipientStatus.QUEUED) +
    count(CampaignRecipientStatus.PROCESSING) +
    count(CampaignRecipientStatus.PENDING);
  const totalFinal = Math.max(1, sent + failed);
  const deliveryRate = Math.round((sent / totalFinal) * 100);
  const riskScore = clamp(failed * 8 + Math.max(0, 80 - deliveryRate), 0, 100);
  const pipelineStage = pipelineStageForStatus(campaign.status);

  return prisma.campaignOperationState.upsert({
    where: {
      campaignId
    },
    update: {
      pipelineStage,
      riskScore,
      spamProbability: clamp(riskScore - 10, 0, 100),
      deliveryRate,
      queuePressure: clamp(queued * 4, 0, 100),
      activeThroughput: Math.max(0, sent),
      safeThroughput: Math.max(1, Math.min(campaign.dailyLimit, 50)),
      currentDelayMin: Math.max(25, campaign.delaySeconds),
      currentDelayMax: Math.max(45, campaign.delaySeconds * 2),
      failsafeTriggered: riskScore >= 80,
      humanReviewNeeded: riskScore >= 70,
      recommendedAction: riskScore >= 70 ? "Revisar audiencia e cadencia antes de continuar." : null,
      lastEvaluatedAt: new Date()
    },
    create: {
      campaignId,
      pipelineStage,
      riskScore,
      spamProbability: clamp(riskScore - 10, 0, 100),
      deliveryRate,
      queuePressure: clamp(queued * 4, 0, 100),
      activeThroughput: Math.max(0, sent),
      safeThroughput: Math.max(1, Math.min(campaign.dailyLimit, 50)),
      currentDelayMin: Math.max(25, campaign.delaySeconds),
      currentDelayMax: Math.max(45, campaign.delaySeconds * 2),
      failsafeTriggered: riskScore >= 80,
      humanReviewNeeded: riskScore >= 70,
      recommendedAction: riskScore >= 70 ? "Revisar audiencia e cadencia antes de continuar." : null,
      lastEvaluatedAt: new Date()
    }
  });
}

export async function ensureCampaignInfrastructure(mandateId: string, phoneNumber: string) {
  const profile = await ensureReputationProfile(mandateId, phoneNumber);

  await Promise.all(
    DEFAULT_WARMUP_RULES.map((rule) =>
      prisma.warmupRule.upsert({
        where: {
          mandateId_dayNumber: {
            mandateId,
            dayNumber: rule.dayNumber
          }
        },
        update: {
          label: rule.label,
          stage: rule.stage,
          dailyLimit: rule.dailyLimit,
          throughputCap: rule.throughputCap,
          minDelaySeconds: rule.minDelaySeconds,
          maxDelaySeconds: rule.maxDelaySeconds,
          pauseOnRisk: rule.pauseOnRisk,
          active: true
        },
        create: {
          mandateId,
          ...rule,
          active: true
        }
      })
    )
  );

  return profile;
}

export async function bootstrapCampaignEvents(mandateId: string) {
  const existing = await prisma.campaignEventLog.count({
    where: {
      mandateId
    }
  });

  if (existing > 0) {
    return null;
  }

  return appendCampaignEvent({
    mandateId,
    eventType: "campaign.infrastructure.ready",
    title: "Infraestrutura operacional inicializada",
    message: "Reputacao, regras de aquecimento e painel operacional prontos para campanhas.",
    metadata: {
      bootstrapped: true
    }
  });
}

export async function getAudienceDimensionOptions(mandateId: string) {
  const contacts = await prisma.contact.findMany({
    where: {
      mandateId
    },
    select: {
      tags: true
    }
  });
  const tags = [...new Set(contacts.flatMap((contact) => contact.tags).map(normalizeTag).filter(Boolean))].sort();

  return {
    birthdayMonthDay: null,
    tags,
    groups: extractPrefixedValues(tags, "grupo"),
    priorities: extractPrefixedValues(tags, "prioridade"),
    locations: extractPrefixedValues(tags, "local"),
    interests: extractPrefixedValues(tags, "interesse"),
    contactTypes: extractPrefixedValues(tags, "tipo"),
    selectedContactIds: []
  };
}

export async function getInfrastructureSnapshot(mandateId: string, phoneNumber: string) {
  const profile = await ensureCampaignInfrastructure(mandateId, phoneNumber);
  const [warmupRules, trustRecovery, logs, campaigns] = await Promise.all([
    prisma.warmupRule.findMany({
      where: {
        mandateId,
        active: true
      },
      orderBy: {
        dayNumber: "asc"
      }
    }),
    prisma.trustRecoveryState.findFirst({
      where: {
        mandateId,
        status: "ACTIVE"
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.campaignEventLog.findMany({
      where: {
        mandateId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 12
    }),
    prisma.campaign.findMany({
      where: {
        mandateId
      },
      include: {
        template: {
          select: {
            name: true
          }
        },
        audienceConfig: true,
        operationState: true,
        recipients: {
          select: {
            status: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 12
    })
  ]);
  const safetyScoreAverage = Math.round(
    clamp((profile.reputationScore + profile.deliveryHealth + (100 - profile.spamRisk)) / 3, 0, 100)
  );

  return {
    profile: {
      reputationScore: profile.reputationScore,
      spamRisk: profile.spamRisk,
      deliveryHealth: profile.deliveryHealth,
      qualityRating: profile.qualityRating,
      trustLevel: profile.trustLevel,
      stageLabel: getStageLabel(profile.warmingStage),
      trendDelta: profile.trendDelta,
      activeThroughput: profile.activeThroughput,
      safeThroughput: profile.safeThroughput,
      humanizedDelayMin: profile.humanizedDelayMin,
      humanizedDelayMax: profile.humanizedDelayMax,
      blockRisk: profile.blockRisk,
      queuePressure: profile.queuePressure
    },
    metrics: {
      deliveryRate: profile.deliveryHealth,
      reputationScore: profile.reputationScore,
      spamProbability: profile.spamRisk,
      activeThroughput: profile.activeThroughput,
      safeThroughput: profile.safeThroughput,
      humanizedDelay: `${profile.humanizedDelayMin}s-${profile.humanizedDelayMax}s`,
      campaignHealth: safetyScoreAverage,
      safeContactsReached: campaigns.reduce((total, campaign) => total + campaign.sentCount, 0),
      blockRisk: profile.blockRisk,
      queuePressure: profile.queuePressure,
      trustLevel: profile.trustLevel,
      qualityRating: profile.qualityRating,
      trendDelta: profile.trendDelta,
      safetyScoreAverage,
      blockedCampaigns: campaigns.filter((campaign) => campaign.status === CampaignStatus.PAUSED).length,
      numbersInTrustRecovery: trustRecovery ? 1 : 0,
      recommendedThroughput: profile.safeThroughput,
      riskTrend: profile.trendDelta >= 0 ? "estavel" : "atencao"
    },
    warmupRules: warmupRules.map((rule) => ({
      id: rule.id,
      dayNumber: rule.dayNumber,
      label: rule.label,
      stageLabel: getStageLabel(rule.stage),
      dailyLimit: rule.dailyLimit,
      throughputCap: rule.throughputCap,
      minDelaySeconds: rule.minDelaySeconds,
      maxDelaySeconds: rule.maxDelaySeconds,
      pauseOnRisk: rule.pauseOnRisk
    })),
    trustRecovery: trustRecovery
      ? {
          status: trustRecovery.status,
          reason: trustRecovery.reason,
          recommendedLimit: trustRecovery.recommendedLimit,
          cooldownUntil: trustRecovery.cooldownUntil,
          recoverySteps: Array.isArray(trustRecovery.recoverySteps)
            ? trustRecovery.recoverySteps.filter((step): step is string => typeof step === "string")
            : []
        }
      : null,
    logs: logs.map((log) => ({
      id: log.id,
      levelLabel: log.level,
      title: log.title,
      message: log.message,
      recommendedAction: log.recommendedAction,
      createdAt: log.createdAt
    })),
    campaigns: campaigns.map((campaign) => {
      const pendingCount = campaign.recipients.filter(
        (recipient) =>
          recipient.status === CampaignRecipientStatus.PENDING ||
          recipient.status === CampaignRecipientStatus.PROCESSING ||
          recipient.status === CampaignRecipientStatus.QUEUED
      ).length;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        templateName: campaign.template.name,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        pendingCount,
        audience: campaign.audienceConfig ? flattenAudience(campaign.audienceConfig) : campaign.segmentTags,
        operationState: campaign.operationState
          ? {
              pipelineLabel: getPipelineLabel(campaign.operationState.pipelineStage),
              riskScore: campaign.operationState.riskScore,
              deliveryRate: campaign.operationState.deliveryRate,
              activeThroughput: campaign.operationState.activeThroughput,
              safeThroughput: campaign.operationState.safeThroughput,
              currentDelayMin: campaign.operationState.currentDelayMin,
              currentDelayMax: campaign.operationState.currentDelayMax,
              recommendedAction: campaign.operationState.recommendedAction,
              failsafeTriggered: campaign.operationState.failsafeTriggered,
              humanReviewNeeded: campaign.operationState.humanReviewNeeded
            }
          : null
      };
    })
  };
}

/* -------------------------------------------------------------------------- */
/* EVENT LOG                                                                  */
/* -------------------------------------------------------------------------- */

export async function appendCampaignEvent(input: {
  mandateId: string;
  campaignId?: string;
  campaignRecipientId?: string;
  level?: OperationEventLevel;
  eventType: string;
  title: string;
  message: string;
  recommendedAction?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.campaignEventLog.create({
    data: {
      mandateId: input.mandateId,
      campaignId: input.campaignId,
      campaignRecipientId: input.campaignRecipientId,
      level: input.level ?? OperationEventLevel.INFO,
      eventType: input.eventType,
      title: input.title,
      message: input.message,
      recommendedAction: input.recommendedAction,
      metadata: toJson(input.metadata),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* EXPORTS CENTRALIZADOS (opcional para uso em outros módulos)               */
/* -------------------------------------------------------------------------- */

export {
  CampaignPipelineStage,
  CampaignWarmupStage,
  OperationEventLevel,
};
