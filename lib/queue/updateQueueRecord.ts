import { type Prisma, QueueStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function updateQueueRecord(
  queueRecordId: string,
  status: QueueStatus,
  data: Prisma.MessageQueueUpdateInput & { queueRecordId?: string } = {}
) {
  if (!queueRecordId) {
    return null;
  }

  const { queueRecordId: _queueRecordId, ...updateData } = data;

  return prisma.messageQueue.update({
    where: {
      id: queueRecordId
    },
    data: {
      status,
      ...(status === QueueStatus.PROCESSING ? { processedAt: null } : {}),
      ...(status === QueueStatus.SENT || status === QueueStatus.SIMULATED_SENT ? { processedAt: new Date() } : {}),
      ...(status === QueueStatus.FAILED ? { failedAt: new Date() } : {}),
      ...updateData
    }
  });
}
