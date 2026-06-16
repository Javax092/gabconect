import { z } from "zod";

import { CAMPAIGN_LIMITS } from "@/lib/campaign-settings";

const campaignStatuses = [
  "DRAFT",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
const campaignModes = ["TEST", "BIRTHDAY", "AUDIENCE"] as const;

export type CampaignMode = (typeof campaignModes)[number];

const audienceConfigSchema = z
  .object({
    birthdayMonthDay: z
      .string()
      .regex(/^\d{2}-\d{2}$/, "Formato deve ser MM-DD")
      .optional()
      .nullable(),
    tags: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    groups: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    priorities: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    locations: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    interests: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    contactTypes: z.array(z.string().trim().min(1)).max(20).optional().default([]),
    selectedContactIds: z.array(z.string().cuid()).max(1000).optional().default([]),
  })
  .optional();

export const campaignSchema = z
  .object({
    name: z.string().trim().min(3, "Informe um nome para a campanha."),
    templateId: z.string().cuid("Selecione um template válido."),
    campaignMode: z.enum(campaignModes).optional().default("TEST"),
    source: z.string().trim().max(80).optional(),
    action: z.string().trim().max(80).optional(),
    confirmedAudience: z.boolean().optional(),
    audienceConfig: audienceConfigSchema,
    selectedContactIds: z.array(z.string().cuid()).max(1000).default([]),
    segmentTags: z.array(z.string().trim().min(1)).max(20).default([]),
    groups: z.array(z.string().trim().min(1)).max(20).default([]),
    priorities: z.array(z.string().trim().min(1)).max(20).default([]),
    locations: z.array(z.string().trim().min(1)).max(20).default([]),
    interests: z.array(z.string().trim().min(1)).max(20).default([]),
    contactTypes: z.array(z.string().trim().min(1)).max(20).default([]),
    birthdayMonthDay: z
      .string()
      .regex(/^\d{2}-\d{2}$/, "Formato deve ser MM-DD")
      .optional()
      .nullable(),
    dailyLimit: z.coerce
      .number()
      .int()
      .min(
        CAMPAIGN_LIMITS.dailyLimit.min,
        `O limite diário deve ser de pelo menos ${CAMPAIGN_LIMITS.dailyLimit.min}.`,
      )
      .max(
        CAMPAIGN_LIMITS.dailyLimit.max,
        `O limite diário deve ser de no máximo ${CAMPAIGN_LIMITS.dailyLimit.max}.`,
      )
      .optional(),
    delaySeconds: z.coerce
      .number()
      .int()
      .min(
        CAMPAIGN_LIMITS.delaySeconds.min,
        `O intervalo deve ser de pelo menos ${CAMPAIGN_LIMITS.delaySeconds.min} segundos.`,
      )
      .max(
        CAMPAIGN_LIMITS.delaySeconds.max,
        `O intervalo deve ser de no máximo ${CAMPAIGN_LIMITS.delaySeconds.max} segundos.`,
      )
      .optional(),
    scheduledAt: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        "Data de agendamento inválida.",
      ),
  })
  .refine(
    (data) => {
      // TEST campaigns MUST have selected contacts
      if (
        data.campaignMode === "TEST" &&
        data.selectedContactIds.length === 0
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Campanhas TEST requerem pelo menos 1 contato selecionado.",
      path: ["selectedContactIds"],
    },
  )
  .refine(
    (data) => {
      // BIRTHDAY campaigns MUST have birthdayMonthDay
      if (data.campaignMode === "BIRTHDAY" && !data.birthdayMonthDay) {
        return false;
      }
      return true;
    },
    {
      message: "Campanhas de aniversário requerem uma data (MM-DD).",
      path: ["birthdayMonthDay"],
    },
  )
  .refine(
    (data) => {
      // AUDIENCE campaigns MUST have at least one filter
      if (data.campaignMode === "AUDIENCE") {
        const hasFilters =
          data.segmentTags.length > 0 ||
          data.groups.length > 0 ||
          data.priorities.length > 0 ||
          data.locations.length > 0 ||
          data.interests.length > 0 ||
          data.contactTypes.length > 0;

        if (!hasFilters) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Campanhas de audiência requerem pelo menos um filtro.",
      path: ["segmentTags"],
    },
  );

export const campaignFiltersSchema = z.object({
  status: z.enum(campaignStatuses).optional(),
  eligibleCount: z.coerce.boolean().optional().default(false),
  query: z.string().trim().optional().default(""),
  optInFilter: z
    .enum(["ALL", "OPT_IN", "SEM_OPT_IN", "OPT_OUT"])
    .optional()
    .default("ALL"),
  contactStatus: z
    .enum(["ALL", "ACTIVE", "UNSUBSCRIBED", "BLOCKED", "INVALID"])
    .optional()
    .default("ALL"),
  birthdayFilter: z
    .enum(["ALL", "WITH_BIRTHDAY", "TODAY"])
    .optional()
    .default("ALL"),
  selectedOnly: z.coerce.boolean().optional().default(false),
  selectedContactIds: z.array(z.string().cuid()).optional().default([]),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.enum(["name", "code", "importedAt"]).optional().default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  groups: z.array(z.string().trim().min(1)).optional().default([]),
  priorities: z.array(z.string().trim().min(1)).optional().default([]),
  locations: z.array(z.string().trim().min(1)).optional().default([]),
  interests: z.array(z.string().trim().min(1)).optional().default([]),
  contactTypes: z.array(z.string().trim().min(1)).optional().default([]),
});
