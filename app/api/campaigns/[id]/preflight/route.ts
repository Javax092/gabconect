import { OperationEventLevel } from "@prisma/client";

import { apiError, apiSuccess, parseRouteId, readJson } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import {
  getCampaignAudiencePreview,
  resolveAudienceFilterByMode,
} from "@/lib/campaign-execution";
import { appendCampaignEvent } from "@/lib/campaign-infrastructure";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";
import { isMassCampaignEnabled } from "@/lib/mass-campaign-config";
import { prisma } from "@/lib/prisma";
import {
  getApprovedTemplateConfigSummary,
  isApprovedTemplate,
} from "@/lib/whatsapp/templates";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getEnvReadinessSummary(campaignMode: string) {
  const missing = [
    ...(!process.env.WHATSAPP_ACCESS_TOKEN && !process.env.WHATSAPP_TOKEN
      ? ["WHATSAPP_ACCESS_TOKEN"]
      : []),
    ...(!process.env.WHATSAPP_PHONE_NUMBER_ID
      ? ["WHATSAPP_PHONE_NUMBER_ID"]
      : []),
    ...(process.env.WHATSAPP_DRY_RUN?.trim().toLowerCase() === "true"
      ? ["WHATSAPP_DRY_RUN_TRUE"]
      : []),
    ...(!isMassCampaignEnabled() && campaignMode !== "TEST"
      ? ["WHATSAPP_MASS_CAMPAIGN_ENABLED"]
      : []),
  ];

  return {
    ready: missing.length === 0,
    dryRun: process.env.WHATSAPP_DRY_RUN?.trim().toLowerCase() === "true",
    whatsappAccessTokenConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN,
    ),
    whatsappPhoneNumberIdConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    massCampaignEnabled: isMassCampaignEnabled(),
    missing,
  };
}

async function buildPreflightPayload(input: {
  mandateId: string;
  campaignId: string;
  submitForReview?: boolean;
}) {
  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { id: input.campaignId, mandateId: input.mandateId },
    include: {
      template: true,
      audienceConfig: true,
    },
  });

  const audienceFilter = resolveAudienceFilterByMode({
    mode: campaign.campaignMode,
    selectedContactIds: campaign.audienceConfig?.selectedContactIds ?? [],
    birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
    tags: campaign.audienceConfig?.tags ?? campaign.segmentTags,
    groups: campaign.audienceConfig?.groups ?? [],
    priorities: campaign.audienceConfig?.priorities ?? [],
    locations: campaign.audienceConfig?.locations ?? [],
    interests: campaign.audienceConfig?.interests ?? [],
    contactTypes: campaign.audienceConfig?.contactTypes ?? [],
  });
  const selectedContactIds = audienceFilter.selectedContactIds ?? [];
  const audiencePreview = await getCampaignAudiencePreview({
    mandateId: input.mandateId,
    campaignId: campaign.id,
    templateBody: campaign.template.body,
    audienceFilter,
    selectedContactIds,
    selectedOnly: selectedContactIds.length > 0,
    showOnlyEligible: false,
  });

  const simulation = await runCampaignSafetySimulation({
    mandateId: input.mandateId,
    campaignId: input.campaignId,
    persist: true,
    submitForReview: input.submitForReview,
  });
  const envReadiness = getEnvReadinessSummary(campaign.campaignMode);
  const approvedTemplateConfig = getApprovedTemplateConfigSummary();
  const template = {
    name: campaign.template.metaTemplateName,
    status: campaign.template.status,
    language: campaign.template.language,
    approvedByEnv: isApprovedTemplate(campaign.template.metaTemplateName),
    approvedTemplateConfig,
  };
  const audience = {
    totalMatched: audiencePreview.totalMatched,
    totalEligible: audiencePreview.totalElegiveis,
    totalBlocked: audiencePreview.totalBloqueados,
    totalOptOut: audiencePreview.totalOptOut,
    totalSelected: selectedContactIds.length,
  };
  const canStart =
    simulation.canStartNow &&
    simulation.riskLevel !== "CRITICAL" &&
    simulation.blockingReasons.length === 0 &&
    audience.totalEligible > 0 &&
    envReadiness.ready;

  return {
    simulation,
    canStart,
    riskLevel: simulation.riskLevel,
    safetyScore: simulation.safetyScore,
    blockingReasons: simulation.blockingReasons,
    recommendations: simulation.recommendations,
    audience,
    template,
    envReadiness,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);
    const payload = await buildPreflightPayload({ mandateId, campaignId });

    return apiSuccess(payload);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);
    const body = await readJson(request).catch(() => ({}));
    const submitForReview = Boolean(
      body && typeof body === "object" && "submitForReview" in body ? body.submitForReview : false
    );

    const payload = await buildPreflightPayload({
      mandateId,
      campaignId,
      submitForReview,
    });

    await appendCampaignEvent({
      mandateId,
      campaignId,
      level:
        payload.simulation.riskLevel === "CRITICAL"
          ? OperationEventLevel.CRITICAL
          : payload.simulation.requiresHumanReview
            ? OperationEventLevel.WARN
            : OperationEventLevel.INFO,
      eventType: submitForReview ? "campaign.review_requested" : "campaign.preflight_completed",
      title: submitForReview ? "Campanha enviada para revisao humana" : "Analise de seguranca antes do envio",
      message: `Preflight concluido com risco ${payload.simulation.riskLevel.toLowerCase()} e score ${payload.simulation.safetyScore}.`,
      recommendedAction:
        payload.simulation.recommendations[0] ??
        "Aplicar o plano seguro recomendado antes de iniciar o envio."
    });

    return apiSuccess({
      ...payload,
      message: submitForReview
        ? "Campanha encaminhada para revisao humana."
        : "Analise preflight concluida."
    });
  } catch (error) {
    return apiError(error);
  }
}
