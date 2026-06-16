import {
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  Prisma,
  SendAttemptStatus,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import { validateConversationWindow } from "@/lib/compliance";
import { getCampaignModeDailyCap, getSendLimitConfig, isMassCampaignEnabled } from "@/lib/mass-campaign-config";
import { prisma } from "@/lib/prisma";
import { assertRedisRateLimit } from "@/lib/redis-rate-limit";
import { recordSendAttempt } from "@/lib/send-attempts";

type SendGateContext = {
  mandateId: string;
  phone: string;
  contactId?: string | null;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  conversationId?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  queueRecordId?: string | null;
  retryCount?: number;
  kind: "CAMPAIGN" | "CONVERSATION" | "TEST";
  now?: Date;
  dryRun?: boolean;
};

type SendGateResult =
  | {
      allowed: true;
      phone: string;
      contactId: string | null;
    }
  | {
      allowed: false;
      status: SendAttemptStatus;
      reason: string;
    };

const SENDABLE_RECIPIENT_STATUSES: CampaignRecipientStatus[] = [
  CampaignRecipientStatus.PENDING,
  CampaignRecipientStatus.QUEUED,
  CampaignRecipientStatus.PROCESSING
];

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function dayBounds(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isWithinSendingHours(now: Date) {
  const hour = now.getHours();
  return hour >= 8 && hour < 18;
}

function sendAttemptBase(input: SendGateContext, phone: string, contactId: string | null) {
  return {
    mandateId: input.mandateId,
    campaignId: input.campaignId ?? null,
    campaignRecipientId: input.campaignRecipientId ?? null,
    contactId,
    phone,
    template: input.templateName ?? null,
    queueRecordId: input.queueRecordId ?? null,
    retryCount: input.retryCount ?? 0
  };
}

async function block(input: SendGateContext, phone: string, contactId: string | null, status: SendAttemptStatus, reason: string) {
  await recordSendAttempt({
    ...sendAttemptBase(input, phone, contactId),
    status,
    reason
  });

  return {
    allowed: false,
    status,
    reason
  } satisfies SendGateResult;
}

async function assertRedisSendLimits(input: SendGateContext, phone: string) {
  const config = getSendLimitConfig();
  const scope = `whatsapp:send:${input.mandateId}`;

  await assertRedisRateLimit({
    key: `${scope}:minute`,
    limit: config.perMinute,
    windowSeconds: 60
  });
  await assertRedisRateLimit({
    key: `${scope}:hour`,
    limit: config.perHour,
    windowSeconds: 60 * 60
  });
  await assertRedisRateLimit({
    key: `${scope}:day`,
    limit: config.perDay,
    windowSeconds: 24 * 60 * 60
  });

  if (input.campaignId) {
    await assertRedisRateLimit({
      key: `${scope}:campaign:${input.campaignId}:day`,
      limit: config.perDay,
      windowSeconds: 24 * 60 * 60
    });
  }

  return phone;
}

type CampaignGateDecision =
  | {
      allowed: true;
      contactId: string;
      campaignDailyLimit: number;
    }
  | {
      allowed: false;
      contactId: string | null;
      status: SendAttemptStatus;
      reason: string;
    };

async function validateCampaignSendInTransaction(input: SendGateContext, phone: string, now: Date, skipAudienceValidation: boolean) {
  return prisma.$transaction(async (tx): Promise<CampaignGateDecision> => {
    const [contact, suppression] = await Promise.all([
      input.contactId
        ? tx.contact.findFirst({
            where: {
              id: input.contactId,
              mandateId: input.mandateId
            }
          })
        : tx.contact.findUnique({
            where: {
              mandateId_phone: {
                mandateId: input.mandateId,
                phone
              }
            }
          }),
      skipAudienceValidation
        ? Promise.resolve(null)
        : tx.suppressionList.findUnique({
            where: {
              mandateId_phone: {
                mandateId: input.mandateId,
                phone
              }
            }
          })
    ]);
    const contactId = contact?.id ?? input.contactId ?? null;

    // These are the original campaign audience eligibility checks. They remain
    // in place and are restored by setting SKIP_AUDIENCE_VALIDATION=false.
    if (!skipAudienceValidation && suppression?.active) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.OPT_OUT,
        reason: "Contato consta na SuppressionList."
      };
    }

    if (!skipAudienceValidation && !contact) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.BLOCKED,
        reason: "Campanha exige contato cadastrado e ativo."
      };
    }

    if (!skipAudienceValidation && contact && (contact.status === ContactStatus.UNSUBSCRIBED || contact.optIn === false)) {
      return {
        allowed: false,
        contactId: contact.id,
        status: SendAttemptStatus.OPT_OUT,
        reason: "Contato sem opt-in ativo."
      };
    }

    if (!skipAudienceValidation && contact && contact.status !== ContactStatus.ACTIVE) {
      return {
        allowed: false,
        contactId: contact.id,
        status: SendAttemptStatus.BLOCKED,
        reason: "Contato não está ativo."
      };
    }

    const campaign = input.campaignId
      ? await tx.campaign.findFirst({
          where: {
            id: input.campaignId,
            mandateId: input.mandateId
          },
          include: {
            template: true
          }
        })
      : null;

    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.CANCELLED,
        reason: "Campanha não está ativa."
      };
    }

    if (campaign.template.status !== WhatsAppTemplateStatus.APPROVED) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.BLOCKED,
        reason: "Template não aprovado pela Meta."
      };
    }

    if (!contactId) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.CANCELLED,
        reason: "Destinatário sem contato vinculado."
      };
    }

    const recipient = input.campaignRecipientId
      ? await tx.campaignRecipient.findFirst({
          where: {
            id: input.campaignRecipientId,
            campaignId: campaign.id,
            contactId
          }
        })
      : null;

    if (!recipient || !SENDABLE_RECIPIENT_STATUSES.includes(recipient.status)) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.CANCELLED,
        reason: "Destinatário cancelado, já processado ou inelegível."
      };
    }

    const { start, end } = dayBounds(now);
    const [campaignSentToday, mandateSentToday] = await Promise.all([
      tx.campaignRecipient.count({
        where: {
          campaignId: campaign.id,
          status: CampaignRecipientStatus.SENT,
          sentAt: {
            gte: start,
            lt: end
          }
        }
      }),
      tx.sendAttempt.count({
        where: {
          mandateId: input.mandateId,
          status: {
            in: [SendAttemptStatus.SENT, SendAttemptStatus.SIMULATED]
          },
          createdAt: {
            gte: start,
            lt: end
          }
        }
      })
    ]);
    const modeCap = getCampaignModeDailyCap(campaign.campaignMode);
    const campaignDailyLimit = Math.min(campaign.dailyLimit, modeCap);

    if (campaignSentToday >= campaignDailyLimit) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.RATE_LIMITED,
        reason: "Limite diário da campanha excedido."
      };
    }

    if (mandateSentToday >= getSendLimitConfig().perDay) {
      return {
        allowed: false,
        contactId,
        status: SendAttemptStatus.RATE_LIMITED,
        reason: "Limite diário do mandato excedido."
      };
    }

    return {
      allowed: true,
      contactId,
      campaignDailyLimit
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function runSendGate(input: SendGateContext): Promise<SendGateResult> {
  const now = input.now ?? new Date();
  const phone = normalizePhone(input.phone);
  const skipCampaignAudienceValidation =
    input.kind === "CAMPAIGN" && isAudienceValidationBypassed();

  if (!phone) {
    return block(input, phone, input.contactId ?? null, SendAttemptStatus.BLOCKED, "Telefone ausente ou inválido.");
  }

  if (!isWithinSendingHours(now)) {
    return block(input, phone, input.contactId ?? null, SendAttemptStatus.BLOCKED, "Fora do horário permitido de envio.");
  }

  if (!input.dryRun && (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)) {
    return block(input, phone, input.contactId ?? null, SendAttemptStatus.BLOCKED, "WhatsApp Cloud API não configurada.");
  }

  const [contact, suppression] = await Promise.all([
    input.contactId
      ? prisma.contact.findFirst({
          where: {
            id: input.contactId,
            mandateId: input.mandateId
          }
        })
      : prisma.contact.findUnique({
          where: {
            mandateId_phone: {
              mandateId: input.mandateId,
              phone
            }
          }
        }),
    skipCampaignAudienceValidation
      ? Promise.resolve(null)
      : prisma.suppressionList.findUnique({
          where: {
            mandateId_phone: {
              mandateId: input.mandateId,
              phone
            }
          }
        })
  ]);
  const contactId = contact?.id ?? input.contactId ?? null;

  // Suppression, opt-in and contact-status checks are audience eligibility
  // guards for campaigns. The bypass does not affect conversations/tests.
  if (!skipCampaignAudienceValidation && suppression?.active) {
    return block(input, phone, contactId, SendAttemptStatus.OPT_OUT, "Contato consta na SuppressionList.");
  }

  if (!skipCampaignAudienceValidation && (contact?.status === ContactStatus.UNSUBSCRIBED || contact?.optIn === false)) {
    return block(input, phone, contactId, SendAttemptStatus.OPT_OUT, "Contato sem opt-in ativo.");
  }

  if (!skipCampaignAudienceValidation && contact && contact.status !== ContactStatus.ACTIVE) {
    return block(input, phone, contactId, SendAttemptStatus.BLOCKED, "Contato não está ativo.");
  }

  if (input.kind === "CAMPAIGN") {
    if (!isMassCampaignEnabled()) {
      return block(
        input,
        phone,
        contactId,
        SendAttemptStatus.BLOCKED,
        "Campanhas em massa desabilitadas por WHATSAPP_MASS_CAMPAIGN_ENABLED."
      );
    }

    const campaignGate = await validateCampaignSendInTransaction(input, phone, now, skipCampaignAudienceValidation);

    if (!campaignGate.allowed) {
      return block(input, phone, campaignGate.contactId, campaignGate.status, campaignGate.reason);
    }
  }

  if (input.kind === "CONVERSATION" && input.conversationId && !input.templateName) {
    const lastInbound = await prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: "INBOUND"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const windowState = validateConversationWindow(lastInbound?.createdAt ?? null, now);

    if (!windowState.metaWindowOpen) {
      return block(input, phone, contactId, SendAttemptStatus.BLOCKED, "Janela de 24h da Meta encerrada.");
    }
  }

  if (!input.dryRun) {
    try {
      await assertRedisSendLimits(input, phone);
    } catch (error) {
      await recordSendAttempt({
        ...sendAttemptBase(input, phone, contactId),
        status: SendAttemptStatus.RATE_LIMITED,
        reason: error instanceof Error ? error.message : "Limite operacional excedido."
      });
      return {
        allowed: false,
        status: SendAttemptStatus.RATE_LIMITED,
        reason: error instanceof Error ? error.message : "Limite operacional excedido."
      };
    }
  }

  return {
    allowed: true,
    phone,
    contactId
  };
}
