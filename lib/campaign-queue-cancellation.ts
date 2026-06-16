import { MessageDirection, QueueStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function readMetadata(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function cancelQueuedCampaignDeliveries(input: {
  mandateId: string;
  campaignId?: string;
  contactId?: string;
  reason: string;
}) {
  const queuedRecords = await prisma.messageQueue.findMany({
    where: {
      mandateId: input.mandateId,
      direction: MessageDirection.OUTBOUND,
      status: QueueStatus.QUEUED
    },
    select: {
      id: true,
      metadata: true
    }
  });
  const ids = queuedRecords
    .filter((record) => {
      const metadata = readMetadata(record.metadata);
      const matchesCampaign = input.campaignId ? metadata.campaignId === input.campaignId : true;
      const matchesContact = input.contactId ? metadata.contactId === input.contactId : true;

      return matchesCampaign && matchesContact;
    })
    .map((record) => record.id);

  if (ids.length === 0) {
    return 0;
  }

  const result = await prisma.messageQueue.updateMany({
    where: {
      id: {
        in: ids
      },
      status: QueueStatus.QUEUED
    },
    data: {
      status: QueueStatus.CANCELLED,
      processedAt: new Date(),
      error: input.reason
    }
  });

  return result.count;
}
