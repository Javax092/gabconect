import { CampaignRecipientStatus, CampaignStatus, ConsentAction, ContactStatus, Prisma } from "@prisma/client";

import { cancelQueuedCampaignDeliveries } from "@/lib/campaign-queue-cancellation";
import { prisma } from "@/lib/prisma";

const OPT_OUT_KEYWORDS = ["UNSUBSCRIBE", "STOP", "SAIR", "CANCELAR", "PARAR", "REMOVER"] as const;
const OPT_OUT_PHRASES = ["NAO QUERO", "NÃO QUERO"] as const;
const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.SCHEDULED,
  CampaignStatus.RUNNING,
  CampaignStatus.PAUSED
];

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function normalizeKeywordText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function extractOptOutKeyword(text: string) {
  const normalized = normalizeKeywordText(text);

  return (
    OPT_OUT_PHRASES.find((keyword) => normalized.includes(normalizeKeywordText(keyword))) ??
    OPT_OUT_KEYWORDS.find((keyword) =>
      normalized.split(/\s+/).some((token) => token === keyword)
    ) ?? null
  );
}

export async function recordConsent(input: {
  mandateId: string;
  contactId?: string | null;
  phone: string;
  action: ConsentAction;
  source: string;
  reason?: string | null;
  ipAddress?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.consentLog.create({
    data: {
      mandateId: input.mandateId,
      contactId: input.contactId ?? null,
      phone: normalizePhone(input.phone),
      action: input.action,
      source: input.source,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userId: input.userId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}

export async function suppressContact(input: {
  mandateId: string;
  contactId?: string | null;
  phone: string;
  reason: string;
  source: string;
}) {
  const phone = normalizePhone(input.phone);

  return prisma.suppressionList.upsert({
    where: {
      mandateId_phone: {
        mandateId: input.mandateId,
        phone
      }
    },
    update: {
      contactId: input.contactId ?? undefined,
      reason: input.reason,
      source: input.source,
      active: true
    },
    create: {
      mandateId: input.mandateId,
      contactId: input.contactId ?? null,
      phone,
      reason: input.reason,
      source: input.source,
      active: true
    }
  });
}

export async function registerOptOut(input: {
  mandateId: string;
  phone: string;
  name?: string | null;
  rawMessage: string;
  source?: string;
  ipAddress?: string | null;
  userId?: string | null;
}) {
  const keyword = extractOptOutKeyword(input.rawMessage);

  if (!keyword) {
    return null;
  }

  const phone = normalizePhone(input.phone);
  const source = input.source ?? "WHATSAPP_WEBHOOK";
  const contact = await prisma.contact.upsert({
    where: {
      mandateId_phone: {
        mandateId: input.mandateId,
        phone
      }
    },
    update: {
      name: input.name?.trim() || undefined,
      status: ContactStatus.UNSUBSCRIBED,
      optIn: false,
      optInAt: null,
      optOutAt: new Date(),
      consentStatus: "OPTED_OUT",
      blockedFromCampaigns: true
    },
    create: {
      mandateId: input.mandateId,
      name: input.name?.trim() || phone,
      phone,
      source,
      optIn: false,
      optInAt: null,
      optOutAt: new Date(),
      consentStatus: "OPTED_OUT",
      blockedFromCampaigns: true,
      status: ContactStatus.UNSUBSCRIBED,
      tags: []
    }
  });

  const [suppression, consentLog, optOutEvent] = await Promise.all([
    suppressContact({
      mandateId: input.mandateId,
      contactId: contact.id,
      phone,
      reason: `Opt-out recebido via palavra-chave ${keyword}.`,
      source
    }),
    recordConsent({
      mandateId: input.mandateId,
      contactId: contact.id,
      phone,
      action: ConsentAction.OPT_OUT,
      source,
      reason: `Opt-out por ${keyword}`,
      ipAddress: input.ipAddress ?? null,
      userId: input.userId ?? null,
      metadata: {
        keyword
      }
    }),
    prisma.optOutEvent.create({
      data: {
        mandateId: input.mandateId,
        contactId: contact.id,
        keyword,
        source,
        rawMessage: input.rawMessage
      }
    })
  ]);

  await Promise.all([
    prisma.campaignRecipient.updateMany({
      where: {
        contactId: contact.id,
        status: {
          in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED]
        },
        campaign: {
          status: {
            in: ACTIVE_CAMPAIGN_STATUSES
          }
        }
      },
      data: {
        status: CampaignRecipientStatus.UNSUBSCRIBED,
        errorMessage: `Contato descadastrado via resposta "${keyword}".`
      }
    }),
    prisma.sendAttempt.create({
      data: {
        mandateId: input.mandateId,
        contactId: contact.id,
        phone,
        status: "OPT_OUT",
        reason: `Opt-out por ${keyword}`,
        metadata: {
          source
        }
      }
    })
  ]);
  await cancelQueuedCampaignDeliveries({
    mandateId: input.mandateId,
    contactId: contact.id,
    reason: `Contato em opt-out por ${keyword}.`
  });

  console.info("[contact:consent:opted-out]", {
    mandateId: input.mandateId,
    contactId: contact.id,
    keyword
  });

  return {
    contact,
    keyword,
    suppression,
    consentLog,
    optOutEvent
  };
}
