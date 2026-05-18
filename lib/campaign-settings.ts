import { prisma } from "@/lib/prisma";

export const CAMPAIGN_LIMITS = {
  dailyLimit: {
    min: 1,
    max: 200
  },
  delaySeconds: {
    min: 25,
    max: 3600
  },
  maxConsecutiveFailures: {
    min: 1,
    max: 10
  }
} as const;

export const DEFAULT_CAMPAIGN_SETTINGS = {
  defaultDailyLimit: 20,
  defaultDelaySeconds: 45,
  maxConsecutiveFailures: 3
} as const;

export async function getCampaignSettings(mandateId: string) {
  const settings = await prisma.campaignSettings.findUnique({
    where: {
      mandateId
    }
  });

  return (
    settings ?? {
      id: "defaults",
      mandateId,
      ...DEFAULT_CAMPAIGN_SETTINGS,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    }
  );
}

export async function upsertCampaignSettings(
  mandateId: string,
  input: {
    defaultDailyLimit: number;
    defaultDelaySeconds: number;
    maxConsecutiveFailures: number;
  }
) {
  return prisma.campaignSettings.upsert({
    where: {
      mandateId
    },
    update: input,
    create: {
      mandateId,
      ...input
    }
  });
}
