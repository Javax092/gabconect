import {
  CampaignPipelineStage,
  CampaignRiskTrend,
  CampaignStatus,
  CampaignWarmupStage,
  OperationEventLevel,
  Prisma
} from "@prisma/client";

import { ensureReputationProfile, runAdaptiveReputationEngine } from "@/lib/campaign-safety";
import { prisma } from "@/lib/prisma";

const DEFAULT_WARMUP_RULES = [
  {
    dayNumber: 1,
    label: "Dia 1",
    stage: CampaignWarmupStage.DAY_1,
    dailyLimit: 20,
    throughputCap: 12,
    minDelaySeconds: 45,
    maxDelaySeconds: 90,
    pauseOnRisk: 55
  },
  {
    dayNumber: 2,
    label: "Dia 2",
    stage: CampaignWarmupStage.DAY_2,
    dailyLimit: 40,
    throughputCap: 18,
    minDelaySeconds: 35,
    maxDelaySeconds: 80,
    pauseOnRisk: 62
  },
  {
    dayNumber: 3,
    label: "Dia 3",
    stage: CampaignWarmupStage.DAY_3,
    dailyLimit: 80,
    throughputCap: 28,
    minDelaySeconds: 25,
    maxDelaySeconds: 70,
    pauseOnRisk: 70
  }
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toJson(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function extractPrefixedValues(tags: string[], prefix: string) {
  return [...new Set(
    tags
      .map((tag) => tag.trim())
      .filter((tag) => normalizeTag(tag).startsWith(`${prefix}:`))
      .map((tag) => toTitleCase(tag.split(":").slice(1).join(":")))
      .filter(Boolean)
  )].sort();
}

function getStageLabel(stage: CampaignWarmupStage) {
  switch (stage) {
    case CampaignWarmupStage.DAY_1:
      return "Aquecimento inicial";
    case CampaignWarmupStage.DAY_2:
      return "Expansao gradual";
    case CampaignWarmupStage.DAY_3:
      return "Escala supervisionada";
    case CampaignWarmupStage.STABLE:
      return "Estavel";
    case CampaignWarmupStage.COOLDOWN:
      return "Cooldown";
    case CampaignWarmupStage.PAUSED:
      return "Pausado";
    default:
      return "Dormente";
  }
}

function getPipelineLabel(stage: CampaignPipelineStage) {
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

export function flattenAudience(input: {
  tags?: string[];
  groups?: string[];
  priorities?: string[];
  locations?: string[];
  interests?: string[];
  contactTypes?: string[];
}) {
  return [
    ...(input.tags ?? []),
    ...(input.groups ?? []),
    ...(input.priorities ?? []),
    ...(input.locations ?? []),
    ...(input.interests ?? []),
    ...(input.contactTypes ?? [])
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function countAudienceContacts(
  mandateId: string,
  audience: Parameters<typeof flattenAudience>[0]
) {
  const terms = [...new Set(flattenAudience(audience).map(normalizeTag))];

  return prisma.contact.count({
    where: {
      mandateId,
      optIn: true,
      status: "ACTIVE",
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

async function seedWarmupRules(mandateId: string) {
  const count = await prisma.warmupRule.count({
    where: { mandateId }
  });

  if (count > 0) {
    return;
  }

  await prisma.warmupRule.createMany({
    data: DEFAULT_WARMUP_RULES.map((rule) => ({
      mandateId,
      ...rule
    }))
  });
}

export async function ensureCampaignInfrastructure(mandateId: string, phoneNumber: string) {
  await seedWarmupRules(mandateId);

  return ensureReputationProfile(mandateId, phoneNumber);
}

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
      metadata: toJson(input.metadata)
    }
  });
}

export async function getAudienceDimensionOptions(mandateId: string) {
  const contacts = await prisma.contact.findMany({
    where: { mandateId },
    select: {
      tags: true
    }
  });

  const allTags = contacts.flatMap((contact) => contact.tags.map((tag) => tag.trim()).filter(Boolean));
  const tags = [...new Set(allTags.filter((tag) => !tag.includes(":")).map(toTitleCase))].sort();

  return {
    tags,
    groups: extractPrefixedValues(allTags, "grupo"),
    priorities: extractPrefixedValues(allTags, "prioridade"),
    locations: extractPrefixedValues(allTags, "local"),
    interests: extractPrefixedValues(allTags, "interesse"),
    contactTypes: extractPrefixedValues(allTags, "tipo")
  };
}

function deriveOperationalStage(input: {
  campaignStatus: CampaignStatus;
  riskScore: number;
  failedCount: number;
  pendingCount: number;
}) {
  if (input.campaignStatus === CampaignStatus.COMPLETED || input.pendingCount === 0) {
    return CampaignPipelineStage.COMPLETED;
  }

  if (input.campaignStatus === CampaignStatus.PAUSED) {
    return CampaignPipelineStage.PAUSED;
  }

  if (input.riskScore >= 70) {
    return CampaignPipelineStage.RISK_DETECTED;
  }

  if (input.failedCount >= 3) {
    return CampaignPipelineStage.THROTTLED;
  }

  if (input.campaignStatus === CampaignStatus.RUNNING) {
    return CampaignPipelineStage.SENDING;
  }

  return CampaignPipelineStage.WARMING;
}

export async function syncCampaignOperationState(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        select: {
          status: true
        }
      },
      mandate: {
        select: {
          whatsappNumber: true
        }
      }
    }
  });

  if (!campaign) {
    return null;
  }

  const engine = await runAdaptiveReputationEngine({
    mandateId: campaign.mandateId,
    campaignId,
    logAdjustment: false
  });
  const profile = engine.profile;
  const pendingCount = campaign.recipients.filter((recipient) => recipient.status === "PENDING").length;
  const totalCount = campaign.recipients.length;
  const sentCount = campaign.recipients.filter((recipient) => recipient.status === "SENT").length;
  const failedCount = campaign.recipients.filter((recipient) => recipient.status === "FAILED").length;
  const baseRisk = clamp(
    profile.spamRisk + failedCount * 9 + (campaign.status === CampaignStatus.PAUSED ? 16 : 0),
    4,
    92
  );
  const deliveryRate = totalCount === 0 ? 100 : clamp(Math.round((sentCount / totalCount) * 100), 0, 100);
  const pipelineStage = deriveOperationalStage({
    campaignStatus: campaign.status,
    riskScore: baseRisk,
    failedCount,
    pendingCount
  });
  const humanReviewNeeded = pipelineStage === CampaignPipelineStage.RISK_DETECTED || baseRisk >= 78;
  const failsafeTriggered = pipelineStage === CampaignPipelineStage.THROTTLED || humanReviewNeeded;
  const recommendedAction = humanReviewNeeded
    ? "Revisar qualidade do segmento, reduzir throughput e confirmar saude do numero."
    : pipelineStage === CampaignPipelineStage.THROTTLED
      ? "Aumentar cooldown e estabilizar a fila antes de retomar."
      : "Manter distribuicao gradual com delays humanizados.";

  return prisma.campaignOperationState.upsert({
    where: {
      campaignId
    },
    update: {
      pipelineStage,
      riskScore: baseRisk,
      spamProbability: clamp(baseRisk - 4, 0, 100),
      deliveryRate,
      queuePressure: clamp(pendingCount * 7, 0, 100),
      activeThroughput: clamp(Math.min(profile.activeThroughput, campaign.dailyLimit), 1, 200),
      safeThroughput: clamp(Math.max(profile.safeThroughput, campaign.dailyLimit), 1, 250),
      currentDelayMin: profile.humanizedDelayMin,
      currentDelayMax: Math.max(profile.humanizedDelayMax, campaign.delaySeconds),
      cooldownMinutes: engine.trustRecoveryState?.status === "ACTIVE" ? 90 : baseRisk >= 70 ? 45 : failedCount > 0 ? 20 : 12,
      failsafeTriggered,
      humanReviewNeeded,
      recommendedAction,
      pausedReason: campaign.status === CampaignStatus.PAUSED ? "Pausa manual ou preventiva em vigor." : null,
      lastEvaluatedAt: new Date()
    },
    create: {
      campaignId,
      pipelineStage,
      riskScore: baseRisk,
      spamProbability: clamp(baseRisk - 4, 0, 100),
      deliveryRate,
      queuePressure: clamp(pendingCount * 7, 0, 100),
      activeThroughput: clamp(Math.min(profile.activeThroughput, campaign.dailyLimit), 1, 200),
      safeThroughput: clamp(Math.max(profile.safeThroughput, campaign.dailyLimit), 1, 250),
      currentDelayMin: profile.humanizedDelayMin,
      currentDelayMax: Math.max(profile.humanizedDelayMax, campaign.delaySeconds),
      cooldownMinutes: engine.trustRecoveryState?.status === "ACTIVE" ? 90 : baseRisk >= 70 ? 45 : failedCount > 0 ? 20 : 12,
      failsafeTriggered,
      humanReviewNeeded,
      recommendedAction,
      pausedReason: campaign.status === CampaignStatus.PAUSED ? "Pausa manual ou preventiva em vigor." : null,
      lastEvaluatedAt: new Date()
    }
  });
}

export async function getInfrastructureSnapshot(mandateId: string, phoneNumber: string) {
  await ensureCampaignInfrastructure(mandateId, phoneNumber);
  const engine = await runAdaptiveReputationEngine({
    mandateId,
    logAdjustment: false
  });

  const [warmupRules, campaigns, eventLogs, recentSimulations] = await Promise.all([
    prisma.warmupRule.findMany({
      where: { mandateId },
      orderBy: { dayNumber: "asc" }
    }),
    prisma.campaign.findMany({
      where: { mandateId },
      include: {
        operationState: true,
        audienceConfig: true,
        recipients: {
          select: {
            status: true
          }
        },
        template: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 6
    }),
    prisma.campaignEventLog.findMany({
      where: { mandateId },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.campaignSafetySimulation.findMany({
      where: {
        campaign: {
          mandateId
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })
  ]);
  const profile = engine.profile;

  const activeCampaigns = campaigns.filter((campaign) =>
    ["RUNNING", "SCHEDULED", "PAUSED", "DRAFT"].includes(campaign.status)
  );
  const queuePressure = activeCampaigns.reduce((total, campaign) => {
    return total + campaign.recipients.filter((recipient) => recipient.status === "PENDING").length;
  }, 0);

  const averageSafetyScore =
    recentSimulations.length > 0
      ? Math.round(
          recentSimulations.reduce((total, simulation) => total + simulation.safetyScore, 0) / recentSimulations.length
        )
      : Math.round((profile.reputationScore + profile.deliveryHealth) / 2);
  const blockedCampaigns = recentSimulations.filter((simulation) => simulation.riskLevel === "CRITICAL").length;
  const riskTrendLabel =
    engine.riskTrend === CampaignRiskTrend.IMPROVING
      ? "improving"
      : engine.riskTrend === CampaignRiskTrend.WORSENING
        ? "worsening"
        : "stable";

  return {
    profile: {
      ...profile,
      stageLabel: getStageLabel(profile.warmingStage)
    },
    metrics: {
      deliveryRate: profile.deliveryHealth,
      reputationScore: profile.reputationScore,
      spamProbability: profile.spamRisk,
      activeThroughput: profile.activeThroughput,
      safeThroughput: profile.safeThroughput,
      humanizedDelay: `${profile.humanizedDelayMin}s - ${profile.humanizedDelayMax}s`,
      campaignHealth: clamp(Math.round((profile.reputationScore + profile.deliveryHealth) / 2), 0, 100),
      safeContactsReached: activeCampaigns.reduce((total, campaign) => total + campaign.sentCount, 0),
      blockRisk: profile.blockRisk,
      queuePressure: clamp(queuePressure * 6, 0, 100),
      trustLevel: profile.trustLevel,
      qualityRating: profile.qualityRating,
      trendDelta: profile.trendDelta,
      safetyScoreAverage: averageSafetyScore,
      blockedCampaigns,
      numbersInTrustRecovery: engine.trustRecoveryState?.status === "ACTIVE" ? 1 : 0,
      recommendedThroughput: profile.safeThroughput,
      riskTrend: riskTrendLabel
    },
    warmupRules: warmupRules.map((rule) => ({
      ...rule,
      stageLabel: getStageLabel(rule.stage)
    })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      templateName: campaign.template.name,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      pendingCount: campaign.recipients.filter((recipient) => recipient.status === "PENDING").length,
      operationState: campaign.operationState
        ? {
            ...campaign.operationState,
            pipelineLabel: getPipelineLabel(campaign.operationState.pipelineStage)
          }
        : null,
      audience: campaign.audienceConfig
        ? flattenAudience(campaign.audienceConfig)
        : campaign.segmentTags
    })),
    trustRecovery: engine.trustRecoveryState
      ? {
          status: engine.trustRecoveryState.status,
          reason: engine.trustRecoveryState.reason,
          recommendedLimit: engine.trustRecoveryState.recommendedLimit,
          cooldownUntil: engine.trustRecoveryState.cooldownUntil,
          recoverySteps: Array.isArray(engine.trustRecoveryState.recoverySteps)
            ? (engine.trustRecoveryState.recoverySteps as string[])
            : []
        }
      : null,
    logs: eventLogs.map((entry) => ({
      ...entry,
      levelLabel:
        entry.level === OperationEventLevel.CRITICAL
          ? "Critico"
          : entry.level === OperationEventLevel.WARN
            ? "Alerta"
            : entry.level === OperationEventLevel.STABLE
              ? "Estavel"
              : "Info"
    }))
  };
}

export async function bootstrapCampaignEvents(mandateId: string) {
  const count = await prisma.campaignEventLog.count({
    where: { mandateId }
  });

  if (count > 0) {
    return;
  }

  const now = Date.now();
  const seedEvents = [
    {
      level: OperationEventLevel.INFO,
      eventType: "campaign.started",
      title: "Campanha iniciada",
      message: "Pipeline armado para distribuir templates com pacing progressivo.",
      recommendedAction: "Monitorar throughput nos primeiros lotes."
    },
    {
      level: OperationEventLevel.STABLE,
      eventType: "warmup.increased",
      title: "Warmup aumentado",
      message: "Limite operacional evoluiu para a proxima faixa segura de aquecimento.",
      recommendedAction: "Manter janela de envio e delays organicos."
    },
    {
      level: OperationEventLevel.INFO,
      eventType: "delay.adjusted",
      title: "Delay ajustado",
      message: "Humanization layer aumentou a variacao entre mensagens para reduzir padrao mecanico.",
      recommendedAction: "Observar estabilidade de leitura e entrega."
    },
    {
      level: OperationEventLevel.WARN,
      eventType: "risk.detected",
      title: "Risco detectado",
      message: "Padrao de resposta abaixo da media acionou reducao preventiva de throughput.",
      recommendedAction: "Revisar segmento e cadencia antes de voltar a escalar."
    },
    {
      level: OperationEventLevel.INFO,
      eventType: "campaign.paused",
      title: "Campanha pausada",
      message: "Failsafe operacional pausou o fluxo para evitar degradacao reputacional.",
      recommendedAction: "Aguardar cooldown e revisar os contatos do lote."
    },
    {
      level: OperationEventLevel.STABLE,
      eventType: "reputation.stable",
      title: "Reputacao estabilizada",
      message: "Numero voltou para faixa segura apos ajuste de delays e filtragem do publico.",
      recommendedAction: "Retomar progressivamente com supervisao."
    }
  ];

  await prisma.campaignEventLog.createMany({
    data: seedEvents.map((event, index) => ({
      mandateId,
      ...event,
      createdAt: new Date(now - index * 1000 * 60 * 18)
    }))
  });
}
