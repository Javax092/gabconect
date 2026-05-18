CREATE TABLE "CampaignSettings" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "defaultDailyLimit" INTEGER NOT NULL DEFAULT 20,
    "defaultDelaySeconds" INTEGER NOT NULL DEFAULT 60,
    "maxConsecutiveFailures" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignSettings_mandateId_key" ON "CampaignSettings"("mandateId");

CREATE INDEX "CampaignSettings_mandateId_idx" ON "CampaignSettings"("mandateId");

ALTER TABLE "CampaignSettings" ADD CONSTRAINT "CampaignSettings_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
