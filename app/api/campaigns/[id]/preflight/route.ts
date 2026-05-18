import { OperationEventLevel } from "@prisma/client";

import { apiError, apiSuccess, parseRouteId, readJson } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { appendCampaignEvent } from "@/lib/campaign-infrastructure";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

    const simulation = await runCampaignSafetySimulation({
      mandateId,
      campaignId,
      persist: true,
      submitForReview
    });

    await appendCampaignEvent({
      mandateId,
      campaignId,
      level:
        simulation.riskLevel === "CRITICAL"
          ? OperationEventLevel.CRITICAL
          : simulation.requiresHumanReview
            ? OperationEventLevel.WARN
            : OperationEventLevel.INFO,
      eventType: submitForReview ? "campaign.review_requested" : "campaign.preflight_completed",
      title: submitForReview ? "Campanha enviada para revisao humana" : "Analise de seguranca antes do envio",
      message: `Preflight concluido com risco ${simulation.riskLevel.toLowerCase()} e score ${simulation.safetyScore}.`,
      recommendedAction:
        simulation.recommendations[0] ??
        "Aplicar o plano seguro recomendado antes de iniciar o envio."
    });

    return apiSuccess({
      simulation,
      message: submitForReview
        ? "Campanha encaminhada para revisao humana."
        : "Analise preflight concluida."
    });
  } catch (error) {
    return apiError(error);
  }
}
