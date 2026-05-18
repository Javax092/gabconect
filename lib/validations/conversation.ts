import { ConversationStatus } from "@prisma/client";
import { z } from "zod";

export const conversationReplySchema = z.object({
  text: z.string().trim().min(1, "Digite uma mensagem.").max(2000, "Mensagem muito longa.")
});

export const conversationStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus)
});
