/**
 * Migration: Cleanup TEST campaigns with inherited BIRTHDAY filters
 *
 * Problem: TEST campaigns were incorrectly using birthdayMonthDay filters
 * from previous campaigns, causing them to fail with "no eligible contacts".
 *
 * Solution: Set birthdayMonthDay to null for all DRAFT TEST campaigns
 * to ensure clean state.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "[migration] Starting cleanup of TEST campaigns with birthday filters...",
  );

  const affectedCount = await prisma.campaignAudienceConfig.updateMany({
    where: {
      AND: [
        {
          campaign: {
            campaignMode: "TEST",
            status: "DRAFT",
          },
        },
        {
          birthdayMonthDay: {
            not: null,
          },
        },
      ],
    },
    data: {
      birthdayMonthDay: null,
    },
  });

  console.log(
    `[migration] Cleaned ${affectedCount.count} TEST campaigns by removing birthdayMonthDay filters.`,
  );

  // Also verify no TEST campaigns have selected non-manual selections
  const testCampaignsWithoutSelection = await prisma.campaign.findMany({
    where: {
      campaignMode: "TEST",
      status: "DRAFT",
    },
    include: {
      audienceConfig: true,
    },
  });

  let cleanedSelections = 0;
  for (const campaign of testCampaignsWithoutSelection) {
    if (!campaign.audienceConfig) continue;

    const hasOnlyManualSelection =
      campaign.audienceConfig.selectedContactIds.length > 0 &&
      campaign.audienceConfig.tags.length === 0 &&
      campaign.audienceConfig.groups.length === 0 &&
      campaign.audienceConfig.priorities.length === 0 &&
      campaign.audienceConfig.locations.length === 0 &&
      campaign.audienceConfig.interests.length === 0 &&
      campaign.audienceConfig.contactTypes.length === 0;

    if (
      !hasOnlyManualSelection &&
      campaign.audienceConfig.selectedContactIds.length === 0
    ) {
      // This TEST campaign has no manual selection - zero all filters
      await prisma.campaignAudienceConfig.update({
        where: {
          id: campaign.audienceConfig.id,
        },
        data: {
          tags: [],
          groups: [],
          priorities: [],
          locations: [],
          interests: [],
          contactTypes: [],
          birthdayMonthDay: null,
        },
      });
      cleanedSelections++;
    }
  }

  console.log(
    `[migration] Cleaned ${cleanedSelections} TEST campaigns by removing all audience filters.`,
  );

  console.log("[migration] Cleanup complete!");
}

main()
  .catch((e) => {
    console.error("[migration-error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
