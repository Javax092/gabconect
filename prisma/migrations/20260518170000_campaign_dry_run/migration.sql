ALTER TYPE "QueueStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "QueueStatus" ADD VALUE IF NOT EXISTS 'SIMULATED_SENT';

ALTER TYPE "WhatsAppMessageLogStatus" ADD VALUE IF NOT EXISTS 'SIMULATED_SENT';

ALTER TABLE "Contact"
ADD COLUMN "birthday" TIMESTAMP(3);

ALTER TABLE "CampaignAudienceConfig"
ADD COLUMN "birthdayMonthDay" TEXT;

ALTER TABLE "CampaignRecipient"
ADD COLUMN "queuedAt" TIMESTAMP(3),
ADD COLUMN "messagePreview" TEXT;

CREATE INDEX "Contact_mandateId_birthday_idx" ON "Contact"("mandateId", "birthday");
