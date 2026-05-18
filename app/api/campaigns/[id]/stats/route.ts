import { CampaignRecipientStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { countAudienceContacts, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
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
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true
          }
        },
        audienceConfig: true,
        operationState: true,
        safetySimulations: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    await syncCampaignOperationState(campaignId);

    const [statsRows, eligibleContacts, unsubscribeCount, operationState] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ["status"],
        where: {
          campaignId
        },
        _count: {
          _all: true
        }
      }),
      countAudienceContacts(mandateId, {
        tags: campaign.audienceConfig?.tags ?? campaign.segmentTags,
        groups: campaign.audienceConfig?.groups ?? [],
        priorities: campaign.audienceConfig?.priorities ?? [],
        locations: campaign.audienceConfig?.locations ?? [],
        interests: campaign.audienceConfig?.interests ?? [],
        contactTypes: campaign.audienceConfig?.contactTypes ?? []
      }),
      prisma.campaignRecipient.count({
        where: {
          campaignId,
          status: CampaignRecipientStatus.UNSUBSCRIBED
        }
      }),
      prisma.campaignOperationState.findUnique({
        where: {
          campaignId
        }
      })
    ]);

    const stats = {
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      unsubscribed: unsubscribeCount,
      total: 0
    };

    for (const row of statsRows) {
      stats.total += row._count._all;

      if (row.status === CampaignRecipientStatus.PENDING) stats.pending = row._count._all;
      if (row.status === CampaignRecipientStatus.SENT) stats.sent = row._count._all;
      if (row.status === CampaignRecipientStatus.FAILED) stats.failed = row._count._all;
      if (row.status === CampaignRecipientStatus.SKIPPED) stats.skipped = row._count._all;
      if (row.status === CampaignRecipientStatus.UNSUBSCRIBED) stats.unsubscribed = row._count._all;
    }

    return apiSuccess({
      campaign,
      stats,
      eligibleContacts,
      operationState
      ,
      latestSafetySimulation: campaign.safetySimulations[0] ?? null
    });
  } catch (error) {
    return apiError(error);
  }
}
