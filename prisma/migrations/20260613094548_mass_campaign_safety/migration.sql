-- CreateEnum
CREATE TYPE "CampaignMode" AS ENUM ('TEST', 'WARMUP', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('OPT_IN', 'OPT_OUT', 'IMPORTED_OPT_IN', 'MANUAL_OPT_IN', 'MANUAL_OPT_OUT');

-- CreateEnum
CREATE TYPE "SendAttemptStatus" AS ENUM ('QUEUED', 'SENT', 'BLOCKED', 'CANCELLED', 'OPT_OUT', 'ERROR', 'RETRY', 'RATE_LIMITED', 'SIMULATED');

-- AlterEnum
ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "campaignMode" "CampaignMode" NOT NULL DEFAULT 'TEST';

-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionList" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendAttempt" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "template" TEXT,
    "status" "SendAttemptStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "queueRecordId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentLog_mandateId_phone_createdAt_idx" ON "ConsentLog"("mandateId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_contactId_createdAt_idx" ON "ConsentLog"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_action_createdAt_idx" ON "ConsentLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SuppressionList_mandateId_active_createdAt_idx" ON "SuppressionList"("mandateId", "active", "createdAt");

-- CreateIndex
CREATE INDEX "SuppressionList_contactId_active_idx" ON "SuppressionList"("contactId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionList_mandateId_phone_key" ON "SuppressionList"("mandateId", "phone");

-- CreateIndex
CREATE INDEX "SendAttempt_mandateId_createdAt_idx" ON "SendAttempt"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "SendAttempt_campaignId_createdAt_idx" ON "SendAttempt"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "SendAttempt_contactId_createdAt_idx" ON "SendAttempt"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "SendAttempt_status_createdAt_idx" ON "SendAttempt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SendAttempt_providerMessageId_idx" ON "SendAttempt"("providerMessageId");

-- CreateIndex
CREATE INDEX "Campaign_mandateId_campaignMode_status_idx" ON "Campaign"("mandateId", "campaignMode", "status");

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLog" ADD CONSTRAINT "ConsentLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionList" ADD CONSTRAINT "SuppressionList_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionList" ADD CONSTRAINT "SuppressionList_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
