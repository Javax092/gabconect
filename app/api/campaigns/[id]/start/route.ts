import { NextResponse } from "next/server";
import {
  CampaignPipelineStage,
  CampaignStatus,
  OperationEventLevel,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getCampaignAudiencePreview, queueCampaignRecipients } from "@/lib/campaign-execution";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { assertRealCampaignStartReady } from "@/lib/operational-readiness";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";
import { syncCampaignCounters } from "@/lib/whatsapp-campaigns";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const body = await readJson(_request).catch(() => ({}));
    const confirmedAudience = Boolean(
      body && typeof body === "object" && "confirmedAudience" in body ? body.confirmedAudience : false
    );
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
        template: true,
        audienceConfig: true
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    if (!confirmedAudience) {
      throw new ApiRouteError(
        400,
        "Confirme a revisao dos destinatarios antes de iniciar.",
        "AUDIENCE_CONFIRMATION_REQUIRED"
      );
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

    const audienceFilter = {
      birthdayMonthDay: campaign.audienceConfig?.birthdayMonthDay ?? null,
      tags: campaign.audienceConfig?.tags ?? campaign.segmentTags,
      groups: campaign.audienceConfig?.groups ?? [],
      priorities: campaign.audienceConfig?.priorities ?? [],
      locations: campaign.audienceConfig?.locations ?? [],
      interests: campaign.audienceConfig?.interests ?? [],
      contactTypes: campaign.audienceConfig?.contactTypes ?? [],
      selectedContactIds: campaign.audienceConfig?.selectedContactIds ?? []
    };
    const selectedContactIds = campaign.audienceConfig?.selectedContactIds ?? [];
    const audiencePreview = await getCampaignAudiencePreview({
      mandateId,
      campaignId: campaign.id,
      templateBody: campaign.template.body,
      audienceFilter,
      selectedContactIds,
      selectedOnly: selectedContactIds.length > 0,
      showOnlyEligible: false
    });

    console.info("[campaign-start] audience-check", {
      campaignId: campaign.id,
      mandateId,
      selectedContactIds: selectedContactIds.length,
      foundContacts: audiencePreview.totalEncontrados,
      eligibleContacts: audiencePreview.totalElegiveis,
      skippedContacts: Math.max(0, audiencePreview.totalMatched - audiencePreview.totalElegiveis),
      blockedBy: audiencePreview.blockedBy
    });

    if (audiencePreview.totalElegiveis === 0) {
      return NextResponse.json(
        {
          error: "Nenhum destinatário elegível",
          details: {
          selectedContactIds: selectedContactIds.length,
          foundContacts: audiencePreview.totalEncontrados,
          eligibleContacts: audiencePreview.totalElegiveis,
          blockedBy: audiencePreview.blockedBy
          }
        },
        { status: 400 }
      );
    }

    await assertRealCampaignStartReady({
      mandateId,
      templateApproved: campaign.template.status === WhatsAppTemplateStatus.APPROVED,
      audiencePreview: {
        totalElegiveis: audiencePreview.totalElegiveis,
        totalInvalidos: audiencePreview.totalInvalidos,
        totalBloqueados: audiencePreview.totalBloqueados,
        totalOptOut: audiencePreview.totalOptOut,
        totalSemTelefone: audiencePreview.totalSemTelefone
      }
    });

    await appendCampaignEvent({
      mandateId,
      campaignId: campaign.id,
      eventType: "CAMPAIGN_AUDIENCE_CONFIRMED",
      title: "Publico confirmado",
      message: `${audiencePreview.totalElegiveis} destinatarios elegiveis confirmados para inicio supervisionado.`,
      metadata: {
        totalElegiveis: audiencePreview.totalElegiveis,
        totalOptOut: audiencePreview.totalOptOut,
        totalSemTelefone: audiencePreview.totalSemTelefone,
        totalSemOptIn: audiencePreview.totalSemOptIn,
        totalInvalidos: audiencePreview.totalInvalidos
      }
    });

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

    const queuedBatch = await queueCampaignRecipients({
      mandateId,
      campaignId: campaign.id,
      recommendedDailyLimit: simulation.recommendedDailyLimit,
      recommendedDelaySeconds: simulation.recommendedDelayMinSeconds
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
      createdRecipients: queuedBatch.recipientSummary.createdRecipients,
      eligibleContacts: queuedBatch.recipientSummary.eligibleContacts,
      queuedDeliveries: queuedBatch.queuedCount,
      redirectTo: `/admin/campaigns/operations?campaignId=${campaign.id}`,
      message:
        queuedBatch.queuedCount > 0
          ? "Campanha iniciada. Deliveries e fila de saída foram gerados; nada foi enviado diretamente para a Meta."
          : "Campanha iniciada, mas nenhum novo delivery foi enfileirado nesta execução."
    });
  } catch (error) {
    return apiError(error);
  }
}
