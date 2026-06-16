import {
  ConversationStatus,
  MessageDirection,
  QueuePriority,
} from "@prisma/client";
import {
  ApiRouteError,
  apiError,
  apiSuccess,
  parseRouteId,
  readJson,
  validateSchema,
} from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { canSendMessage } from "@/lib/compliance";
import { humanizeResponseTiming } from "@/lib/humanizer";
import { enqueueJob, QUEUE_NAMES } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/security";
import { conversationReplySchema } from "@/lib/validations/conversation";
import { logWhatsAppEvent } from "@/lib/whatsapp";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertRateLimit({
      key: `conversation:reply:${getClientIp(request)}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });

    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(conversationReplySchema, body);
    const { id } = await context.params;
    const conversationId = parseRouteId(id);

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        mandateId,
      },
      include: {
        citizen: true,
      },
    });

    if (!conversation) {
      throw new ApiRouteError(404, "Conversa não encontrada.", "NOT_FOUND");
    }

    const compliance = await canSendMessage({
      mandateId,
      conversationId: conversation.id,
      phone: conversation.citizen.phone,
      message: parsed.text,
    });

    if (!compliance.allowed) {
      throw new ApiRouteError(409, compliance.reason, "COMPLIANCE_BLOCKED");
    }

    const scheduledFor = new Date(
      Date.now() + humanizeResponseTiming(parsed.text),
    );

    await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          source: "HUMAN",
          content: parsed.text,
          queuedAt: new Date(),
        },
      });

      await tx.conversation.update({
        where: {
          id: conversation.id,
        },
        data: {
          status: ConversationStatus.HUMAN,
          aiPaused: true,
          humanTakeoverActive: true,
          humanPriority: true,
          currentQueue: QUEUE_NAMES.outgoing,
        },
      });

      const takeover = await tx.humanTakeover.findFirst({
        where: {
          conversationId: conversation.id,
          active: true,
        },
      });

      if (!takeover) {
        await tx.humanTakeover.create({
          data: {
            mandateId,
            conversationId: conversation.id,
            userId: user.id,
            reason: "Resposta manual enviada pela equipe.",
            active: true,
          },
        });
      }

      await enqueueJob(QUEUE_NAMES.outgoing, {
        mandateId,
        conversationId: conversation.id,
        messageId: message.id,
        direction: MessageDirection.OUTBOUND,
        priority: QueuePriority.HIGH,
        scheduledFor,
        payload: {
          queueRecordId: "",
          kind: "CONVERSATION",
          messageId: message.id,
          conversationId: conversation.id,
          mandateId,
          phone: conversation.citizen.phone,
          text: parsed.text,
          source: "HUMAN",
          scheduledFor: scheduledFor.toISOString(),
        },
      });
    });

    return apiSuccess({
      message: "Mensagem enviada para a fila de saída.",
    });
  } catch (error) {
    if (!(error instanceof ApiRouteError)) {
      const { id } = await context.params;

      logWhatsAppEvent("error", "manual_reply_failed", {
        conversationId: id,
        message: error instanceof Error ? error.message : "Erro desconhecido",
      });

      return apiError(
        new ApiRouteError(
          500,
          "Não foi possível enviar a mensagem pelo WhatsApp.",
          "WHATSAPP_SEND_FAILED",
        ),
      );
    }

    return apiError(error);
  }
}
