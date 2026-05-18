import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import {
  bootstrapCampaignEvents,
  ensureCampaignInfrastructure,
  getAudienceDimensionOptions,
  getInfrastructureSnapshot,
  syncCampaignOperationState
} from "@/lib/campaign-infrastructure";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const mandate = await prisma.mandate.findUniqueOrThrow({
      where: {
        id: mandateId
      },
      select: {
        whatsappNumber: true,
        campaigns: {
          select: {
            id: true
          },
          take: 8,
          orderBy: {
            updatedAt: "desc"
          }
        }
      }
    });

    await ensureCampaignInfrastructure(mandateId, mandate.whatsappNumber);
    await bootstrapCampaignEvents(mandateId);
    await Promise.all(mandate.campaigns.map((campaign) => syncCampaignOperationState(campaign.id)));

    const [snapshot, audienceOptions] = await Promise.all([
      getInfrastructureSnapshot(mandateId, mandate.whatsappNumber),
      getAudienceDimensionOptions(mandateId)
    ]);

    return apiSuccess({
      ...snapshot,
      audienceOptions
    });
  } catch (error) {
    return apiError(error);
  }
}
