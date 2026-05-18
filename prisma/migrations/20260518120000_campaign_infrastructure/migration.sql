-- CreateEnum
CREATE TYPE "CampaignWarmupStage" AS ENUM ('DORMANT', 'DAY_1', 'DAY_2', 'DAY_3', 'STABLE', 'COOLDOWN', 'PAUSED');

-- CreateEnum
CREATE TYPE "CampaignPipelineStage" AS ENUM ('QUEUED', 'WARMING', 'SENDING', 'THROTTLED', 'PAUSED', 'RISK_DETECTED', 'HUMAN_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OperationEventLevel" AS ENUM ('INFO', 'WARN', 'CRITICAL', 'STABLE');

-- CreateTable
CREATE TABLE "NumberReputationProfile" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "reputationScore" INTEGER NOT NULL DEFAULT 78,
    "spamRisk" INTEGER NOT NULL DEFAULT 18,
    "deliveryHealth" INTEGER NOT NULL DEFAULT 88,
    "qualityRating" TEXT NOT NULL DEFAULT 'Estavel',
    "trustLevel" TEXT NOT NULL DEFAULT 'Protegido',
    "warmingStage" "CampaignWarmupStage" NOT NULL DEFAULT 'DAY_1',
    "trendDelta" INTEGER NOT NULL DEFAULT 4,
    "activeThroughput" INTEGER NOT NULL DEFAULT 18,
    "safeThroughput" INTEGER NOT NULL DEFAULT 28,
    "humanizedDelayMin" INTEGER NOT NULL DEFAULT 25,
    "humanizedDelayMax" INTEGER NOT NULL DEFAULT 90,
    "blockRisk" INTEGER NOT NULL DEFAULT 14,
    "queuePressure" INTEGER NOT NULL DEFAULT 32,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberReputationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarmupRule" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "stage" "CampaignWarmupStage" NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "throughputCap" INTEGER NOT NULL,
    "minDelaySeconds" INTEGER NOT NULL,
    "maxDelaySeconds" INTEGER NOT NULL,
    "pauseOnRisk" INTEGER NOT NULL DEFAULT 70,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarmupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAudienceConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priorities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAudienceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignOperationState" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "pipelineStage" "CampaignPipelineStage" NOT NULL DEFAULT 'QUEUED',
    "riskScore" INTEGER NOT NULL DEFAULT 18,
    "spamProbability" INTEGER NOT NULL DEFAULT 12,
    "deliveryRate" INTEGER NOT NULL DEFAULT 93,
    "queuePressure" INTEGER NOT NULL DEFAULT 28,
    "activeThroughput" INTEGER NOT NULL DEFAULT 16,
    "safeThroughput" INTEGER NOT NULL DEFAULT 24,
    "currentDelayMin" INTEGER NOT NULL DEFAULT 25,
    "currentDelayMax" INTEGER NOT NULL DEFAULT 90,
    "sendingWindowStart" INTEGER NOT NULL DEFAULT 8,
    "sendingWindowEnd" INTEGER NOT NULL DEFAULT 20,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 12,
    "failsafeTriggered" BOOLEAN NOT NULL DEFAULT false,
    "humanReviewNeeded" BOOLEAN NOT NULL DEFAULT false,
    "recommendedAction" TEXT,
    "pausedReason" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignOperationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEventLog" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "level" "OperationEventLevel" NOT NULL DEFAULT 'INFO',
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NumberReputationProfile_mandateId_key" ON "NumberReputationProfile"("mandateId");

-- CreateIndex
CREATE INDEX "NumberReputationProfile_mandateId_updatedAt_idx" ON "NumberReputationProfile"("mandateId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarmupRule_mandateId_dayNumber_key" ON "WarmupRule"("mandateId", "dayNumber");

-- CreateIndex
CREATE INDEX "WarmupRule_mandateId_stage_idx" ON "WarmupRule"("mandateId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAudienceConfig_campaignId_key" ON "CampaignAudienceConfig"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignAudienceConfig_campaignId_idx" ON "CampaignAudienceConfig"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignOperationState_campaignId_key" ON "CampaignOperationState"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignOperationState_pipelineStage_updatedAt_idx" ON "CampaignOperationState"("pipelineStage", "updatedAt");

-- CreateIndex
CREATE INDEX "CampaignEventLog_mandateId_createdAt_idx" ON "CampaignEventLog"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignEventLog_campaignId_createdAt_idx" ON "CampaignEventLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignEventLog_campaignRecipientId_createdAt_idx" ON "CampaignEventLog"("campaignRecipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "NumberReputationProfile" ADD CONSTRAINT "NumberReputationProfile_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarmupRule" ADD CONSTRAINT "WarmupRule_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudienceConfig" ADD CONSTRAINT "CampaignAudienceConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOperationState" ADD CONSTRAINT "CampaignOperationState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEventLog" ADD CONSTRAINT "CampaignEventLog_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEventLog" ADD CONSTRAINT "CampaignEventLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEventLog" ADD CONSTRAINT "CampaignEventLog_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
