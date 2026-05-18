import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const conversationId = parseRouteId(id);

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        mandateId
      },
      include: {
        citizen: true,
        messages: {
          orderBy: {
            createdAt: "asc"
          }
        },
        demands: {
          include: {
            category: true
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!conversation) {
      throw new ApiRouteError(404, "Conversa não encontrada.", "NOT_FOUND");
    }

    return apiSuccess({ conversation });
  } catch (error) {
    return apiError(error);
  }
}
