import { CampaignRecipientStatus, CampaignStatus, OperationEventLevel } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { appendCampaignEvent, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { cancelQueuedCampaignDeliveries } from "@/lib/campaign-queue-cancellation";
import { invalidateCampaignOperationalCache } from "@/lib/operational-cache";
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
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new ApiRouteError(400, "Campanhas concluídas não podem ser canceladas.", "INVALID_STATUS");
    }

    const [updatedCampaign, cancelledQueueRecords, cancelledRecipients] = await Promise.all([
      prisma.campaign.update({
        where: {
          id: campaignId
        },
        data: {
          status: CampaignStatus.CANCELLED
        }
      }),
      cancelQueuedCampaignDeliveries({
        mandateId,
        campaignId,
        reason: "Campanha cancelada pelo operador."
      }),
      prisma.campaignRecipient.updateMany({
        where: {
          campaignId,
          status: {
            in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED]
          }
        },
        data: {
          status: CampaignRecipientStatus.CANCELLED,
          errorMessage: "Campanha cancelada pelo operador."
        }
      })
    ]);

    await syncCampaignOperationState(campaignId);
    await appendCampaignEvent({
      mandateId,
      campaignId,
      level: OperationEventLevel.CRITICAL,
      eventType: "campaign.cancelled",
      title: "Campanha cancelada",
      message: "Fila e destinatários pendentes foram cancelados para impedir novos envios.",
      metadata: {
        cancelledQueueRecords,
        cancelledRecipients: cancelledRecipients.count
      }
    });
    invalidateCampaignOperationalCache(mandateId);

    return apiSuccess({
      campaign: updatedCampaign,
      cancelledQueueRecords,
      cancelledRecipients: cancelledRecipients.count,
      message: "Campanha cancelada com segurança."
    });
  } catch (error) {
    return apiError(error);
  }
}
