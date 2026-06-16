import {
  CampaignStatus,
  CampaignRecipientStatus,
  ContactStatus,
  Prisma,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus,
} from "@prisma/client";

import {
  extractOptOutKeyword as extractCentralOptOutKeyword,
  registerOptOut,
} from "@/lib/consent";
import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import { materializeCampaignAudience } from "@/lib/campaign-audience";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  getCampaignSettings,
} from "@/lib/campaign-settings";
import { redactPhone } from "@/lib/security";
import {
  WhatsAppApiError,
  buildWhatsAppTemplateComponents,
  sendWhatsAppTemplateRequest,
  validateMetaWhatsAppTemplate,
} from "@/lib/whatsapp";
import {
  TEMPLATE_NOT_APPROVED,
  validateApprovedTemplateForRealSend,
} from "@/lib/whatsapp/templates";

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export function extractOptOutKeyword(text: string) {
  return extractCentralOptOutKeyword(text);
}

export function getEligibleContactWhere(
  mandateId: string,
  tags: string[],
): Prisma.ContactWhereInput {
  const normalizedTags = [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ];
  const skipAudienceValidation = isAudienceValidationBypassed();

  return {
    mandateId,
    // Original audience validation is preserved here and re-enabled by setting
    // SKIP_AUDIENCE_VALIDATION=false.
    ...(skipAudienceValidation
      ? {}
      : {
          optIn: true,
          status: ContactStatus.ACTIVE,
        }),
    ...(normalizedTags.length > 0
      ? {
          tags: {
            hasEvery: normalizedTags,
          },
        }
      : {}),
  };
}

export async function countEligibleContacts(mandateId: string, tags: string[]) {
  return prisma.contact.count({
    where: getEligibleContactWhere(mandateId, tags),
  });
}

export async function syncCampaignCounters(campaignId: string) {
  const groups = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: {
      campaignId,
    },
    _count: {
      _all: true,
    },
  });

  const sentCount =
    groups.find((group) => group.status === CampaignRecipientStatus.SENT)
      ?._count._all ?? 0;
  const failedCount =
    groups.find((group) => group.status === CampaignRecipientStatus.FAILED)
      ?._count._all ?? 0;

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount,
    },
  });
}

export async function createCampaignRecipients(
  campaignId: string,
  mandateId: string,
  tags: string[],
  options?: {
    birthdayMonthDay?: string | null;
    templateBody?: string;
    audienceFilter?: {
      birthdayMonthDay?: string | null;
      tags?: string[];
      groups?: string[];
      priorities?: string[];
      locations?: string[];
      interests?: string[];
      contactTypes?: string[];
      selectedContactIds?: string[];
    };
  },
) {
  const audience = await prisma.campaignAudienceConfig.findUnique({
    where: {
      campaignId,
    },
  });
  const audienceFilter = options?.audienceFilter ?? {
    birthdayMonthDay:
      options?.birthdayMonthDay ?? audience?.birthdayMonthDay ?? null,
    tags: audience?.tags ?? tags,
    groups: audience?.groups ?? [],
    priorities: audience?.priorities ?? [],
    locations: audience?.locations ?? [],
    interests: audience?.interests ?? [],
    contactTypes: audience?.contactTypes ?? [],
    selectedContactIds: audience?.selectedContactIds ?? [],
  };
  const materialized = await materializeCampaignAudience({
    campaignId,
    mandateId,
    templateBody: options?.templateBody ?? "",
    audienceFilter,
    selectedContactIds: audienceFilter.selectedContactIds ?? [],
  });

  return {
    eligibleContacts: materialized.totalElegiveis,
    createdRecipients: materialized.createdRecipients,
    totalInvalidos: materialized.totalInvalidos,
    totalBloqueados: materialized.totalBloqueados,
    totalOptOut: materialized.totalOptOut,
    totalSemTelefone: materialized.totalSemTelefone,
    totalSemOptIn: materialized.totalSemOptIn,
  };
}

export async function shouldPauseCampaignAfterFailure(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId,
    },
    select: {
      mandateId: true,
    },
  });

  if (!campaign) {
    return false;
  }

  const settings = await getCampaignSettings(campaign.mandateId);
  const take =
    settings.maxConsecutiveFailures ??
    DEFAULT_CAMPAIGN_SETTINGS.maxConsecutiveFailures;
  const latestRecipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId,
      status: {
        in: [CampaignRecipientStatus.SENT, CampaignRecipientStatus.FAILED],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take,
    select: {
      status: true,
    },
  });

  return (
    latestRecipients.length === take &&
    latestRecipients.every(
      (recipient) => recipient.status === CampaignRecipientStatus.FAILED,
    )
  );
}

export async function markCampaignCompletedIfFinished(campaignId: string) {
  const [pendingCount, statusGroups] = await Promise.all([
    prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: {
          in: [
            CampaignRecipientStatus.PENDING,
            CampaignRecipientStatus.PROCESSING,
            CampaignRecipientStatus.QUEUED,
          ],
        },
      },
    }),
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: {
        campaignId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const sentCount =
    statusGroups.find((group) => group.status === CampaignRecipientStatus.SENT)
      ?._count._all ?? 0;
  const totalRecipients = statusGroups.reduce(
    (total, group) => total + group._count._all,
    0,
  );

  if (pendingCount > 0 || totalRecipients === 0) {
    return null;
  }

  return prisma.campaign.update({
    where: {
      id: campaignId,
    },
    data: {
      status: sentCount > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED,
    },
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
    throw new Error(
      "Somente templates aprovados podem ser usados em campanhas.",
    );
  }

  const approvedTemplateValidation = validateApprovedTemplateForRealSend(
    input.template.metaTemplateName,
  );

  if (!approvedTemplateValidation.allowed) {
    throw new WhatsAppApiError(
      approvedTemplateValidation.message ?? "Template não aprovado na Meta.",
      {
        status: 400,
        retryable: false,
        details: {
          code: TEMPLATE_NOT_APPROVED,
          templateName: input.template.metaTemplateName,
          suggestion: "Use hello_world em ambiente de teste.",
        },
      },
    );
  }

  const metaValidation = await validateMetaWhatsAppTemplate({
    templateName: input.template.metaTemplateName,
    language: input.template.language,
    localBody: input.template.body,
  });

  if (!metaValidation.ok) {
    throw new WhatsAppApiError("Template inválido para envio pelo WhatsApp Cloud API.", {
      status: 409,
      retryable: false,
      details: metaValidation.details,
    });
  }

  const components = buildWhatsAppTemplateComponents({
    localBody: input.template.body,
    metaTemplate: metaValidation.metaTemplate,
    contact: {
      name: input.contact.name,
    },
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.contact.phone,
    type: "template",
    template: {
      name: input.template.metaTemplateName,
      language: {
        code: input.template.language,
      },
      ...(components?.length ? { components } : {}),
    },
  };

  let delivery: Awaited<ReturnType<typeof sendWhatsAppTemplateRequest>>;

  try {
    delivery = await sendWhatsAppTemplateRequest({
      phone: input.contact.phone,
      templateName: input.template.metaTemplateName,
      language: input.template.language,
      components,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Falha ao enviar template pelo WhatsApp.";
    const retryable =
      error instanceof WhatsAppApiError ? error.retryable : true;

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
          request: {
            type: payload.type,
            templateName: input.template.metaTemplateName,
            language: input.template.language,
            components,
            phone: redactPhone(input.contact.phone),
          },
          response: null,
          retryable,
        },
        failedAt: new Date(),
      },
    });

    if (error instanceof WhatsAppApiError) {
      throw error;
    }

    throw new Error(errorMessage);
  }

  const providerMessageId = delivery.providerMessageId;
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
        request: {
          type: payload.type,
          templateName: input.template.metaTemplateName,
          language: input.template.language,
          components,
          phone: redactPhone(input.contact.phone),
        },
        response: {
          providerMessageId,
        },
      },
      sentAt: now,
    },
  });

  return {
    providerMessageId,
    sentAt: now,
    logId: log.id,
  };
}

export async function registerContactOptOut(input: {
  mandateId: string;
  phone: string;
  name?: string | null;
  rawMessage: string;
  source?: string;
  ipAddress?: string | null;
  userId?: string | null;
}) {
  const result = await registerOptOut({
    mandateId: input.mandateId,
    phone: input.phone,
    name: input.name,
    rawMessage: input.rawMessage,
    source: input.source,
    ipAddress: input.ipAddress ?? null,
    userId: input.userId ?? null,
  });

  if (!result) {
    return null;
  }

  await prisma.whatsAppMessageLog.create({
    data: {
      mandateId: input.mandateId,
      contactId: result.contact.id,
      direction: "INBOUND",
      status: WhatsAppMessageLogStatus.OPTED_OUT,
      phone: normalizePhone(input.phone),
      payload: {
        keyword: result.keyword,
      },
    },
  });

  return {
    contact: result.contact,
    optOutEvent: result.optOutEvent,
    suppression: result.suppression,
    consentLog: result.consentLog,
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
      providerMessageId: input.providerMessageId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      campaignRecipient: {
        include: {
          campaign: true,
        },
      },
    },
  });

  if (!log) {
    return null;
  }

  const data =
    input.status === "sent"
      ? { status: WhatsAppMessageLogStatus.SENT, sentAt: input.timestamp }
      : input.status === "delivered"
        ? {
            status: WhatsAppMessageLogStatus.DELIVERED,
            deliveredAt: input.timestamp,
          }
        : input.status === "read"
          ? { status: WhatsAppMessageLogStatus.READ, readAt: input.timestamp }
          : {
              status: WhatsAppMessageLogStatus.FAILED,
              failedAt: input.timestamp,
              errorMessage: input.failureReason ?? "Falha no envio.",
            };

  await prisma.whatsAppMessageLog.update({
    where: {
      id: log.id,
    },
    data,
  });

  if (
    input.status === "failed" &&
    log.campaignRecipient &&
    log.campaignRecipient.status === CampaignRecipientStatus.SENT
  ) {
    await prisma.campaignRecipient.update({
      where: {
        id: log.campaignRecipient.id,
      },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorMessage: input.failureReason ?? "Falha no envio.",
      },
    });

    await syncCampaignCounters(log.campaignRecipient.campaignId);

    if (
      await shouldPauseCampaignAfterFailure(log.campaignRecipient.campaignId)
    ) {
      await prisma.campaign.update({
        where: {
          id: log.campaignRecipient.campaignId,
        },
        data: {
          status: CampaignStatus.PAUSED,
        },
      });
    }
  }

  return log;
}
