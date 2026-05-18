"use server";

import {
  bootstrapCampaignEvents,
  ensureCampaignInfrastructure,
  getAudienceDimensionOptions,
  getInfrastructureSnapshot,
  syncCampaignOperationState
} from "@/lib/campaign-infrastructure";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getOperationalControlSnapshot() {
  const user = await requireUser();

  const mandate = await prisma.mandate.findUniqueOrThrow({
    where: {
      id: user.mandateId
    },
    select: {
      whatsappNumber: true,
      campaigns: {
        select: {
          id: true
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 10
      }
    }
  });

  await ensureCampaignInfrastructure(user.mandateId, mandate.whatsappNumber);
  await bootstrapCampaignEvents(user.mandateId);
  await Promise.all(mandate.campaigns.map((campaign) => syncCampaignOperationState(campaign.id)));

  const [snapshot, audienceOptions] = await Promise.all([
    getInfrastructureSnapshot(user.mandateId, mandate.whatsappNumber),
    getAudienceDimensionOptions(user.mandateId)
  ]);

  return {
    ...snapshot,
    audienceOptions
  };
}
