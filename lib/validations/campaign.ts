import { z } from "zod";

import { CAMPAIGN_LIMITS } from "@/lib/campaign-settings";

const campaignStatuses = ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED", "COMPLETED", "FAILED"] as const;

export const campaignSchema = z.object({
  name: z.string().trim().min(3, "Informe um nome para a campanha."),
  templateId: z.string().cuid("Selecione um template válido."),
  segmentTags: z.array(z.string().trim().min(1)).max(20).default([]),
  groups: z.array(z.string().trim().min(1)).max(20).default([]),
  priorities: z.array(z.string().trim().min(1)).max(20).default([]),
  locations: z.array(z.string().trim().min(1)).max(20).default([]),
  interests: z.array(z.string().trim().min(1)).max(20).default([]),
  contactTypes: z.array(z.string().trim().min(1)).max(20).default([]),
  dailyLimit: z.coerce
    .number()
    .int()
    .min(
      CAMPAIGN_LIMITS.dailyLimit.min,
      `O limite diário deve ser de pelo menos ${CAMPAIGN_LIMITS.dailyLimit.min}.`
    )
    .max(
      CAMPAIGN_LIMITS.dailyLimit.max,
      `O limite diário deve ser de no máximo ${CAMPAIGN_LIMITS.dailyLimit.max}.`
    )
    .optional(),
  delaySeconds: z.coerce
    .number()
    .int()
    .min(
      CAMPAIGN_LIMITS.delaySeconds.min,
      `O intervalo deve ser de pelo menos ${CAMPAIGN_LIMITS.delaySeconds.min} segundos.`
    )
    .max(
      CAMPAIGN_LIMITS.delaySeconds.max,
      `O intervalo deve ser de no máximo ${CAMPAIGN_LIMITS.delaySeconds.max} segundos.`
    )
    .optional(),
  scheduledAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), "Data de agendamento inválida.")
});

export const campaignFiltersSchema = z.object({
  status: z.enum(campaignStatuses).optional(),
  eligibleCount: z.coerce.boolean().optional().default(false),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  groups: z.array(z.string().trim().min(1)).optional().default([]),
  priorities: z.array(z.string().trim().min(1)).optional().default([]),
  locations: z.array(z.string().trim().min(1)).optional().default([]),
  interests: z.array(z.string().trim().min(1)).optional().default([]),
  contactTypes: z.array(z.string().trim().min(1)).optional().default([])
});
