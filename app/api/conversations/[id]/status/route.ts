import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conversationStatusSchema } from "@/lib/validations/conversation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(conversationStatusSchema, body);
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
        where: {
          id: conversation.id
        },
        data: {
          status: parsed.status,
          aiPaused: parsed.status !== "OPEN",
          humanTakeoverActive: parsed.status === "HUMAN",
          humanPriority: parsed.status === "HUMAN",
          currentQueue: parsed.status === "HUMAN" ? "human-escalation" : "incoming-message"
        }
      });

      const activeTakeover = await tx.humanTakeover.findFirst({
        where: {
          conversationId: conversation.id,
          active: true
        },
        orderBy: {
          startedAt: "desc"
        }
      });

      if (parsed.status === "HUMAN" && !activeTakeover) {
        await tx.humanTakeover.create({
          data: {
            conversationId: conversation.id,
            userId: user.id,
            mandateId,
            reason: "Conversa assumida manualmente.",
            active: true
          }
        });
      }

      if (parsed.status === "OPEN" && activeTakeover) {
        await tx.humanTakeover.update({
          where: {
            id: activeTakeover.id
          },
          data: {
            endedAt: new Date(),
            active: false
          }
        });
      }

      if (parsed.status === "CLOSED" && activeTakeover) {
        await tx.humanTakeover.update({
          where: {
            id: activeTakeover.id
          },
          data: {
            endedAt: new Date(),
            active: false
          }
        });
      }
    });

    return apiSuccess({
      message: "Status operacional atualizado com sucesso."
    });
  } catch (error) {
    return apiError(error);
  }
}
