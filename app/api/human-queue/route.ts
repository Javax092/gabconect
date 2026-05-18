import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const conversations = await prisma.conversation.findMany({
      where: {
        mandateId,
        humanTakeoverActive: true
      },
      include: {
        citizen: true,
        messages: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        },
        takeovers: {
          where: {
            active: true
          },
          orderBy: {
            startedAt: "desc"
          },
          take: 1,
          include: {
            user: true
          }
        }
      },
      orderBy: [{ humanPriority: "desc" }, { lastMessageAt: "desc" }]
    });

    return apiSuccess({ conversations });
  } catch (error) {
    return apiError(error);
  }
}
