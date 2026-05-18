-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BLOCKED', 'INVALID');

-- CreateEnum
CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "WhatsAppMessageLogDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageLogStatus" AS ENUM ('ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED', 'OPTED_OUT');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "optIn" BOOLEAN NOT NULL DEFAULT false,
    "optInAt" TIMESTAMP(3),
    "tags" TEXT[],
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WhatsAppTemplateCategory" NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metaTemplateName" TEXT NOT NULL,
    "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "segmentTags" TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "dailyLimit" INTEGER NOT NULL,
    "delaySeconds" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOutEvent" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "contactId" TEXT,
    "templateId" TEXT,
    "campaignId" TEXT,
    "campaignRecipientId" TEXT,
    "direction" "WhatsAppMessageLogDirection" NOT NULL,
    "status" "WhatsAppMessageLogStatus" NOT NULL,
    "providerMessageId" TEXT,
    "phone" TEXT NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_mandateId_phone_key" ON "Contact"("mandateId", "phone");

-- CreateIndex
CREATE INDEX "Contact_mandateId_status_optIn_idx" ON "Contact"("mandateId", "status", "optIn");

-- CreateIndex
CREATE INDEX "Contact_mandateId_createdAt_idx" ON "Contact"("mandateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_mandateId_metaTemplateName_language_key" ON "WhatsAppTemplate"("mandateId", "metaTemplateName", "language");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_mandateId_status_createdAt_idx" ON "WhatsAppTemplate"("mandateId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_mandateId_status_createdAt_idx" ON "Campaign"("mandateId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_templateId_idx" ON "Campaign"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_createdAt_idx" ON "CampaignRecipient"("campaignId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contactId_status_idx" ON "CampaignRecipient"("contactId", "status");

-- CreateIndex
CREATE INDEX "OptOutEvent_mandateId_createdAt_idx" ON "OptOutEvent"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "OptOutEvent_contactId_createdAt_idx" ON "OptOutEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_mandateId_createdAt_idx" ON "WhatsAppMessageLog"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_campaignId_createdAt_idx" ON "WhatsAppMessageLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_campaignRecipientId_createdAt_idx" ON "WhatsAppMessageLog"("campaignRecipientId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_providerMessageId_idx" ON "WhatsAppMessageLog"("providerMessageId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptOutEvent" ADD CONSTRAINT "OptOutEvent_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptOutEvent" ADD CONSTRAINT "OptOutEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
