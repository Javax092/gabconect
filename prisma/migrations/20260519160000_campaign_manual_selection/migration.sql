ALTER TABLE "CampaignAudienceConfig"
ADD COLUMN "selectedContactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
