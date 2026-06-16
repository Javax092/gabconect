ALTER TYPE "CampaignMode" ADD VALUE IF NOT EXISTS 'FIRST_CONTACT';

ALTER TABLE "Contact"
ADD COLUMN "optOutAt" TIMESTAMP(3),
ADD COLUMN "consentStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "firstContactSentAt" TIMESTAMP(3),
ADD COLUMN "firstContactStatus" TEXT,
ADD COLUMN "lastInboundAt" TIMESTAMP(3),
ADD COLUMN "blockedFromCampaigns" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Contact"
SET "consentStatus" = CASE
  WHEN "status" = 'UNSUBSCRIBED' THEN 'OPTED_OUT'
  WHEN "optIn" = true THEN 'OPTED_IN'
  ELSE 'PENDING'
END,
"blockedFromCampaigns" = CASE
  WHEN "status" IN ('UNSUBSCRIBED', 'BLOCKED') THEN true
  ELSE false
END;

CREATE INDEX "Contact_mandateId_consentStatus_idx" ON "Contact"("mandateId", "consentStatus");
