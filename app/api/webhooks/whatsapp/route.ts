import { createHmac, timingSafeEqual } from "node:crypto";

import { MessageDirection, WhatsAppMessageLogStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ApiRouteError, apiError } from "@/lib/api";
import { CONSENT_OPTED_IN } from "@/lib/first-contact";
import { invalidateContactOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { enqueueJob, QUEUE_NAMES } from "@/lib/queue";
import {
  assertRateLimit,
  getClientIp,
  isProductionRuntime,
  redactIdentifier,
} from "@/lib/security";
import {
  normalizePhone,
  registerContactOptOut,
} from "@/lib/whatsapp-campaigns";
import {
  logWhatsAppEvent,
  parseWebhookMessage,
  parseWebhookStatuses,
} from "@/lib/whatsapp";
import { handleWhatsAppStatusUpdate } from "@/lib/whatsapp-status";

export const runtime = "nodejs";

const VERIFY_TOKEN =
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
  process.env.WEBHOOK_VERIFY_TOKEN ||
  "flowtech-whatsapp-2026";
const VERIFY_TOKENS = new Set(
  [
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    process.env.WEBHOOK_VERIFY_TOKEN,
    VERIFY_TOKEN,
    "flowtech-whatsapp-2026",
  ].filter((token): token is string => Boolean(token)),
);

function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    if (isProductionRuntime()) {
      throw new ApiRouteError(
        500,
        "META_APP_SECRET obrigatório em produção.",
        "META_APP_SECRET_REQUIRED",
      );
    }

    logWhatsAppEvent("warn", "signature_validation_disabled", {
      production: false,
    });
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  console.log("[whatsapp:webhook:verify]", {
    mode,
    hasToken: Boolean(token),
    hasChallenge: Boolean(challenge),
    expectedConfigured: Boolean(VERIFY_TOKEN),
    tokenMatches: Boolean(token && VERIFY_TOKENS.has(token)),
  });

  if (mode === "subscribe" && token && VERIFY_TOKENS.has(token) && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `webhook:whatsapp:${getClientIp(request)}`,
      limit: 120,
      windowMs: 60_000,
    });
  } catch (error) {
    return apiError(error);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  try {
    if (!verifyMetaSignature(rawBody, signature)) {
      logWhatsAppEvent("warn", "invalid_signature", {
        hasSignature: Boolean(signature),
      });
      return apiError(
        new ApiRouteError(401, "Assinatura inválida.", "INVALID_SIGNATURE"),
      );
    }
  } catch (error) {
    return apiError(error);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return apiError(
      new ApiRouteError(400, "Payload inválido.", "INVALID_JSON"),
    );
  }

  const parsedMessages = parseWebhookMessage(payload as never);
  const parsedStatuses = parseWebhookStatuses(payload as never);

  logWhatsAppEvent("info", "webhook_received", {
    messages: parsedMessages.length,
    statuses: parsedStatuses.length,
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
      displayPhoneNumber: message.displayPhoneNumber,
    };

    const mandates = await prisma.mandate.findMany({
      select: {
        id: true,
        whatsappNumber: true,
      },
    });

    const mandate =
      mandates.find((item) =>
        normalizePhone(item.whatsappNumber).endsWith(
          normalizePhone(message.displayPhoneNumber ?? ""),
        ),
      ) ?? mandates[0];

    if (!mandate) {
      logWhatsAppEvent("warn", "incoming_without_operation", {
        externalMessageId: redactIdentifier(message.externalMessageId),
      });
      continue;
    }

    const optOut = await registerContactOptOut({
      mandateId: mandate.id,
      phone: message.fromPhone,
      name: message.profileName,
      rawMessage: message.text,
      ipAddress: getClientIp(request),
    });

    if (optOut) {
      invalidateContactOperationalCache(mandate.id);
      logWhatsAppEvent("info", "contact_opt_out", {
        contactId: optOut.contact.id,
        mandateId: mandate.id,
      });
      console.info("[contact:consent:opted-out]", {
        contactId: optOut.contact.id,
        mandateId: mandate.id,
      });
    } else {
      const phone = normalizePhone(message.fromPhone);
      const now = new Date();
      const contact = await prisma.contact.upsert({
        where: {
          mandateId_phone: {
            mandateId: mandate.id,
            phone,
          },
        },
        update: {
          name: message.profileName?.trim() || undefined,
          optIn: true,
          optInAt: now,
          lastInboundAt: now,
          consentStatus: CONSENT_OPTED_IN,
        },
        create: {
          mandateId: mandate.id,
          name: message.profileName?.trim() || phone,
          phone,
          source: "WHATSAPP_WEBHOOK",
          optIn: true,
          optInAt: now,
          lastInboundAt: now,
          consentStatus: CONSENT_OPTED_IN,
          tags: [],
        },
      });
      invalidateContactOperationalCache(mandate.id);
      console.info("[contact:consent:opted-in]", {
        contactId: contact.id,
        mandateId: mandate.id,
      });
    }

    const alreadyProcessed = await prisma.message.findUnique({
      where: {
        externalMessageId: message.externalMessageId,
      },
      select: {
        id: true,
      },
    });

    const existingInboundLog = await prisma.whatsAppMessageLog.findFirst({
      where: {
        providerMessageId: message.externalMessageId,
        direction: "INBOUND",
      },
      select: {
        id: true,
      },
    });

    if (!existingInboundLog) {
      await prisma.whatsAppMessageLog.create({
        data: {
          mandateId: mandate.id,
          direction: "INBOUND",
          status: WhatsAppMessageLogStatus.RECEIVED,
          providerMessageId: message.externalMessageId,
          phone: normalizePhone(message.fromPhone),
          payload: {
            type: "webhook_message",
            externalMessageId: message.externalMessageId,
            phoneNumberId: message.phoneNumberId,
            displayPhoneNumber: message.displayPhoneNumber,
            receivedAt: message.timestamp.toISOString(),
          },
        },
      });
    }

    if (alreadyProcessed) {
      logWhatsAppEvent("info", "incoming_duplicate_ignored", {
        externalMessageId: redactIdentifier(message.externalMessageId),
        mandateId: mandate.id,
      });
      continue;
    }

    await enqueueJob(QUEUE_NAMES.incoming, {
      mandateId: mandate.id,
      direction: MessageDirection.INBOUND,
      payload: {
        queueRecordId: "",
        message: normalizedMessage,
      },
    });
  }

  return NextResponse.json({ received: true });
}
