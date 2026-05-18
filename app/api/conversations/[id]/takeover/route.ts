import { ConversationStatus, MessageDirection, QueuePriority } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { enqueueJob, QUEUE_NAMES } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const conversationId = parseRouteId(id);

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        mandateId
      }
    });

    if (!conversation) {
      throw new ApiRouteError(404, "Conversa não encontrada.", "NOT_FOUND");
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.HUMAN,
        aiPaused: true,
        humanTakeoverActive: true,
        humanPriority: true,
        currentQueue: QUEUE_NAMES.human
      }
    });

    await enqueueJob(QUEUE_NAMES.human, {
      mandateId,
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      priority: QueuePriority.HIGH,
      payload: {
        queueRecordId: "",
        mandateId,
        conversationId: conversation.id,
        reason: "Conversa assumida manualmente.",
        userId: user.id
      }
    });

    return apiSuccess({ message: "Conversa enviada para a fila humana." });
  } catch (error) {
    return apiError(error);
  }
}
