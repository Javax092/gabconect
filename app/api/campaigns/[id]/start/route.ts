import {
  CampaignPipelineStage,
  CampaignStatus,
  OperationEventLevel,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";
import { createCampaignRecipients, syncCampaignCounters } from "@/lib/whatsapp-campaigns";
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

    if (campaign.template.status !== WhatsAppTemplateStatus.APPROVED) {
      throw new ApiRouteError(
        400,
        "A campanha só pode iniciar com template aprovado pela Meta.",
        "TEMPLATE_NOT_APPROVED"
      );
    }

    const simulation = await runCampaignSafetySimulation({
      mandateId,
      campaignId: campaign.id,
      persist: true
    });

    if (simulation.riskLevel === "CRITICAL" || simulation.blockingReasons.length > 0) {
      await prisma.campaign.update({
        where: {
          id: campaign.id
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
      await prisma.campaignOperationState.upsert({
        where: {
          campaignId: campaign.id
        },
        update: {
          pipelineStage: CampaignPipelineStage.RISK_DETECTED,
          humanReviewNeeded: simulation.requiresHumanReview,
          recommendedAction: simulation.recommendations[0] ?? "Corrigir sinais de risco antes de retomar.",
          pausedReason: simulation.blockingReasons.join(" ")
        },
        create: {
          campaignId: campaign.id,
          pipelineStage: CampaignPipelineStage.RISK_DETECTED,
          humanReviewNeeded: simulation.requiresHumanReview,
          recommendedAction: simulation.recommendations[0] ?? "Corrigir sinais de risco antes de retomar.",
          pausedReason: simulation.blockingReasons.join(" ")
        }
      });
      await appendCampaignEvent({
        mandateId,
        campaignId: campaign.id,
        level: OperationEventLevel.CRITICAL,
        eventType: "campaign.blocked",
        title: "Start bloqueado por risco critico",
        message: simulation.blockingReasons.join(" "),
        recommendedAction: simulation.recommendations[0] ?? "Aplicar plano de recuperacao e revisar a campanha."
      });

      throw new ApiRouteError(
        409,
        simulation.blockingReasons[0] ?? "A campanha foi bloqueada pela analise de seguranca.",
        "CRITICAL_RISK_BLOCKED"
      );
    }

    if (simulation.requiresHumanReview) {
      await prisma.campaign.update({
        where: {
          id: campaign.id
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
      await prisma.campaignOperationState.upsert({
        where: {
          campaignId: campaign.id
        },
        update: {
          pipelineStage: CampaignPipelineStage.HUMAN_REVIEW,
          humanReviewNeeded: true,
          recommendedAction: simulation.recommendations[0] ?? "Aguardar revisao humana antes do start.",
          pausedReason: "Preflight exigiu revisao humana obrigatoria."
        },
        create: {
          campaignId: campaign.id,
          pipelineStage: CampaignPipelineStage.HUMAN_REVIEW,
          humanReviewNeeded: true,
          recommendedAction: simulation.recommendations[0] ?? "Aguardar revisao humana antes do start.",
          pausedReason: "Preflight exigiu revisao humana obrigatoria."
        }
      });
      await appendCampaignEvent({
        mandateId,
        campaignId: campaign.id,
        level: OperationEventLevel.WARN,
        eventType: "campaign.review_required",
        title: "Revisao humana obrigatoria",
        message: "A campanha foi encaminhada para revisao humana antes da liberacao operacional.",
        recommendedAction: simulation.recommendations[0] ?? "Validar conteudo, template e audiencia."
      });

      return apiSuccess(
        {
          simulation,
          message: "Preflight concluido. A campanha foi movida para revisao humana."
        },
        202
      );
    }

    const recipientSummary = await createCampaignRecipients(
      campaign.id,
      mandateId,
      campaign.segmentTags
    );

    if (recipientSummary.eligibleContacts === 0) {
      throw new ApiRouteError(
        400,
        "Nenhum contato elegível encontrado. Verifique opt-in, status e tags do segmento.",
        "NO_ELIGIBLE_CONTACTS"
      );
    }

    const updatedCampaign = await prisma.campaign.update({
      where: {
        id: campaign.id
      },
      data: {
        status: CampaignStatus.RUNNING,
        dailyLimit: Math.min(campaign.dailyLimit, simulation.recommendedDailyLimit),
        delaySeconds: simulation.recommendedDelayMinSeconds
      }
    });

    await syncCampaignCounters(campaign.id);
    await syncCampaignOperationState(campaign.id);
    await appendCampaignEvent({
      mandateId,
      campaignId: campaign.id,
      eventType: "campaign.started",
      title: "Campanha iniciada",
      message: "Pipeline liberado com plano seguro recomendado, warmup supervisionado e throughput adaptativo.",
      recommendedAction:
        simulation.recommendations[0] ??
        "Monitorar reputacao, delays e estabilidade nos primeiros lotes."
    });

    return apiSuccess({
      campaign: updatedCampaign,
      simulation,
      createdRecipients: recipientSummary.createdRecipients,
      eligibleContacts: recipientSummary.eligibleContacts,
      message: "Campanha iniciada com plano seguro recomendado. Use o endpoint send-next para processar envios com throughput adaptativo."
    });
  } catch (error) {
    return apiError(error);
  }
}
