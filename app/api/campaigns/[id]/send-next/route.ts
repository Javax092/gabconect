import {
  CampaignStatus,
  OperationEventLevel,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { queueCampaignRecipients } from "@/lib/campaign-execution";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { assertRealSendInfrastructureReady } from "@/lib/operational-readiness";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        mandateId
      },
      include: {
        template: true
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new ApiRouteError(
        400,
        "A campanha precisa estar em execução para reabastecer a fila.",
        "INVALID_STATUS"
      );
    }

    if (campaign.template.status !== WhatsAppTemplateStatus.APPROVED) {
      throw new ApiRouteError(
        400,
        "Somente templates aprovados podem ser enviados em campanhas.",
        "TEMPLATE_NOT_APPROVED"
      );
    }

    await assertRealSendInfrastructureReady(mandateId);

    const simulation = await runCampaignSafetySimulation({
      mandateId,
      campaignId,
      persist: true
    });

    if (simulation.riskLevel === "CRITICAL" || simulation.blockingReasons.length > 0) {
      await prisma.campaign.update({
        where: {
          id: campaignId
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
      await appendCampaignEvent({
        mandateId,
        campaignId,
        level: OperationEventLevel.CRITICAL,
        eventType: "campaign.paused_for_risk",
        title: "Pausa preventiva por risco",
        message: simulation.blockingReasons.join(" "),
        recommendedAction: simulation.recommendations[0] ?? "Executar plano de recuperacao antes de novo lote."
      });
      await syncCampaignOperationState(campaignId);

      throw new ApiRouteError(
        409,
        simulation.blockingReasons[0] ?? "Envio interrompido por risco critico.",
        "CRITICAL_RISK_BLOCKED"
      );
    }

    if (simulation.requiresHumanReview) {
      await prisma.campaign.update({
        where: {
          id: campaignId
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
      await appendCampaignEvent({
        mandateId,
        campaignId,
        level: OperationEventLevel.WARN,
        eventType: "campaign.review_required",
        title: "Lote pausado para revisao humana",
        message: "O throughput foi interrompido porque a campanha passou a exigir revisao humana.",
        recommendedAction: simulation.recommendations[0] ?? "Revisar campanha antes de retomar."
      });
      await syncCampaignOperationState(campaignId);

      throw new ApiRouteError(
        409,
        "A campanha requer revisao humana antes do proximo lote.",
        "HUMAN_REVIEW_REQUIRED"
      );
    }

    const queuedBatch = await queueCampaignRecipients({
      mandateId,
      campaignId,
      recommendedDailyLimit: simulation.recommendedDailyLimit,
      recommendedDelaySeconds: simulation.recommendedDelayMinSeconds
    });

    await syncCampaignOperationState(campaignId);

    return apiSuccess({
      queuedDeliveries: queuedBatch.queuedCount,
      safeDailyLimit: queuedBatch.safeDailyLimit,
      message:
        queuedBatch.queuedCount > 0
          ? "Novo lote enfileirado com sucesso. O worker continua sendo o único ponto de envio."
          : "Nenhum novo delivery foi enfileirado neste momento."
    });
  } catch (error) {
    return apiError(error);
  }
}
