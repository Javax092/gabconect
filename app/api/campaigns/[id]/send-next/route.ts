import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  OperationEventLevel,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { runAdaptiveReputationEngine, runCampaignSafetySimulation } from "@/lib/campaign-safety";
import {
  markCampaignCompletedIfFinished,
  sendWhatsAppTemplateMessage,
  shouldPauseCampaignAfterFailure,
  syncCampaignCounters
} from "@/lib/whatsapp-campaigns";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

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
        "A campanha precisa estar em execução para enviar o próximo lote.",
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

    const { start, end } = getDayBounds();
    const dailySentCount = await prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: CampaignRecipientStatus.SENT,
        sentAt: {
          gte: start,
          lt: end
        }
      }
    });
    const dailySafeLimit = Math.min(campaign.dailyLimit, simulation.recommendedDailyLimit);

    if (dailySentCount >= dailySafeLimit) {
      return apiSuccess({
        campaignStatus: campaign.status,
        dailyLimitReached: true,
        safeLimit: dailySafeLimit,
        message: "Limite seguro de envio atingido. Aguarde a proxima janela operacional."
      });
    }

    const lastSentRecipient = await prisma.campaignRecipient.findFirst({
      where: {
        campaignId,
        status: CampaignRecipientStatus.SENT,
        sentAt: {
          not: null
        }
      },
      orderBy: {
        sentAt: "desc"
      },
      select: {
        sentAt: true
      }
    });

    if (lastSentRecipient?.sentAt) {
      const nextAllowedAt = new Date(
        lastSentRecipient.sentAt.getTime() + simulation.recommendedDelayMinSeconds * 1000
      );

      if (nextAllowedAt > new Date()) {
        throw new ApiRouteError(
          429,
          `Aguarde até ${nextAllowedAt.toLocaleString("pt-BR")} para respeitar o intervalo entre envios.`,
          "DELAY_NOT_ELAPSED"
        );
      }
    }

    const recentBatchRecipients = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        status: CampaignRecipientStatus.SENT,
        sentAt: {
          not: null
        }
      },
      orderBy: {
        sentAt: "desc"
      },
      take: simulation.recommendedBatchSize,
      select: {
        sentAt: true
      }
    });

    if (recentBatchRecipients.length === simulation.recommendedBatchSize) {
      const latestSentAt = recentBatchRecipients[0]?.sentAt;
      const oldestSentAt = recentBatchRecipients.at(-1)?.sentAt;
      const pauseBetweenBatchesSeconds = Math.max(
        simulation.recommendedDelayMaxSeconds,
        Math.round(simulation.recommendedDelayMinSeconds * 1.5)
      );

      if (latestSentAt && oldestSentAt) {
        const batchSpanSeconds = (latestSentAt.getTime() - oldestSentAt.getTime()) / 1000;
        const nextBatchAllowedAt = new Date(latestSentAt.getTime() + pauseBetweenBatchesSeconds * 1000);

        if (batchSpanSeconds <= simulation.recommendedBatchSize * simulation.recommendedDelayMaxSeconds && nextBatchAllowedAt > new Date()) {
          throw new ApiRouteError(
            429,
            `Lote recente concluido. Aguarde ate ${nextBatchAllowedAt.toLocaleString("pt-BR")} para a proxima janela segura.`,
            "BATCH_COOLDOWN_ACTIVE"
          );
        }
      }
    }

    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        campaignId,
        status: CampaignRecipientStatus.PENDING
      },
      include: {
        contact: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!recipient) {
      await markCampaignCompletedIfFinished(campaignId);

      return apiSuccess({
        campaignStatus: CampaignStatus.COMPLETED,
        message: "Campanha concluída. Não há destinatários pendentes."
      });
    }

    if (!recipient.contact.optIn || recipient.contact.status !== ContactStatus.ACTIVE) {
      const status =
        recipient.contact.status === ContactStatus.UNSUBSCRIBED
          ? CampaignRecipientStatus.UNSUBSCRIBED
          : CampaignRecipientStatus.SKIPPED;

      await prisma.campaignRecipient.update({
        where: {
          id: recipient.id
        },
        data: {
          status,
          errorMessage: "Contato inelegível para envio no momento da execução."
        }
      });

      await syncCampaignCounters(campaignId);
      await syncCampaignOperationState(campaignId);
      await appendCampaignEvent({
        mandateId,
        campaignId,
        eventType: "recipient.skipped",
        title: "Contato removido do fluxo",
        message: "Destinatario inelegivel no momento da execucao. O pipeline seguiu sem risco reputacional.",
        recommendedAction: "Atualizar o status de opt-in antes de novo disparo."
      });
      await markCampaignCompletedIfFinished(campaignId);

      return apiSuccess({
        skipped: true,
        recipientId: recipient.id,
        reason: "Contato sem opt-in válido ou com status bloqueado."
      });
    }

    try {
      const delivery = await sendWhatsAppTemplateMessage({
        mandateId,
        campaignId,
        campaignRecipientId: recipient.id,
        contact: {
          id: recipient.contact.id,
          phone: recipient.contact.phone,
          name: recipient.contact.name
        },
        template: {
          id: campaign.template.id,
          metaTemplateName: campaign.template.metaTemplateName,
          language: campaign.template.language,
          body: campaign.template.body,
          status: campaign.template.status
        }
      });

      await prisma.campaignRecipient.update({
        where: {
          id: recipient.id
        },
        data: {
          status: CampaignRecipientStatus.SENT,
          sentAt: delivery.sentAt,
          errorMessage: null
        }
      });

      await syncCampaignCounters(campaignId);
      await prisma.campaign.update({
        where: {
          id: campaignId
        },
        data: {
          dailyLimit: dailySafeLimit,
          delaySeconds: simulation.recommendedDelayMinSeconds
        }
      });
      await syncCampaignOperationState(campaignId);
      await appendCampaignEvent({
        mandateId,
        campaignId,
        campaignRecipientId: recipient.id,
        eventType: "throughput.sent",
        title: "Lote enviado",
        message: "Template aceito pela Meta dentro da janela segura e com throughput adaptativo.",
        recommendedAction:
          simulation.recommendations[0] ??
          "Manter cadencia gradual enquanto a reputacao permanecer estavel."
      });
      await runAdaptiveReputationEngine({
        mandateId,
        campaignId,
        logAdjustment: true,
        reason: "Entrega bem-sucedida registrada no throughput adaptativo."
      });
      await markCampaignCompletedIfFinished(campaignId);

      return apiSuccess({
        recipientId: recipient.id,
        providerMessageId: delivery.providerMessageId,
        sentAt: delivery.sentAt,
        throughputPlan: {
          recommendedBatchSize: simulation.recommendedBatchSize,
          recommendedDelayMinSeconds: simulation.recommendedDelayMinSeconds,
          recommendedDelayMaxSeconds: simulation.recommendedDelayMaxSeconds,
          recommendedDailyLimit: dailySafeLimit
        },
        message: "Template aceito pela Meta e registrado em log."
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Falha ao enviar template da campanha.";

      await prisma.campaignRecipient.update({
        where: {
          id: recipient.id
        },
        data: {
          status: CampaignRecipientStatus.FAILED,
          errorMessage
        }
      });

      await syncCampaignCounters(campaignId);
      await runAdaptiveReputationEngine({
        mandateId,
        campaignId,
        logAdjustment: true,
        reason: "Falha operacional registrada e usada para recalibrar reputacao."
      });

      if (await shouldPauseCampaignAfterFailure(campaignId)) {
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
          campaignRecipientId: recipient.id,
          level: OperationEventLevel.CRITICAL,
          eventType: "failsafe.triggered",
          title: "Failsafe acionado",
          message: "Sequencia de falhas acima do limite interrompeu a campanha preventivamente.",
          recommendedAction: "Revisar template, saude do numero e qualidade do publico antes de retomar."
        });
      }

      await syncCampaignOperationState(campaignId);

      throw new ApiRouteError(502, errorMessage, "META_SEND_FAILED");
    }
  } catch (error) {
    return apiError(error);
  }
}
