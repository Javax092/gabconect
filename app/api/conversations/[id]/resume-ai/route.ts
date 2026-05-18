import { ConversationStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
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

    await prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.OPEN,
          aiPaused: false,
          humanTakeoverActive: false,
          humanPriority: false,
          currentQueue: "incoming-message"
        }
      });

      await tx.humanTakeover.updateMany({
        where: {
          conversationId: conversation.id,
          active: true
        },
        data: {
          active: false,
          endedAt: new Date()
        }
      });
    });

    return apiSuccess({ message: "IA reativada com sucesso." });
  } catch (error) {
    return apiError(error);
  }
}
