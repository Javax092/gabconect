import { Prisma, SendAttemptStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function toJson(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

export async function recordSendAttempt(input: {
  mandateId: string;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  contactId?: string | null;
  phone: string;
  template?: string | null;
  status: SendAttemptStatus;
  reason: string;
  providerMessageId?: string | null;
  queueRecordId?: string | null;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}) {
  return prisma.sendAttempt.create({
    data: {
      mandateId: input.mandateId,
      campaignId: input.campaignId ?? null,
      campaignRecipientId: input.campaignRecipientId ?? null,
      contactId: input.contactId ?? null,
      phone: input.phone.replace(/[^\d]/g, ""),
      template: input.template ?? null,
      status: input.status,
      reason: input.reason,
      providerMessageId: input.providerMessageId ?? null,
      queueRecordId: input.queueRecordId ?? null,
      retryCount: input.retryCount ?? 0,
      metadata: toJson(input.metadata)
    }
  });
}
