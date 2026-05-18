-- CreateEnum
CREATE TYPE "CampaignRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CampaignRiskTrend" AS ENUM ('IMPROVING', 'STABLE', 'WORSENING');

-- CreateEnum
CREATE TYPE "TrustRecoveryStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'MONITORING', 'RECOVERED');

-- CreateTable
CREATE TABLE "CampaignSafetySimulation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "riskLevel" "CampaignRiskLevel" NOT NULL,
    "safetyScore" INTEGER NOT NULL,
    "recommendedDailyLimit" INTEGER NOT NULL,
    "recommendedBatchSize" INTEGER NOT NULL,
    "recommendedDelayMinSeconds" INTEGER NOT NULL,
    "recommendedDelayMaxSeconds" INTEGER NOT NULL,
    "recommendedStartTime" TIMESTAMP(3),
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "canStartNow" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCompletionTime" TEXT,
    "estimatedReputationImpact" TEXT,
    "warnings" JSONB,
    "recommendations" JSONB,
    "blockingReasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSafetySimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationAdjustmentLog" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "campaignId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" "OperationEventLevel" NOT NULL DEFAULT 'INFO',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationAdjustmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustRecoveryState" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "status" "TrustRecoveryStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "recommendedLimit" INTEGER NOT NULL,
    "cooldownUntil" TIMESTAMP(3),
    "recoverySteps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustRecoveryState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignSafetySimulation_campaignId_createdAt_idx" ON "CampaignSafetySimulation"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignSafetySimulation_riskLevel_createdAt_idx" ON "CampaignSafetySimulation"("riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "ReputationAdjustmentLog_profileId_createdAt_idx" ON "ReputationAdjustmentLog"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "ReputationAdjustmentLog_campaignId_createdAt_idx" ON "ReputationAdjustmentLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "TrustRecoveryState_profileId_updatedAt_idx" ON "TrustRecoveryState"("profileId", "updatedAt");

-- CreateIndex
CREATE INDEX "TrustRecoveryState_mandateId_status_updatedAt_idx" ON "TrustRecoveryState"("mandateId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "CampaignSafetySimulation" ADD CONSTRAINT "CampaignSafetySimulation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationAdjustmentLog" ADD CONSTRAINT "ReputationAdjustmentLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "NumberReputationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationAdjustmentLog" ADD CONSTRAINT "ReputationAdjustmentLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustRecoveryState" ADD CONSTRAINT "TrustRecoveryState_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "NumberReputationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustRecoveryState" ADD CONSTRAINT "TrustRecoveryState_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
