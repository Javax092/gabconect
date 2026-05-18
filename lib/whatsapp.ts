type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
        }>;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        statuses?: Array<{
          id?: string;
          status?: "sent" | "delivered" | "read" | "failed";
          timestamp?: string;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
          }>;
        }>;
      };
    }>;
  }>;
};

export type ParsedWhatsAppMessage = {
  externalMessageId: string;
  fromPhone: string;
  profileName: string | null;
  text: string;
  timestamp: Date;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export type ParsedWhatsAppStatus = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason: string | null;
};

const WHATSAPP_GRAPH_VERSION = "v23.0";

function redactPhone(phone: string) {
  if (phone.length <= 4) {
    return phone;
  }

  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Configuração do WhatsApp ausente: defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
    );
  }

  return { accessToken, phoneNumberId };
}

export function logWhatsAppEvent(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(`[whatsapp:${event}]`, details);
}

export function parseWebhookMessage(payload: WhatsAppWebhookPayload): ParsedWhatsAppMessage[] {
  const parsedMessages: ParsedWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const contacts = change.value?.contacts ?? [];
      const messages = change.value?.messages ?? [];
      const profileName = contacts[0]?.profile?.name ?? null;
      const fallbackPhone = contacts[0]?.wa_id ?? null;
      const phoneNumberId = change.value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = change.value?.metadata?.display_phone_number ?? null;

      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body || !message.id) {
          continue;
        }

        const fromPhone = message.from ?? fallbackPhone;

        if (!fromPhone) {
          continue;
        }

        parsedMessages.push({
          externalMessageId: message.id,
          fromPhone,
          profileName,
          text: message.text.body.trim(),
          timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : new Date(),
          phoneNumberId,
          displayPhoneNumber
        });
      }
    }
  }

  return parsedMessages;
}

export function parseWebhookStatuses(payload: WhatsAppWebhookPayload): ParsedWhatsAppStatus[] {
  const parsedStatuses: ParsedWhatsAppStatus[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) {
          continue;
        }

        parsedStatuses.push({
          providerMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
          failureReason:
            status.errors?.map((item) => item.message || item.title).filter(Boolean).join(" | ") ||
            null
        });
      }
    }
  }

  return parsedStatuses;
}

export async function sendWhatsAppMessage(phone: string, text: string) {
  const { accessToken, phoneNumberId } = getWhatsAppConfig();

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          body: text,
          preview_url: false
        }
      })
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      }
    | null;

  if (!response.ok) {
    logWhatsAppEvent("error", "send_failed", {
      status: response.status,
      phone: redactPhone(phone),
      code: data?.error?.code ?? null
    });
    throw new Error(data?.error?.message ?? "Falha ao enviar mensagem pelo WhatsApp.");
  }

  const externalMessageId = data?.messages?.[0]?.id ?? null;

  logWhatsAppEvent("info", "message_sent", {
    phone: redactPhone(phone),
    externalMessageId
  });

  return {
    externalMessageId,
    providerMessageId: externalMessageId
  };
}
