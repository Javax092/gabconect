import { prisma } from "@/lib/prisma";
import { updateCampaignLogStatus } from "@/lib/whatsapp-campaigns";

export async function handleWhatsAppStatusUpdate(input: {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason: string | null;
}) {
  await updateCampaignLogStatus(input);

  const message = await prisma.message.findFirst({
    where: {
      providerMessageId: input.providerMessageId
    }
  });

  if (!message) {
    return null;
  }

  const data =
    input.status === "sent"
      ? { sentAt: input.timestamp }
      : input.status === "delivered"
        ? { deliveredAt: input.timestamp }
        : input.status === "read"
          ? { readAt: input.timestamp }
          : { failedAt: input.timestamp, failureReason: input.failureReason ?? "Falha no envio." };

  return prisma.message.update({
    where: {
      id: message.id
    },
    data
  });
}
