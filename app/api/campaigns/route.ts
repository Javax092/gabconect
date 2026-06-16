import {
  CampaignRecipientStatus,
  CampaignStatus,
  WhatsAppTemplateStatus,
} from "@prisma/client";

import {
  ApiRouteError,
  apiError,
  apiSuccess,
  readJson,
  validateSchema,
} from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import {
  countAudienceContacts,
  flattenAudience,
  syncCampaignOperationState,
} from "@/lib/campaign-infrastructure";
import { resolveAudienceFilterByMode } from "@/lib/campaign-execution";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { invalidateCampaignOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/security";
import {
  campaignFiltersSchema,
  campaignSchema,
} from "@/lib/validations/campaign";

function normalizeTags(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readBodyObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function readNestedObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function buildStatsMap(
  rows: Array<{
    campaignId: string;
    status: CampaignRecipientStatus;
    _count: { _all: number };
  }>,
) {
  const statsMap = new Map<
    string,
    Record<CampaignRecipientStatus, number> & { total: number }
  >();

  for (const row of rows) {
    const current = statsMap.get(row.campaignId) ?? {
      PENDING: 0,
      PROCESSING: 0,
      QUEUED: 0,
      SENT: 0,
      FAILED: 0,
      SKIPPED: 0,
      UNSUBSCRIBED: 0,
      CANCELLED: 0,
      total: 0,
    };

    current[row.status] = row._count._all;
    current.total += row._count._all;
    statsMap.set(row.campaignId, current);
  }

  return statsMap;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const url = new URL(request.url);
    const filters = validateSchema(campaignFiltersSchema, {
      status: url.searchParams.get("status") ?? undefined,
      eligibleCount: url.searchParams.get("eligibleCount") ?? undefined,
      tags: url.searchParams.getAll("tags"),
      groups: url.searchParams.getAll("groups"),
      priorities: url.searchParams.getAll("priorities"),
      locations: url.searchParams.getAll("locations"),
      interests: url.searchParams.getAll("interests"),
      contactTypes: url.searchParams.getAll("contactTypes"),
    });
    const audience = {
      tags: normalizeTags(filters.tags ?? []),
      groups: normalizeTags(filters.groups ?? []),
      priorities: normalizeTags(filters.priorities ?? []),
      locations: normalizeTags(filters.locations ?? []),
      interests: normalizeTags(filters.interests ?? []),
      contactTypes: normalizeTags(filters.contactTypes ?? []),
    };

    if (filters.eligibleCount) {
      const eligibleCount = await countAudienceContacts(mandateId, audience);
      return apiSuccess({ eligibleCount });
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        mandateId,
        status: filters.status ?? undefined,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true,
          },
        },
        audienceConfig: true,
        operationState: true,
        safetySimulations: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const statsRows =
      campaigns.length === 0
        ? []
        : await prisma.campaignRecipient.groupBy({
            by: ["campaignId", "status"],
            where: {
              campaignId: {
                in: campaigns.map((campaign) => campaign.id),
              },
            },
            _count: {
              _all: true,
            },
          });

    const statsMap = buildStatsMap(statsRows);

    return apiSuccess({
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        audience: campaign.audienceConfig
          ? flattenAudience(campaign.audienceConfig)
          : campaign.segmentTags,
        stats: statsMap.get(campaign.id) ?? {
          PENDING: 0,
          QUEUED: 0,
          SENT: 0,
          FAILED: 0,
          SKIPPED: 0,
          UNSUBSCRIBED: 0,
          CANCELLED: 0,
          total: 0,
        },
        operationState: campaign.operationState,
        safetySimulation: campaign.safetySimulations[0] ?? null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `campaign:create:${getClientIp(request)}`,
      limit: 30,
      windowMs: 15 * 60_000,
    });

    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const rawBody = readBodyObject(await readJson(request));
    const rawAudienceConfig = readNestedObject(rawBody.audienceConfig);
    const requestedMode = readString(rawBody.campaignMode);
    const source = readString(rawBody.source);
    const action = readString(rawBody.action);
    const birthdayMonthDay =
      readString(rawBody.birthdayMonthDay) ??
      readString(rawAudienceConfig.birthdayMonthDay) ??
      null;
    const selectedContactIds = [
      ...new Set([
        ...readStringArray(rawBody.selectedContactIds),
        ...readStringArray(rawAudienceConfig.selectedContactIds),
      ]),
    ];
    const manualTestIntent =
      selectedContactIds.length > 0 &&
      (requestedMode === undefined ||
        requestedMode === "TEST" ||
        requestedMode === "FIRST_CONTACT" ||
        action === "manual-test" ||
        source === "campaign-wizard");

    console.info("[campaign:create:payload]", {
      requestedMode: requestedMode ?? null,
      templateId: readString(rawBody.templateId) ?? null,
      selectedContactCount: selectedContactIds.length,
      hasAudienceConfig: Object.keys(rawAudienceConfig).length > 0,
      birthdayMonthDay,
      source: source ?? null,
      action: action ?? null,
    });

    const parsed = validateSchema(campaignSchema, {
      ...rawBody,
      campaignMode: manualTestIntent ? (requestedMode === "FIRST_CONTACT" ? "FIRST_CONTACT" : "TEST") : rawBody.campaignMode,
      birthdayMonthDay,
      selectedContactIds,
      segmentTags:
        rawBody.segmentTags ?? rawAudienceConfig.tags ?? rawBody.tags ?? [],
      groups: rawBody.groups ?? rawAudienceConfig.groups ?? [],
      priorities: rawBody.priorities ?? rawAudienceConfig.priorities ?? [],
      locations: rawBody.locations ?? rawAudienceConfig.locations ?? [],
      interests: rawBody.interests ?? rawAudienceConfig.interests ?? [],
      contactTypes: rawBody.contactTypes ?? rawAudienceConfig.contactTypes ?? [],
      audienceConfig: {
        ...rawAudienceConfig,
        birthdayMonthDay,
        selectedContactIds,
      },
    });

    const template = await prisma.whatsAppTemplate.findFirst({
      where: {
        id: parsed.templateId,
        mandateId,
        status: WhatsAppTemplateStatus.APPROVED,
      },
    });

    if (!template) {
      throw new ApiRouteError(
        400,
        "Template não encontrado ou ainda não aprovado para campanhas.",
        "TEMPLATE_NOT_APPROVED",
      );
    }

    const campaignMode = parsed.campaignMode ?? "TEST";

    const resolvedAudience = resolveAudienceFilterByMode({
      mode: campaignMode,
      selectedContactIds: parsed.selectedContactIds,
      birthdayMonthDay: parsed.birthdayMonthDay,
      tags: parsed.segmentTags,
      groups: parsed.groups,
      priorities: parsed.priorities,
      locations: parsed.locations,
      interests: parsed.interests,
      contactTypes: parsed.contactTypes,
    });

    console.info("[campaign-create] audience-resolved-by-mode", {
      mandateId,
      campaignMode,
      selectedContactIds: resolvedAudience.selectedContactIds.length,
      birthdayMonthDay: resolvedAudience.birthdayMonthDay,
      hasAudienceFilters:
        [
          resolvedAudience.tags.length,
          resolvedAudience.groups.length,
          resolvedAudience.priorities.length,
          resolvedAudience.locations.length,
          resolvedAudience.interests.length,
          resolvedAudience.contactTypes.length,
        ].reduce((a, b) => a + b, 0) > 0,
    });

    const settings = await getCampaignSettings(mandateId);
    const scheduledAt = parsed.scheduledAt
      ? new Date(parsed.scheduledAt)
      : null;

    const campaign = await prisma.campaign.create({
      data: {
        mandateId,
        name: parsed.name,
        templateId: parsed.templateId,
        campaignMode: campaignMode,
        segmentTags: normalizeTags(resolvedAudience.tags),
        dailyLimit: parsed.dailyLimit ?? settings.defaultDailyLimit,
        delaySeconds: parsed.delaySeconds ?? settings.defaultDelaySeconds,
        scheduledAt,
        status:
          scheduledAt && scheduledAt > new Date()
            ? CampaignStatus.SCHEDULED
            : CampaignStatus.DRAFT,
        audienceConfig: {
          create: {
            birthdayMonthDay: resolvedAudience.birthdayMonthDay,
            tags: normalizeTags(resolvedAudience.tags),
            groups: normalizeTags(resolvedAudience.groups),
            priorities: normalizeTags(resolvedAudience.priorities),
            locations: normalizeTags(resolvedAudience.locations),
            interests: normalizeTags(resolvedAudience.interests),
            contactTypes: normalizeTags(resolvedAudience.contactTypes),
            selectedContactIds: resolvedAudience.selectedContactIds,
          },
        },
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true,
          },
        },
        audienceConfig: true,
        operationState: true,
      },
    });

    console.info("[campaign-create] success", {
      mandateId,
      campaignId: campaign.id,
      templateId: campaign.templateId,
      campaignMode: campaign.campaignMode,
      selectedContactIds:
        campaign.audienceConfig?.selectedContactIds?.length ?? 0,
      status: campaign.status,
    });

    await syncCampaignOperationState(campaign.id);
    invalidateCampaignOperationalCache(mandateId);

    return apiSuccess(
      {
        campaign,
        message:
          "Campanha criada com segurança. O envio só ocorrerá para contatos elegíveis.",
      },
      201,
    );
  } catch (error) {
    console.error("[campaign-create] error", error);
    return apiError(error);
  }
}
