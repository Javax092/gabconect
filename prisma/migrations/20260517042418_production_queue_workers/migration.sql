-- CreateEnum
CREATE TYPE "AIActionType" AS ENUM ('RESPOND', 'WAIT_HUMAN', 'REQUEST_CONTEXT', 'USE_TEMPLATE', 'ESCALATE', 'BLOCK');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'APPROVED', 'PACED', 'ESCALATED', 'BLOCKED', 'FAILED');

-- AlterEnum
ALTER TYPE "MessageSource" ADD VALUE 'TEMPLATE';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aiPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "conversationWindowExpiresAt" TIMESTAMP(3),
ADD COLUMN     "currentQueue" TEXT NOT NULL DEFAULT 'incoming-message',
ADD COLUMN     "humanPriority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanTakeoverActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAIAction" "AIActionType",
ADD COLUMN     "lastComplianceCheckAt" TIMESTAMP(3),
ADD COLUMN     "metaWindowOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "operationalScore" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spamRisk" TEXT NOT NULL DEFAULT 'LOW';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ComplianceLog" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "spamRisk" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAction" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "actionType" "AIActionType" NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageQueue" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanTakeover" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "mandateId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HumanTakeover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceLog_mandateId_createdAt_idx" ON "ComplianceLog"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceLog_conversationId_createdAt_idx" ON "ComplianceLog"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceLog_messageId_createdAt_idx" ON "ComplianceLog"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "AIAction_mandateId_createdAt_idx" ON "AIAction"("mandateId", "createdAt");

-- CreateIndex
CREATE INDEX "AIAction_conversationId_createdAt_idx" ON "AIAction"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIAction_messageId_createdAt_idx" ON "AIAction"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageQueue_mandateId_status_scheduledFor_idx" ON "MessageQueue"("mandateId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "MessageQueue_conversationId_createdAt_idx" ON "MessageQueue"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageQueue_messageId_createdAt_idx" ON "MessageQueue"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "HumanTakeover_conversationId_startedAt_idx" ON "HumanTakeover"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "HumanTakeover_userId_startedAt_idx" ON "HumanTakeover"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "HumanTakeover_mandateId_startedAt_idx" ON "HumanTakeover"("mandateId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_templateId_key" ON "MessageTemplate"("templateId");

-- CreateIndex
CREATE INDEX "MessageTemplate_mandateId_approved_createdAt_idx" ON "MessageTemplate"("mandateId", "approved", "createdAt");

-- CreateIndex
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");

-- AddForeignKey
ALTER TABLE "ComplianceLog" ADD CONSTRAINT "ComplianceLog_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLog" ADD CONSTRAINT "ComplianceLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLog" ADD CONSTRAINT "ComplianceLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAction" ADD CONSTRAINT "AIAction_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAction" ADD CONSTRAINT "AIAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAction" ADD CONSTRAINT "AIAction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTakeover" ADD CONSTRAINT "HumanTakeover_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTakeover" ADD CONSTRAINT "HumanTakeover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTakeover" ADD CONSTRAINT "HumanTakeover_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
