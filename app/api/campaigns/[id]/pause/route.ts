import { CampaignStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
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
      throw new ApiRouteError(400, "Campanhas concluídas não podem ser pausadas.", "INVALID_STATUS");
    }

    const updatedCampaign = await prisma.campaign.update({
      where: {
        id: campaignId
      },
      data: {
        status: CampaignStatus.PAUSED
      }
    });

    return apiSuccess({
      campaign: updatedCampaign,
      message: "Campanha pausada com segurança."
    });
  } catch (error) {
    return apiError(error);
  }
}
