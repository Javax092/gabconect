import { CampaignRecipientStatus, CampaignStatus, ContactStatus, WhatsAppTemplateStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
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

    if (dailySentCount >= campaign.dailyLimit) {
      return apiSuccess({
        campaignStatus: campaign.status,
        dailyLimitReached: true,
        message: "Limite diário atingido. Aguarde a próxima janela operacional."
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
        lastSentRecipient.sentAt.getTime() + campaign.delaySeconds * 1000
      );

      if (nextAllowedAt > new Date()) {
        throw new ApiRouteError(
          429,
          `Aguarde até ${nextAllowedAt.toLocaleString("pt-BR")} para respeitar o intervalo entre envios.`,
          "DELAY_NOT_ELAPSED"
        );
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
      await markCampaignCompletedIfFinished(campaignId);

      return apiSuccess({
        recipientId: recipient.id,
        providerMessageId: delivery.providerMessageId,
        sentAt: delivery.sentAt,
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

      if (await shouldPauseCampaignAfterFailure(campaignId)) {
        await prisma.campaign.update({
          where: {
            id: campaignId
          },
          data: {
            status: CampaignStatus.PAUSED
          }
        });
      }

      throw new ApiRouteError(502, errorMessage, "META_SEND_FAILED");
    }
  } catch (error) {
    return apiError(error);
  }
}
