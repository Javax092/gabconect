import { createHmac, timingSafeEqual } from "node:crypto";

import { MessageDirection } from "@prisma/client";
import { NextResponse } from "next/server";

import { ApiRouteError, apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { enqueueJob, QUEUE_NAMES } from "@/lib/queue";
import { normalizePhone, registerContactOptOut } from "@/lib/whatsapp-campaigns";
import { logWhatsAppEvent, parseWebhookMessage, parseWebhookStatuses } from "@/lib/whatsapp";
import { handleWhatsAppStatusUpdate } from "@/lib/whatsapp-status";

export const runtime = "nodejs";

function getVerifyToken() {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    throw new Error("WHATSAPP_VERIFY_TOKEN não configurado.");
  }

  return verifyToken;
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  try {
    if (mode === "subscribe" && token === getVerifyToken() && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }

    return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Server error", { status: 500 });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    logWhatsAppEvent("warn", "invalid_signature", {});
    return apiError(new ApiRouteError(401, "Assinatura inválida.", "INVALID_SIGNATURE"));
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return apiError(new ApiRouteError(400, "Payload inválido.", "INVALID_JSON"));
  }

  const parsedMessages = parseWebhookMessage(payload as never);
  const parsedStatuses = parseWebhookStatuses(payload as never);

  logWhatsAppEvent("info", "webhook_received", {
    messages: parsedMessages.length,
    statuses: parsedStatuses.length
  });

  for (const status of parsedStatuses) {
    await handleWhatsAppStatusUpdate(status);
  }

  if (parsedMessages.length === 0) {
    return NextResponse.json({ received: true, ignored: true });
  }

  for (const message of parsedMessages) {
    const normalizedMessage = {
      externalMessageId: message.externalMessageId,
      fromPhone: message.fromPhone,
      profileName: message.profileName,
      text: message.text,
      timestamp: message.timestamp.toISOString(),
      phoneNumberId: message.phoneNumberId,
      displayPhoneNumber: message.displayPhoneNumber
    };

    const mandates = await prisma.mandate.findMany({
      select: {
        id: true,
        whatsappNumber: true
      }
    });

    const mandate =
      mandates.find((item) =>
        normalizePhone(item.whatsappNumber).endsWith(
          normalizePhone(message.displayPhoneNumber ?? "")
        )
      ) ?? mandates[0];

    if (!mandate) {
      logWhatsAppEvent("warn", "incoming_without_operation", {
        externalMessageId: message.externalMessageId
      });
      continue;
    }

    const optOut = await registerContactOptOut({
      mandateId: mandate.id,
      phone: message.fromPhone,
      name: message.profileName,
      rawMessage: message.text
    });

    if (optOut) {
      logWhatsAppEvent("info", "contact_opt_out", {
        contactId: optOut.contact.id,
        mandateId: mandate.id
      });
    }

    await enqueueJob(QUEUE_NAMES.incoming, {
      mandateId: mandate.id,
      direction: MessageDirection.INBOUND,
      payload: {
        queueRecordId: "",
        message: normalizedMessage
      }
    });
  }

  return NextResponse.json({ received: true });
}
