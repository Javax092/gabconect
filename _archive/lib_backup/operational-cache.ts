import { revalidateTag, unstable_cache } from "next/cache";

import {
  getAdminDashboardDeferredData,
  getAdminDashboardOverview
} from "@/lib/admin-dashboard";
import {
  bootstrapCampaignEvents,
  ensureCampaignInfrastructure,
  getAudienceDimensionOptions,
  getInfrastructureSnapshot,
  syncCampaignOperationState
} from "@/lib/campaign-infrastructure";
import { getOperationalReadiness } from "@/lib/operational-readiness";
import { prisma } from "@/lib/prisma";

const DASHBOARD_OVERVIEW_TTL_SECONDS = 15;
const READINESS_TTL_SECONDS = 15;
const DASHBOARD_BLOCKS_TTL_SECONDS = 30;
const INFRASTRUCTURE_TTL_SECONDS = 30;

function tagFor(scope: string, mandateId: string) {
  return `mandate:${mandateId}:${scope}`;
}

export function operationalCacheTags(mandateId: string) {
  return {
    all: tagFor("operational", mandateId),
    readiness: tagFor("operational:readiness", mandateId),
    metrics: tagFor("operational:metrics", mandateId),
    campaigns: tagFor("operational:campaigns", mandateId),
    compliance: tagFor("operational:compliance", mandateId),
    whatsapp: tagFor("operational:whatsapp", mandateId)
  };
}

export function getCachedAdminDashboardOverview(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  return unstable_cache(
    () => getAdminDashboardOverview(mandateId),
    ["admin-dashboard-overview", mandateId],
    {
      revalidate: DASHBOARD_OVERVIEW_TTL_SECONDS,
      tags: [tags.all, tags.metrics, tags.readiness, tags.whatsapp]
    }
  )();
}

export function getCachedAdminDashboardDeferredData(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  return unstable_cache(
    () => getAdminDashboardDeferredData(mandateId),
    ["admin-dashboard-blocks", mandateId],
    {
      revalidate: DASHBOARD_BLOCKS_TTL_SECONDS,
      tags: [tags.all, tags.campaigns, tags.compliance]
    }
  )();
}

export function getCachedOperationalReadiness(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  return unstable_cache(
    () => getOperationalReadiness(mandateId),
    ["operational-readiness", mandateId],
    {
      revalidate: READINESS_TTL_SECONDS,
      tags: [tags.all, tags.readiness, tags.whatsapp]
    }
  )();
}

export function getCachedInfrastructureSnapshot(mandateId: string, phoneNumber: string) {
  const tags = operationalCacheTags(mandateId);

  return unstable_cache(
    () => getInfrastructureSnapshot(mandateId, phoneNumber),
    ["campaign-infrastructure-snapshot", mandateId, phoneNumber],
    {
      revalidate: INFRASTRUCTURE_TTL_SECONDS,
      tags: [tags.all, tags.metrics, tags.campaigns, tags.whatsapp]
    }
  )();
}

export function getCachedOperationalControlSnapshot(mandateId: string, phoneNumber: string) {
  const tags = operationalCacheTags(mandateId);

  return unstable_cache(
    async () => {
      await ensureCampaignInfrastructure(mandateId, phoneNumber);
      await bootstrapCampaignEvents(mandateId);

      const campaigns = await prisma.campaign.findMany({
        where: { mandateId },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 10
      });

      await Promise.all(campaigns.map((campaign) => syncCampaignOperationState(campaign.id)));

      const [snapshot, audienceOptions] = await Promise.all([
        getInfrastructureSnapshot(mandateId, phoneNumber),
        getAudienceDimensionOptions(mandateId)
      ]);

      return {
        ...snapshot,
        audienceOptions
      };
    },
    ["operational-control-snapshot", mandateId, phoneNumber],
    {
      revalidate: INFRASTRUCTURE_TTL_SECONDS,
      tags: [tags.all, tags.metrics, tags.campaigns, tags.whatsapp]
    }
  )();
}

export function invalidateOperationalCache(mandateId: string) {
  revalidateTag(operationalCacheTags(mandateId).all);
}

export function invalidateCampaignOperationalCache(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  revalidateTag(tags.campaigns);
  revalidateTag(tags.metrics);
  revalidateTag(tags.whatsapp);
}

export function invalidateContactOperationalCache(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  revalidateTag(tags.campaigns);
  revalidateTag(tags.metrics);
}

export function invalidateWhatsAppOperationalCache(mandateId: string) {
  const tags = operationalCacheTags(mandateId);

  revalidateTag(tags.whatsapp);
  revalidateTag(tags.readiness);
  revalidateTag(tags.metrics);
}
