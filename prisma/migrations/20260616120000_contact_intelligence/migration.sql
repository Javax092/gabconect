ALTER TABLE "Contact"
ADD COLUMN "influenceScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "influenceLevel" TEXT,
ADD COLUMN "influenceReason" TEXT,
ADD COLUMN "communityRole" TEXT,
ADD COLUMN "neighborhood" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "zone" TEXT,
ADD COLUMN "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN "relationshipStatus" TEXT,
ADD COLUMN "relationshipScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Contact_mandateId_influenceScore_idx" ON "Contact"("mandateId", "influenceScore");
CREATE INDEX "Contact_mandateId_influenceLevel_idx" ON "Contact"("mandateId", "influenceLevel");
CREATE INDEX "Contact_mandateId_neighborhood_zone_idx" ON "Contact"("mandateId", "neighborhood", "zone");
CREATE INDEX "Contact_mandateId_relationshipStatus_idx" ON "Contact"("mandateId", "relationshipStatus");
