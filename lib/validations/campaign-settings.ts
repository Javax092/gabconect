import { WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@prisma/client";
import { z } from "zod";

import { CAMPAIGN_LIMITS } from "@/lib/campaign-settings";

export const campaignSettingsSchema = z.object({
  defaultDailyLimit: z.coerce
    .number()
    .int()
    .min(
      CAMPAIGN_LIMITS.dailyLimit.min,
      `O limite diário deve ser de pelo menos ${CAMPAIGN_LIMITS.dailyLimit.min}.`
    )
    .max(
      CAMPAIGN_LIMITS.dailyLimit.max,
      `O limite diário deve ser de no máximo ${CAMPAIGN_LIMITS.dailyLimit.max}.`
    ),
  defaultDelaySeconds: z.coerce
    .number()
    .int()
    .min(
      CAMPAIGN_LIMITS.delaySeconds.min,
      `O intervalo deve ser de pelo menos ${CAMPAIGN_LIMITS.delaySeconds.min} segundos.`
    )
    .max(
      CAMPAIGN_LIMITS.delaySeconds.max,
      `O intervalo deve ser de no máximo ${CAMPAIGN_LIMITS.delaySeconds.max} segundos.`
    ),
  maxConsecutiveFailures: z.coerce
    .number()
    .int()
    .min(
      CAMPAIGN_LIMITS.maxConsecutiveFailures.min,
      `O limite de falhas consecutivas deve ser de pelo menos ${CAMPAIGN_LIMITS.maxConsecutiveFailures.min}.`
    )
    .max(
      CAMPAIGN_LIMITS.maxConsecutiveFailures.max,
      `O limite de falhas consecutivas deve ser de no máximo ${CAMPAIGN_LIMITS.maxConsecutiveFailures.max}.`
    )
});

export const whatsAppTemplateSchema = z.object({
  name: z.string().trim().min(3, "Informe um nome interno para o template."),
  metaTemplateName: z
    .string()
    .trim()
    .min(3, "Informe o nome oficial do template na Meta."),
  language: z.string().trim().min(2, "Informe o idioma do template."),
  category: z.nativeEnum(WhatsAppTemplateCategory, {
    errorMap: () => ({ message: "Categoria de template inválida." })
  }),
  status: z.nativeEnum(WhatsAppTemplateStatus, {
    errorMap: () => ({ message: "Status do template inválido." })
  }),
  body: z.string().trim().min(3, "Informe um corpo de referência para o template.")
});
