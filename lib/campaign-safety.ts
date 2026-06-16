import {
  CampaignPipelineStage,
  CampaignRiskLevel,
  CampaignRiskTrend,
  CampaignWarmupStage,
  OperationEventLevel,
  Prisma,
  TrustRecoveryStatus,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isApprovedTemplate } from "@/lib/whatsapp/templates";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 7;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return value / total;
}

function toJsonArray(values: string[]) {
  return values as Prisma.InputJsonValue;
}

function getWindowStart(days: number) {
  return new Date(Date.now() - days * DAY_MS);
}

function getAudienceTerms(audience: {
  tags?: string[];
  groups?: string[];
  priorities?: string[];
  locations?: string[];
  interests?: string[];
  contactTypes?: string[];
}) {
  return [
    ...(audience.tags ?? []),
    ...(audience.groups ?? []),
    ...(audience.priorities ?? []),
    ...(audience.locations ?? []),
    ...(audience.interests ?? []),
    ...(audience.contactTypes ?? [])
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function buildAudienceWhere(
  mandateId: string,
  audience: Parameters<typeof getAudienceTerms>[0] & {
    selectedContactIds?: string[];
  },
  optedOnly: boolean
): Prisma.ContactWhereInput {
  const terms = [...new Set(getAudienceTerms(audience))];

  return {
    mandateId,
    ...(audience.selectedContactIds && audience.selectedContactIds.length > 0
      ? {
          id: {
            in: audience.selectedContactIds
          }
        }
      : {}),
    ...(optedOnly
      ? {
          optIn: true,
          status: "ACTIVE"
        }
      : {}),
    ...(terms.length > 0
      ? {
          tags: {
            hasEvery: terms
          }
        }
      : {})
  };
}

function getWarmupRank(stage: CampaignWarmupStage) {
  switch (stage) {
    case CampaignWarmupStage.DAY_1:
      return 1;
    case CampaignWarmupStage.DAY_2:
      return 2;
    case CampaignWarmupStage.DAY_3:
      return 3;
    case CampaignWarmupStage.STABLE:
      return 4;
    case CampaignWarmupStage.COOLDOWN:
      return 0;
    case CampaignWarmupStage.PAUSED:
      return 0;
    default:
      return 1;
  }
}

function getRiskLevelFromScore(safetyScore: number) {
  if (safetyScore >= 80) return CampaignRiskLevel.LOW;
  if (safetyScore >= 62) return CampaignRiskLevel.MEDIUM;
  if (safetyScore >= 45) return CampaignRiskLevel.HIGH;
  return CampaignRiskLevel.CRITICAL;
}

function getDelayRange(level: CampaignRiskLevel, warmupStage: CampaignWarmupStage) {
  const rank = getWarmupRank(warmupStage);

  if (level === CampaignRiskLevel.LOW) {
    return {
      min: rank >= 4 ? 25 : 35,
      max: rank >= 4 ? 60 : 75
    };
  }

  if (level === CampaignRiskLevel.MEDIUM) {
    return {
      min: 45,
      max: rank >= 3 ? 110 : 130
    };
  }

  if (level === CampaignRiskLevel.HIGH) {
    return {
      min: 120,
      max: 300
    };
  }

  return {
    min: 240,
    max: 480
  };
}

function estimateSensitivity(input: {
  templateBody: string;
  audienceTerms: string[];
  templateCategory: WhatsAppTemplateCategory;
}) {
  const text = `${input.templateBody} ${input.audienceTerms.join(" ")}`.toLowerCase();
  const highSignals = [
    "saude",
    "vacina",
    "beneficio",
    "cadunico",
    "assistencia",
    "judicial",
    "denuncia",
    "idoso",
    "crianca",
    "documento"
  ];
  const matched = highSignals.some((signal) => text.includes(signal));

  if (matched) {
    return "high" as const;
  }

  if (input.templateCategory === WhatsAppTemplateCategory.AUTHENTICATION) {
    return "medium" as const;
  }

  return "low" as const;
}

function estimateTemplateQuality(input: {
  templateStatus: WhatsAppTemplateStatus;
  templateOperationallyApproved?: boolean;
  templateBody: string;
  failureRate: number;
  criticalEvents: number;
  optOuts: number;
}) {
  let score =
    input.templateStatus === WhatsAppTemplateStatus.APPROVED ||
    input.templateOperationallyApproved
      ? 84
      : 35;

  if (input.templateBody.trim().length < 80) {
    score -= 8;
  }

  if (input.failureRate >= 0.12) {
    score -= 18;
  } else if (input.failureRate >= 0.06) {
    score -= 10;
  }

  score -= Math.min(18, input.criticalEvents * 4);
  score -= Math.min(16, input.optOuts * 3);

  if (score >= 78) return { label: "high" as const, score };
  if (score >= 58) return { label: "medium" as const, score };
  return { label: "low" as const, score };
}

function formatCompletionEstimate(contactCount: number, dailyLimit: number, avgDelaySeconds: number) {
  if (contactCount <= 0 || dailyLimit <= 0) {
    return "Sem audiencia elegivel";
  }

  const days = Math.ceil(contactCount / dailyLimit);
  const hours = Math.max(1, Math.ceil((Math.min(contactCount, dailyLimit) * avgDelaySeconds) / 3600));

  if (days <= 1) {
    return `Hoje, em cerca de ${hours}h`;
  }

  return `${days} dias operacionais estimados`;
}

function getImpactLabel(nextScore: number, currentScore: number) {
  const delta = nextScore - currentScore;

  if (delta >= 4) {
    return "Melhora gradual esperada";
  }

  if (delta <= -8) {
    return "Queda material de reputacao se o plano for ignorado";
  }

  if (delta < 0) {
    return "Leve pressao reputacional esperada";
  }

  return "Impacto controlado dentro da faixa segura";
}

export async function ensureReputationProfile(mandateId: string, phoneNumber: string) {
  return prisma.numberReputationProfile.upsert({
    where: {
      mandateId
    },
    update: {
      phoneNumber,
      lastEvaluatedAt: new Date()
    },
    create: {
      mandateId,
      phoneNumber,
      lastEvaluatedAt: new Date()
    }
  });
}

export async function runAdaptiveReputationEngine(input: {
  mandateId: string;
  campaignId?: string;
  logAdjustment?: boolean;
  reason?: string;
}) {
  const mandate = await prisma.mandate.findUniqueOrThrow({
    where: {
      id: input.mandateId
    },
    select: {
      id: true,
      whatsappNumber: true
    }
  });
  const profile = await ensureReputationProfile(input.mandateId, mandate.whatsappNumber);
  const since24h = getWindowStart(1);
  const sinceRecent = getWindowStart(RECENT_WINDOW_DAYS);

  const [warmupRules, sent24h, failed24h, optOutsRecent, criticalEventsRecent, positiveEventsRecent, pausedByRiskRecent] =
    await Promise.all([
      prisma.warmupRule.findMany({
        where: {
          mandateId: input.mandateId,
          active: true
        },
        orderBy: {
          dayNumber: "asc"
        }
      }),
      prisma.campaignRecipient.count({
        where: {
          campaign: {
            mandateId: input.mandateId
          },
          status: "SENT",
          sentAt: {
            gte: since24h
          }
        }
      }),
      prisma.campaignRecipient.count({
        where: {
          campaign: {
            mandateId: input.mandateId
          },
          status: "FAILED",
          updatedAt: {
            gte: since24h
          }
        }
      }),
      prisma.optOutEvent.count({
        where: {
          mandateId: input.mandateId,
          createdAt: {
            gte: sinceRecent
          }
        }
      }),
      prisma.campaignEventLog.count({
        where: {
          mandateId: input.mandateId,
          level: OperationEventLevel.CRITICAL,
          createdAt: {
            gte: sinceRecent
          }
        }
      }),
      prisma.campaignEventLog.count({
        where: {
          mandateId: input.mandateId,
          level: OperationEventLevel.STABLE,
          createdAt: {
            gte: sinceRecent
          }
        }
      }),
      prisma.campaignEventLog.count({
        where: {
          mandateId: input.mandateId,
          eventType: {
            in: ["failsafe.triggered", "campaign.blocked", "campaign.review_required"]
          },
          createdAt: {
            gte: sinceRecent
          }
        }
      })
    ]);

  const processed24h = sent24h + failed24h;
  const failureRate24h = percent(failed24h, processed24h);
  const stableRule = warmupRules.find((rule) => rule.stage === CampaignWarmupStage.STABLE);
  const baseRule = warmupRules.find((rule) => rule.stage === profile.warmingStage) ?? stableRule ?? warmupRules.at(-1);
  const spamRisk = clamp(
    Math.round(
      12 +
        failureRate24h * 100 * 0.8 +
        optOutsRecent * 7 +
        criticalEventsRecent * 5 +
        pausedByRiskRecent * 6 -
        positiveEventsRecent * 1.5
    ),
    6,
    95
  );
  const deliveryHealth = clamp(
    Math.round(95 - failureRate24h * 100 * 1.3 - optOutsRecent * 2.5 - criticalEventsRecent * 2),
    20,
    99
  );
  const nextScore = clamp(
    Math.round(92 - spamRisk * 0.45 + deliveryHealth * 0.18 - Math.max(0, sent24h - 120) * 0.04),
    22,
    99
  );

  const recoveryNeeded =
    nextScore < 60 || spamRisk >= 55 || optOutsRecent >= 4 || failureRate24h >= 0.18 || criticalEventsRecent >= 3;

  const warmingStage = recoveryNeeded
    ? CampaignWarmupStage.COOLDOWN
    : sent24h >= 90
      ? CampaignWarmupStage.STABLE
      : sent24h >= 50
        ? CampaignWarmupStage.DAY_3
        : sent24h >= 25
          ? CampaignWarmupStage.DAY_2
          : CampaignWarmupStage.DAY_1;

  const throughputCap = baseRule?.throughputCap ?? 20;
  const dailyLimitBase = baseRule?.dailyLimit ?? 60;
  const safeThroughput = clamp(
    Math.round(throughputCap * (nextScore / 80) * (deliveryHealth / 90) * (recoveryNeeded ? 0.55 : 1)),
    6,
    120
  );
  const activeThroughput = clamp(Math.round(safeThroughput * (recoveryNeeded ? 0.6 : 0.82)), 4, safeThroughput);
  const delayProfile = getDelayRange(
    getRiskLevelFromScore(clamp(Math.round((nextScore + deliveryHealth) / 2), 0, 100)),
    warmingStage
  );
  const qualityRating =
    nextScore >= 80 ? "Saudavel" : nextScore >= 65 ? "Estavel" : nextScore >= 50 ? "Sensivel" : "Critica";
  const trustLevel =
    nextScore >= 80 ? "Protegido" : nextScore >= 65 ? "Supervisionado" : nextScore >= 50 ? "Restrito" : "Recuperacao";
  const trendDelta = nextScore - profile.reputationScore;
  const riskTrend =
    trendDelta >= 4
      ? CampaignRiskTrend.IMPROVING
      : trendDelta <= -4
        ? CampaignRiskTrend.WORSENING
        : CampaignRiskTrend.STABLE;
  const cooldownUntil = recoveryNeeded
    ? new Date(Date.now() + (spamRisk >= 70 ? 6 : 2) * 60 * 60 * 1000)
    : null;

  const updatedProfile = await prisma.numberReputationProfile.update({
    where: {
      id: profile.id
    },
    data: {
      reputationScore: nextScore,
      spamRisk,
      deliveryHealth,
      qualityRating,
      trustLevel,
      warmingStage,
      trendDelta,
      activeThroughput,
      safeThroughput,
      humanizedDelayMin: delayProfile.min,
      humanizedDelayMax: delayProfile.max,
      blockRisk: clamp(Math.round(spamRisk * 0.88), 5, 98),
      queuePressure: clamp(Math.round(processed24h / Math.max(1, dailyLimitBase) * 100), 10, 95),
      lastEvaluatedAt: new Date()
    }
  });

  const currentRecovery = await prisma.trustRecoveryState.findFirst({
    where: {
      profileId: profile.id,
      status: {
        in: [TrustRecoveryStatus.ACTIVE, TrustRecoveryStatus.MONITORING]
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  let trustRecoveryState = currentRecovery;

  if (recoveryNeeded) {
    const recoverySteps = [
      "Reduzir audiencia inicial e priorizar contatos com opt-in recente.",
      "Usar templates com melhor historico de entrega e clareza institucional.",
      "Aumentar delays e liberar lotes menores ate estabilizar a saude operacional."
    ];

    trustRecoveryState = currentRecovery
      ? await prisma.trustRecoveryState.update({
          where: {
            id: currentRecovery.id
          },
          data: {
            status: TrustRecoveryStatus.ACTIVE,
            endedAt: null,
            reason: "Protecao reputacional por score baixo, spam risk elevado ou incidentes recentes.",
            recommendedLimit: clamp(Math.round(dailyLimitBase * 0.45), 10, dailyLimitBase),
            cooldownUntil,
            recoverySteps: toJsonArray(recoverySteps)
          }
        })
      : await prisma.trustRecoveryState.create({
          data: {
            profileId: profile.id,
            mandateId: input.mandateId,
            status: TrustRecoveryStatus.ACTIVE,
            reason: "Protecao reputacional por score baixo, spam risk elevado ou incidentes recentes.",
            recommendedLimit: clamp(Math.round(dailyLimitBase * 0.45), 10, dailyLimitBase),
            cooldownUntil,
            recoverySteps: toJsonArray(recoverySteps)
          }
        });
  } else if (currentRecovery) {
    trustRecoveryState = await prisma.trustRecoveryState.update({
      where: {
        id: currentRecovery.id
      },
      data: {
        status: TrustRecoveryStatus.RECOVERED,
        endedAt: new Date(),
        cooldownUntil: null
      }
    });
  }

  if (input.logAdjustment && trendDelta !== 0) {
    await prisma.reputationAdjustmentLog.create({
      data: {
        profileId: profile.id,
        campaignId: input.campaignId,
        delta: trendDelta,
        reason:
          input.reason ??
          "Atualizacao heuristica da reputacao com base em entregas, falhas, opt-outs e eventos criticos.",
        severity:
          trendDelta <= -6
            ? OperationEventLevel.CRITICAL
            : trendDelta < 0
              ? OperationEventLevel.WARN
              : OperationEventLevel.STABLE,
        metadata: {
          failureRate24h,
          sent24h,
          optOutsRecent,
          criticalEventsRecent,
          riskTrend
        }
      }
    });
  }

  return {
    profile: updatedProfile,
    trustRecoveryState,
    riskTrend,
    cooldownUntil
  };
}

export async function runCampaignSafetySimulation(input: {
  mandateId: string;
  campaignId: string;
  persist?: boolean;
  submitForReview?: boolean;
}) {
  const engine = await runAdaptiveReputationEngine({
    mandateId: input.mandateId,
    campaignId: input.campaignId,
    logAdjustment: false
  });

  const campaign = await prisma.campaign.findFirstOrThrow({
    where: {
      id: input.campaignId,
      mandateId: input.mandateId
    },
    include: {
      template: true,
      audienceConfig: true,
      operationState: true
    }
  });

  const audienceConfig = campaign.audienceConfig ?? {
    tags: campaign.segmentTags,
    groups: [],
    priorities: [],
    locations: [],
    interests: [],
    contactTypes: [],
    selectedContactIds: []
  };
  const audienceTerms = getAudienceTerms(audienceConfig);
  const selectedContactIds = audienceConfig.selectedContactIds ?? [];
  const isSmallManualTest =
    campaign.campaignMode === "TEST" &&
    selectedContactIds.length > 0 &&
    selectedContactIds.length <= 5;
  const since24h = getWindowStart(1);
  const sinceRecent = getWindowStart(RECENT_WINDOW_DAYS);

  const [totalContacts, optedInContacts, recentProcessed, recentFailed, recentBlocks, recentOptOuts, latestBatchSentCount] =
    await Promise.all([
      prisma.contact.count({
        where: buildAudienceWhere(input.mandateId, audienceConfig, false)
      }),
      prisma.contact.count({
        where: buildAudienceWhere(input.mandateId, audienceConfig, true)
      }),
      prisma.campaignRecipient.count({
        where: {
          campaign: {
            mandateId: input.mandateId
          },
          status: {
            in: ["SENT", "FAILED"]
          },
          updatedAt: {
            gte: since24h
          }
        }
      }),
      prisma.campaignRecipient.count({
        where: {
          campaign: {
            mandateId: input.mandateId
          },
          status: "FAILED",
          updatedAt: {
            gte: since24h
          }
        }
      }),
      prisma.campaignEventLog.count({
        where: {
          mandateId: input.mandateId,
          OR: [
            {
              level: OperationEventLevel.CRITICAL
            },
            {
              eventType: {
                contains: "block"
              }
            }
          ],
          createdAt: {
            gte: sinceRecent
          }
        }
      }),
      prisma.optOutEvent.count({
        where: {
          mandateId: input.mandateId,
          createdAt: {
            gte: sinceRecent
          }
        }
      }),
      prisma.campaignRecipient.count({
        where: {
          campaignId: input.campaignId,
          status: "SENT",
          sentAt: {
            gte: since24h
          }
        }
      })
    ]);

  const profile = engine.profile;
  const optInRatio = totalContacts > 0 ? optedInContacts / totalContacts : 0;
  const failureRate24h = percent(recentFailed, recentProcessed);
  const sensitivity = estimateSensitivity({
    templateBody: campaign.template.body,
    audienceTerms,
    templateCategory: campaign.template.category
  });
  const templateOperationallyApproved =
    campaign.template.status === WhatsAppTemplateStatus.APPROVED ||
    isApprovedTemplate(campaign.template.metaTemplateName);
  const templateQuality = estimateTemplateQuality({
    templateStatus: campaign.template.status,
    templateOperationallyApproved,
    templateBody: campaign.template.body,
    failureRate: failureRate24h,
    criticalEvents: recentBlocks,
    optOuts: recentOptOuts
  });
  const currentThroughput = profile.activeThroughput;
  const volumePressure = optedInContacts > 0 ? currentThroughput / Math.max(1, optedInContacts) : 0;

  let safetyScore = 100;
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const blockingReasons: string[] = [];

  safetyScore -= Math.round((1 - optInRatio) * 30);
  safetyScore -= templateQuality.label === "low" ? 22 : templateQuality.label === "medium" ? 10 : 0;
  safetyScore -= profile.reputationScore < 60 ? 26 : profile.reputationScore < 72 ? 10 : 0;
  safetyScore -= failureRate24h >= 0.12 ? 18 : failureRate24h >= 0.06 ? 10 : 0;
  safetyScore -= recentBlocks * 4;
  safetyScore -= recentOptOuts * 3;
  safetyScore -= engine.trustRecoveryState?.status === TrustRecoveryStatus.ACTIVE ? 18 : 0;
  safetyScore -= sensitivity === "high" ? 10 : sensitivity === "medium" ? 4 : 0;
  safetyScore -= profile.warmingStage === CampaignWarmupStage.DAY_1 ? 8 : profile.warmingStage === CampaignWarmupStage.DAY_2 ? 4 : 0;

  const selectedTestHasInvalidConsent =
    isSmallManualTest && (totalContacts === 0 || optedInContacts !== totalContacts);
  const selectedTestHasTemplateBlock = isSmallManualTest && !templateOperationallyApproved;
  const selectedTestHasCriticalOperationalBlock =
    profile.reputationScore < 60 ||
    engine.trustRecoveryState?.status === TrustRecoveryStatus.ACTIVE ||
    selectedTestHasInvalidConsent ||
    selectedTestHasTemplateBlock;

  if (isSmallManualTest && !selectedTestHasCriticalOperationalBlock) {
    safetyScore = Math.max(safetyScore, sensitivity === "high" ? 62 : 72);
  }

  if (
    campaign.campaignMode === "TEST" &&
    (selectedContactIds.length === 0 ||
      selectedContactIds.length > 5 ||
      selectedTestHasInvalidConsent ||
      selectedTestHasTemplateBlock)
  ) {
    safetyScore = Math.min(safetyScore, 44);
  }

  safetyScore = clamp(safetyScore, 10, 99);

  const riskLevel = getRiskLevelFromScore(safetyScore);
  const riskDelay = getDelayRange(riskLevel, profile.warmingStage);
  const warmupMultiplier =
    profile.warmingStage === CampaignWarmupStage.DAY_1
      ? 0.45
      : profile.warmingStage === CampaignWarmupStage.DAY_2
        ? 0.62
        : profile.warmingStage === CampaignWarmupStage.DAY_3
          ? 0.82
          : profile.warmingStage === CampaignWarmupStage.STABLE
            ? 1
            : 0.35;
  const trustMultiplier = engine.trustRecoveryState?.status === TrustRecoveryStatus.ACTIVE ? 0.45 : 1;
  const qualityMultiplier = templateQuality.label === "high" ? 1 : templateQuality.label === "medium" ? 0.82 : 0.55;
  const reputationMultiplier = clamp(profile.reputationScore / 85, 0.4, 1.15);
  const baseDailyLimit = Math.min(campaign.dailyLimit, Math.max(20, profile.safeThroughput * 4));
  const recommendedDailyLimit = clamp(
    Math.round(baseDailyLimit * warmupMultiplier * trustMultiplier * qualityMultiplier * reputationMultiplier),
    10,
    Math.max(10, baseDailyLimit)
  );
  const recommendedBatchSize = clamp(
    Math.round(
      Math.min(recommendedDailyLimit, profile.safeThroughput) *
        (riskLevel === CampaignRiskLevel.LOW ? 1 : riskLevel === CampaignRiskLevel.MEDIUM ? 0.7 : 0.45)
    ),
    5,
    40
  );
  const recommendedStartTime =
    engine.trustRecoveryState?.cooldownUntil && engine.trustRecoveryState.cooldownUntil > new Date()
      ? engine.trustRecoveryState.cooldownUntil
      : null;
  const requiresHumanReview =
    sensitivity === "high" ||
    templateQuality.label === "low" ||
    riskLevel === CampaignRiskLevel.HIGH ||
    recentBlocks >= 2;
  const canStartNow =
    riskLevel !== CampaignRiskLevel.CRITICAL &&
    !recommendedStartTime &&
    profile.reputationScore >= 60 &&
    optedInContacts > 0;

  if (optInRatio < 0.75) {
    warnings.push("Parte relevante da audiencia nao possui opt-in ativo e ficara fora do envio.");
    recommendations.push("Revalidar consentimento antes de ampliar a campanha.");
  }

  if (templateQuality.label === "low") {
    warnings.push("O template apresenta sinais de baixa qualidade operacional.");
    recommendations.push("Trocar por um template aprovado com melhor historico de entrega.");
  }

  if (profile.reputationScore < 60) {
    blockingReasons.push("A reputacao operacional do numero esta abaixo de 60.");
    recommendations.push("Entrar em modo de recuperacao com lotes menores antes de nova escala.");
  }

  if (failureRate24h >= 0.12) {
    warnings.push("A taxa de falha recente esta acima da faixa segura.");
    recommendations.push("Pausar crescimento de volume e revisar template, publico e janela de envio.");
  }

  if (profile.warmingStage === CampaignWarmupStage.DAY_1 || profile.warmingStage === CampaignWarmupStage.DAY_2) {
    recommendations.push("Respeitar warmup progressivo antes de elevar o volume diario.");
  }

  if (optedInContacts > profile.safeThroughput * 4) {
    warnings.push("O tamanho da audiencia excede o throughput seguro atual e exige fracionamento.");
  }

  if (campaign.campaignMode === "TEST") {
    if (selectedContactIds.length === 0) {
      blockingReasons.push("Campanha TEST sem contatos selecionados.");
      recommendations.push("Selecionar ate 5 contatos elegiveis para teste controlado.");
    } else if (selectedContactIds.length > 5) {
      blockingReasons.push("Campanha TEST excede o limite seguro de 5 contatos selecionados.");
      recommendations.push("Reduzir a selecao de teste ou usar modo de audiencia com preflight completo.");
    } else {
      recommendations.push("TEST manual pequeno tratado como envio controlado, sem regra de volume massivo.");
    }

    if (selectedTestHasInvalidConsent) {
      blockingReasons.push("TEST possui contato selecionado sem opt-in ativo, bloqueado, invalido ou inexistente.");
      recommendations.push("Remover contatos inelegiveis antes de iniciar o teste.");
    }

    if (selectedTestHasTemplateBlock) {
      blockingReasons.push("Template do TEST nao esta aprovado localmente nem listado em WHATSAPP_APPROVED_TEMPLATES.");
      recommendations.push("Usar template aprovado antes de iniciar campanha TEST.");
    }
  }

  if (sensitivity === "high") {
    recommendations.push("Submeter a mensagem a revisao humana por tratar tema sensivel.");
  }

  if (engine.trustRecoveryState?.status === TrustRecoveryStatus.ACTIVE) {
    blockingReasons.push("O numero esta em modo de recuperacao de confianca.");
    recommendations.push("Usar campanhas menores e priorizar templates com melhor saude.");
  }

  if (riskLevel === CampaignRiskLevel.CRITICAL) {
    blockingReasons.push("A simulacao classificou a campanha como risco critico.");
  }

  const projectedScore = clamp(
    Math.round(profile.reputationScore + (riskLevel === CampaignRiskLevel.LOW ? 3 : riskLevel === CampaignRiskLevel.MEDIUM ? 0 : -7)),
    0,
    100
  );
  const estimatedCompletionTime = formatCompletionEstimate(
    optedInContacts,
    recommendedDailyLimit,
    Math.round((riskDelay.min + riskDelay.max) / 2)
  );
  const estimatedReputationImpact = getImpactLabel(projectedScore, profile.reputationScore);

  const simulationPayload = {
    riskLevel,
    safetyScore,
    recommendedDailyLimit,
    recommendedBatchSize,
    recommendedDelayMinSeconds: riskDelay.min,
    recommendedDelayMaxSeconds: riskDelay.max,
    recommendedStartTime,
    requiresHumanReview,
    canStartNow,
    estimatedCompletionTime,
    estimatedReputationImpact,
    warnings,
    recommendations,
    blockingReasons,
    inputs: {
      campaignId: input.campaignId,
      totalContacts,
      optedInContacts,
      templateQuality: templateQuality.label,
      currentReputationScore: profile.reputationScore,
      warmupStage: profile.warmingStage,
      last24hSentCount: latestBatchSentCount,
      last24hFailureRate: failureRate24h,
      recentBlocks,
      recentOptOuts,
      currentThroughput,
      campaignCategory: campaign.template.category,
      messageSensitivity: sensitivity,
      volumePressure
    }
  };

  let persistedSimulation = null;

  if (input.persist ?? true) {
    persistedSimulation = await prisma.campaignSafetySimulation.create({
      data: {
        campaignId: input.campaignId,
        riskLevel,
        safetyScore,
        recommendedDailyLimit,
        recommendedBatchSize,
        recommendedDelayMinSeconds: riskDelay.min,
        recommendedDelayMaxSeconds: riskDelay.max,
        recommendedStartTime,
        requiresHumanReview,
        canStartNow,
        estimatedCompletionTime,
        estimatedReputationImpact,
        warnings: toJsonArray(warnings),
        recommendations: toJsonArray(recommendations),
        blockingReasons: toJsonArray(blockingReasons)
      }
    });
  }

  if (input.submitForReview || requiresHumanReview) {
    await prisma.campaignOperationState.upsert({
      where: {
        campaignId: input.campaignId
      },
      update: {
        pipelineStage: CampaignPipelineStage.HUMAN_REVIEW,
        humanReviewNeeded: true,
        recommendedAction: "Revisao humana obrigatoria antes do inicio da campanha.",
        pausedReason: "Preflight identificou sensibilidade elevada ou sinais de risco."
      },
      create: {
        campaignId: input.campaignId,
        pipelineStage: CampaignPipelineStage.HUMAN_REVIEW,
        humanReviewNeeded: true,
        recommendedAction: "Revisao humana obrigatoria antes do inicio da campanha.",
        pausedReason: "Preflight identificou sensibilidade elevada ou sinais de risco."
      }
    });
  }

  return {
    ...simulationPayload,
    simulationId: persistedSimulation?.id ?? null,
    profile,
    trustRecoveryState: engine.trustRecoveryState,
    riskTrend: engine.riskTrend
  };
}

export async function getLatestCampaignSafetySimulation(campaignId: string) {
  return prisma.campaignSafetySimulation.findFirst({
    where: {
      campaignId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}
