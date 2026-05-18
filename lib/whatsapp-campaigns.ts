import {
  CampaignStatus,
  CampaignRecipientStatus,
  ContactStatus,
  Prisma,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_CAMPAIGN_SETTINGS, getCampaignSettings } from "@/lib/campaign-settings";

const WHATSAPP_GRAPH_VERSION = "v23.0";
const OPT_OUT_KEYWORDS = ["SAIR", "PARAR", "CANCELAR", "STOP"] as const;
const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"];

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

export function normalizePhone(phone: string) {
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
    OPT_OUT_KEYWORDS.find((keyword) =>
      normalized.split(/\s+/).some((token) => token === keyword)
    ) ?? null
  );
}

export function getEligibleContactWhere(mandateId: string, tags: string[]): Prisma.ContactWhereInput {
  return {
    mandateId,
    optIn: true,
    status: ContactStatus.ACTIVE,
    ...(tags.length > 0
      ? {
          tags: {
            hasEvery: tags
          }
        }
      : {})
  };
}

export async function countEligibleContacts(mandateId: string, tags: string[]) {
  return prisma.contact.count({
    where: getEligibleContactWhere(mandateId, tags)
  });
}

export async function syncCampaignCounters(campaignId: string) {
  const groups = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: {
      campaignId
    },
    _count: {
      _all: true
    }
  });

  const sentCount =
    groups.find((group) => group.status === CampaignRecipientStatus.SENT)?._count._all ?? 0;
  const failedCount =
    groups.find((group) => group.status === CampaignRecipientStatus.FAILED)?._count._all ?? 0;

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount
    }
  });
}

export async function createCampaignRecipients(campaignId: string, mandateId: string, tags: string[]) {
  const [contacts, existingRecipients] = await Promise.all([
    prisma.contact.findMany({
      where: getEligibleContactWhere(mandateId, tags),
      select: {
        id: true
      }
    }),
    prisma.campaignRecipient.findMany({
      where: {
        campaignId
      },
      select: {
        contactId: true
      }
    })
  ]);

  const existingContactIds = new Set(existingRecipients.map((recipient) => recipient.contactId));
  const newRecipients = contacts
    .filter((contact) => !existingContactIds.has(contact.id))
    .map((contact) => ({
      campaignId,
      contactId: contact.id
    }));

  if (newRecipients.length > 0) {
    await prisma.campaignRecipient.createMany({
      data: newRecipients
    });
  }

  return {
    eligibleContacts: contacts.length,
    createdRecipients: newRecipients.length
  };
}

export async function shouldPauseCampaignAfterFailure(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      mandateId: true
    }
  });

  if (!campaign) {
    return false;
  }

  const settings = await getCampaignSettings(campaign.mandateId);
  const take = settings.maxConsecutiveFailures ?? DEFAULT_CAMPAIGN_SETTINGS.maxConsecutiveFailures;
  const latestRecipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId,
      status: {
        in: [CampaignRecipientStatus.SENT, CampaignRecipientStatus.FAILED]
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take,
    select: {
      status: true
    }
  });

  return latestRecipients.length === take &&
    latestRecipients.every((recipient) => recipient.status === CampaignRecipientStatus.FAILED);
}

export async function markCampaignCompletedIfFinished(campaignId: string) {
  const pendingCount = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: CampaignRecipientStatus.PENDING
    }
  });

  if (pendingCount > 0) {
    return null;
  }

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.COMPLETED
    }
  });
}

export async function sendWhatsAppTemplateMessage(input: {
  mandateId: string;
  campaignId: string;
  campaignRecipientId: string;
  contact: {
    id: string;
    phone: string;
    name: string;
  };
  template: {
    id: string;
    metaTemplateName: string;
    language: string;
    body: string;
    status: WhatsAppTemplateStatus;
  };
}) {
  if (input.template.status !== WhatsAppTemplateStatus.APPROVED) {
    throw new Error("Somente templates aprovados podem ser usados em campanhas.");
  }

  const { accessToken, phoneNumberId } = getWhatsAppConfig();
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.contact.phone,
    type: "template",
    template: {
      name: input.template.metaTemplateName,
      language: {
        code: input.template.language
      }
    }
  };

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      }
    | null;

  if (!response.ok) {
    const errorMessage = data?.error?.message ?? "Falha ao enviar template pelo WhatsApp.";

    await prisma.whatsAppMessageLog.create({
      data: {
        mandateId: input.mandateId,
        contactId: input.contact.id,
        templateId: input.template.id,
        campaignId: input.campaignId,
        campaignRecipientId: input.campaignRecipientId,
        direction: "OUTBOUND",
        status: WhatsAppMessageLogStatus.FAILED,
        phone: input.contact.phone,
        errorMessage,
        payload: {
          request: payload,
          response: data
        },
        failedAt: new Date()
      }
    });

    throw new Error(errorMessage);
  }

  const providerMessageId = data?.messages?.[0]?.id ?? null;
  const now = new Date();

  const log = await prisma.whatsAppMessageLog.create({
    data: {
      mandateId: input.mandateId,
      contactId: input.contact.id,
      templateId: input.template.id,
      campaignId: input.campaignId,
      campaignRecipientId: input.campaignRecipientId,
      direction: "OUTBOUND",
      status: WhatsAppMessageLogStatus.ACCEPTED,
      providerMessageId,
      phone: input.contact.phone,
      payload: {
        request: payload,
        response: data
      },
      sentAt: now
    }
  });

  return {
    providerMessageId,
    sentAt: now,
    logId: log.id
  };
}

export async function registerContactOptOut(input: {
  mandateId: string;
  phone: string;
  name?: string | null;
  rawMessage: string;
  source?: string;
}) {
  const keyword = extractOptOutKeyword(input.rawMessage);

  if (!keyword) {
    return null;
  }

  const phone = normalizePhone(input.phone);
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
      optInAt: null
    },
    create: {
      mandateId: input.mandateId,
      name: input.name?.trim() || phone,
      phone,
      source: input.source ?? "WHATSAPP_WEBHOOK",
      optIn: false,
      optInAt: null,
      status: ContactStatus.UNSUBSCRIBED,
      tags: []
    }
  });

  const optOutEvent = await prisma.optOutEvent.create({
    data: {
      mandateId: input.mandateId,
      contactId: contact.id,
      keyword,
      source: input.source ?? "WHATSAPP_WEBHOOK",
      rawMessage: input.rawMessage
    }
  });

  await Promise.all([
    prisma.campaignRecipient.updateMany({
      where: {
        contactId: contact.id,
        status: CampaignRecipientStatus.PENDING,
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
    prisma.whatsAppMessageLog.create({
      data: {
        mandateId: input.mandateId,
        contactId: contact.id,
        direction: "INBOUND",
        status: WhatsAppMessageLogStatus.OPTED_OUT,
        phone,
        payload: {
          keyword,
          rawMessage: input.rawMessage
        }
      }
    })
  ]);

  return {
    contact,
    optOutEvent
  };
}

export async function updateCampaignLogStatus(input: {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason: string | null;
}) {
  const log = await prisma.whatsAppMessageLog.findFirst({
    where: {
      providerMessageId: input.providerMessageId
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      campaignRecipient: {
        include: {
          campaign: true
        }
      }
    }
  });

  if (!log) {
    return null;
  }

  const data =
    input.status === "sent"
      ? { status: WhatsAppMessageLogStatus.SENT, sentAt: input.timestamp }
      : input.status === "delivered"
        ? { status: WhatsAppMessageLogStatus.DELIVERED, deliveredAt: input.timestamp }
        : input.status === "read"
          ? { status: WhatsAppMessageLogStatus.READ, readAt: input.timestamp }
          : {
              status: WhatsAppMessageLogStatus.FAILED,
              failedAt: input.timestamp,
              errorMessage: input.failureReason ?? "Falha no envio."
            };

  await prisma.whatsAppMessageLog.update({
    where: {
      id: log.id
    },
    data
  });

  if (
    input.status === "failed" &&
    log.campaignRecipient &&
    log.campaignRecipient.status === CampaignRecipientStatus.SENT
  ) {
    await prisma.campaignRecipient.update({
      where: {
        id: log.campaignRecipient.id
      },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: input.failureReason ?? "Falha no envio."
      }
    });

    await syncCampaignCounters(log.campaignRecipient.campaignId);

    if (await shouldPauseCampaignAfterFailure(log.campaignRecipient.campaignId)) {
      await prisma.campaign.update({
        where: {
          id: log.campaignRecipient.campaignId
        },
        data: {
          status: CampaignStatus.PAUSED
        }
      });
    }
  }

  return log;
}
