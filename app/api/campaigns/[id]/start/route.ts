import { CampaignStatus, Role, type CampaignMode } from "@prisma/client";

import {
  ApiRouteError,
  apiError,
  apiSuccess,
  parseRouteId,
  readJson,
} from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import {
  assertBusinessHours,
  assertRealCampaignDeliveryReadiness,
  getCampaignAudiencePreview,
  isWithinBusinessHours,
  resolveAudienceFilterByMode,
  queueCampaignRecipients,
} from "@/lib/campaign-execution";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";
import {
  getCampaignModeDailyCap,
  isMassCampaignEnabled,
} from "@/lib/mass-campaign-config";
import { assertRateLimit, getClientIp } from "@/lib/security";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isCampaignTestBusinessHoursBypassEnabled(input: {
  role: Role;
  campaignMode: CampaignMode;
  campaignId: string;
}) {
  const checks = {
    nonProduction: process.env.NODE_ENV !== "production",
    envEnabled: process.env.CAMPAIGN_TEST_BYPASS_BUSINESS_HOURS === "true",
    adminUser: input.role === Role.ADMIN,
    testCampaign: input.campaignMode === "TEST",
  };

  const allowed =
    checks.nonProduction &&
    checks.envEnabled &&
    checks.adminUser &&
    checks.testCampaign;

  if (allowed) {
    console.info("[campaign:start:bypass-business-hours-enabled]", {
      campaignId: input.campaignId,
      campaignMode: input.campaignMode,
    });
  } else {
    console.warn("[campaign:start:bypass-business-hours-denied]", {
      campaignId: input.campaignId,
      campaignMode: input.campaignMode,
      checks,
    });
  }

  return allowed;
}

function getTemplateVariables(body: string) {
  return Array.from(body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)).map(
    (match) => match[1],
  );
}

function campaignStartDetails(input: {
  campaignId: string | null;
  mandateId: string | null;
  reason: string;
  details?: unknown;
}) {
  return {
    campaignId: input.campaignId,
    mandateId: input.mandateId,
    reason: input.reason,
    ...(input.details === undefined ? {} : { details: input.details }),
  };
}

const STARTABLE_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.SCHEDULED,
  CampaignStatus.PAUSED,
];

export async function POST(request: Request, context: RouteContext) {
  let campaignIdForFailure: string | null = null;
  let mandateIdForFailure: string | null = null;
  let campaignMarkedRunning = false;

  try {
    assertRateLimit({
      key: `campaign:start:${getClientIp(request)}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });

    const body = await readJson(request).catch(() => ({}));

    const confirmedAudience = Boolean(
      body && typeof body === "object" && "confirmedAudience" in body
        ? (body as { confirmedAudience?: unknown }).confirmedAudience
        : false,
    );

    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const { id } = await context.params;
    const campaignId = parseRouteId(id);

    campaignIdForFailure = campaignId;
    mandateIdForFailure = mandateId;

    if (user.role !== Role.ADMIN) {
      throw new ApiRouteError(
        403,
        "Usuário sem permissão ADMIN para iniciar campanhas.",
        "ADMIN_REQUIRED",
        { role: user.role },
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, mandateId },
      include: {
        template: true,
        audienceConfig: true,
      },
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    if (!STARTABLE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new ApiRouteError(
        409,
        `Campanha em status inválido para iniciar: ${campaign.status}.`,
        "INVALID_CAMPAIGN_STATUS",
        { status: campaign.status },
      );
    }

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
    const isManualSelection = selectedContactIds.length > 0;

    const effectiveSelectedContactIds =
      campaign.campaignMode === "TEST" && !isManualSelection
        ? []
        : selectedContactIds;

    const audiencePreview = await getCampaignAudiencePreview({
      mandateId,
      campaignId: campaign.id,
      templateBody: campaign.template.body,
      audienceFilter,
      selectedContactIds: effectiveSelectedContactIds,
      selectedOnly: isManualSelection,
      showOnlyEligible: false,
    });

    console.info("[campaign:start:resolved]", {
      campaignId: campaign.id,
      campaignMode: campaign.campaignMode,
      templateName: campaign.template.metaTemplateName,
      templateId: campaign.template.id,
      selectedContactCount: selectedContactIds.length,
      selectedOnly: isManualSelection,
      birthdayMonthDay: audienceFilter.birthdayMonthDay ?? null,
      audienceMatched: audiencePreview.totalMatched,
      audienceEligible: audiencePreview.totalElegiveis,
    });

    if (campaign.campaignMode === "TEST" && selectedContactIds.length === 0) {
      throw new ApiRouteError(
        400,
        "Selecione pelo menos um contato para o modo TEST.",
        "TEST_NO_SELECTED_CONTACTS",
      );
    }

    if (campaign.campaignMode === "TEST" && selectedContactIds.length > 5) {
      throw new ApiRouteError(
        409,
        "Campanha TEST limitada a 5 contatos selecionados.",
        "TEST_TOO_MANY_SELECTED_CONTACTS",
        {
          selectedContactIds: selectedContactIds.length,
          maxSelectedContactIds: 5,
        },
      );
    }

    if (
      campaign.campaignMode === "BIRTHDAY" &&
      audiencePreview.totalElegiveis === 0
    ) {
      throw new ApiRouteError(
        400,
        "Nenhum aniversariante elegível.",
        "BIRTHDAY_NO_ELIGIBLE",
      );
    }

    if (
      campaign.campaignMode === "AUDIENCE" &&
      audiencePreview.totalElegiveis === 0
    ) {
      throw new ApiRouteError(
        400,
        "Nenhum contato elegível.",
        "AUDIENCE_NO_ELIGIBLE",
      );
    }

    const safetySummary = {
      totalContatos: audiencePreview.totalMatched,
      totalElegivel: audiencePreview.totalElegiveis,
      totalBloqueado: audiencePreview.totalBloqueados,
      totalOptOut: audiencePreview.totalOptOut,
      estimatedDurationMinutes: Math.ceil(
        (audiencePreview.totalElegiveis * Math.max(campaign.delaySeconds, 1)) /
          60,
      ),
      campaignMode: campaign.campaignMode,
      modeDailyCap: getCampaignModeDailyCap(campaign.campaignMode),
    };

    if (!isMassCampaignEnabled() && campaign.campaignMode !== "TEST") {
      throw new ApiRouteError(
        409,
        "Campanhas em massa desabilitadas.",
        "MASS_CAMPAIGN_DISABLED",
        safetySummary,
      );
    }

    if (!confirmedAudience) {
      throw new ApiRouteError(
        400,
        "Confirme a audiência.",
        "AUDIENCE_CONFIRMATION_REQUIRED",
        safetySummary,
      );
    }

    const simulation = await runCampaignSafetySimulation({
      mandateId,
      campaignId: campaign.id,
      persist: true,
    });

    console.log("[campaign:risk:evaluation]", {
      campaignId: campaign.id,
      campaignMode: campaign.campaignMode,
      status: campaign.status,
      templateName: campaign.template?.metaTemplateName,
      templateStatus: campaign.template?.status,
      audienceMatched: audiencePreview.totalMatched,
      audienceEligible: audiencePreview.totalElegiveis,
      audienceBlocked: audiencePreview.totalBloqueados,
      audienceOptOut: audiencePreview.totalOptOut,
      riskLevel: simulation.riskLevel,
      safetyScore: simulation.safetyScore,
      blockingReasons: simulation.blockingReasons,
      recommendations: simulation.recommendations,
    });

    if (simulation.riskLevel === "CRITICAL") {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.PAUSED },
      });

      throw new ApiRouteError(
        409,
        "Bloqueado por risco crítico. Verifique os motivos da simulação de segurança.",
        "CRITICAL_RISK_BLOCKED",
        {
          riskLevel: simulation.riskLevel,
          safetyScore: simulation.safetyScore,
          blockingReasons: simulation.blockingReasons,
          recommendations: simulation.recommendations,
          audience: {
            totalMatched: audiencePreview.totalMatched,
            totalEligible: audiencePreview.totalElegiveis,
            totalBlocked: audiencePreview.totalBloqueados,
            totalOptOut: audiencePreview.totalOptOut,
          },
          template: {
            name: campaign.template?.metaTemplateName,
            status: campaign.template?.status,
            language: campaign.template?.language,
          },
        },
      );
    }

    const bypassBusinessHours = !isWithinBusinessHours()
      ? isCampaignTestBusinessHoursBypassEnabled({
          role: user.role,
          campaignMode: campaign.campaignMode,
          campaignId: campaign.id,
        })
      : false;

    if (!bypassBusinessHours) {
      assertBusinessHours();
    }

    console.info("[campaign-start-template]", {
      campaignId: campaign.id,
      templateId: campaign.template.id,
      templateName: campaign.template.metaTemplateName,
      language: campaign.template.language,
      category: campaign.template.category,
      status: campaign.template.status,
      variables: getTemplateVariables(campaign.template.body),
      bodyHasVariables: getTemplateVariables(campaign.template.body).length > 0,
    });

    const readiness = await assertRealCampaignDeliveryReadiness({
      templateName: campaign.template.metaTemplateName,
      templateLanguage: campaign.template.language,
      templateStatus: campaign.template.status,
      templateCategory: campaign.template.category,
      templateBody: campaign.template.body,
    });

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.RUNNING },
    });
    campaignMarkedRunning = true;

    const queuedBatch = await queueCampaignRecipients({
      mandateId,
      campaignId: campaign.id,
      recommendedDailyLimit: simulation.recommendedDailyLimit,
      recommendedDelaySeconds: simulation.recommendedDelayMinSeconds,
      bypassBusinessHours,
    });

    if (queuedBatch.queuedCount <= 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.FAILED },
      });

      throw new ApiRouteError(
        409,
        "Nenhum envio foi enfileirado; campanha não iniciada.",
        "NO_DELIVERIES_QUEUED",
        {
          safeDailyLimit: queuedBatch.safeDailyLimit,
          recipientSummary: queuedBatch.recipientSummary,
        },
      );
    }

    console.info("[campaign:start:success]", {
      campaignId: campaign.id,
      mandateId,
      queuedDeliveries: queuedBatch.queuedCount,
      campaignMode: campaign.campaignMode,
    });

    // ⚠️ removido syncCampaignCounters (provável fonte de inconsistência)
    // await syncCampaignCounters(campaign.id);

    return apiSuccess({
      campaign: updatedCampaign,
      simulation,
      readiness,
      safetySummary,
      createdRecipients: queuedBatch.recipientSummary.createdRecipients,
      eligibleContacts: queuedBatch.recipientSummary.eligibleContacts,
      queuedDeliveries: queuedBatch.queuedCount,
    });
  } catch (error) {
    if (campaignMarkedRunning && campaignIdForFailure) {
      await prisma.campaign.update({
        where: { id: campaignIdForFailure },
        data: { status: CampaignStatus.FAILED },
      }).catch(() => undefined);
    }

    if (
      error instanceof ApiRouteError &&
      error.code === "TEMPLATE_INVALID"
    ) {
      console.error(
        "[campaign-start-template-invalid-details]",
        JSON.stringify(error.details ?? null, null, 2),
      );
    }

    if (error instanceof ApiRouteError) {
      const logPayload = campaignStartDetails({
        campaignId: campaignIdForFailure,
        mandateId: mandateIdForFailure,
        reason: error.code,
        details: error.details,
      });
      const logger = error.status >= 500 ? console.error : console.warn;
      logger("[campaign:start:blocked]", {
        ...logPayload,
        status: error.status,
        message: error.message,
      });
    } else {
      console.error("[campaign:start:blocked]", {
        campaignId: campaignIdForFailure,
        mandateId: mandateIdForFailure,
        reason: "UNEXPECTED_ERROR",
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    return apiError(error);
  }
}
