import { CampaignRecipientStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { countEligibleContacts } from "@/lib/whatsapp-campaigns";
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
        }
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    const [statsRows, eligibleContacts, unsubscribeCount] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ["status"],
        where: {
          campaignId
        },
        _count: {
          _all: true
        }
      }),
      countEligibleContacts(mandateId, campaign.segmentTags),
      prisma.campaignRecipient.count({
        where: {
          campaignId,
          status: CampaignRecipientStatus.UNSUBSCRIBED
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
      eligibleContacts
    });
  } catch (error) {
    return apiError(error);
  }
}
