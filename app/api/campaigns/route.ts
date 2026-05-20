import { CampaignRecipientStatus, CampaignStatus, WhatsAppTemplateStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { countAudienceContacts, flattenAudience, syncCampaignOperationState } from "@/lib/campaign-infrastructure";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { prisma } from "@/lib/prisma";
import { campaignFiltersSchema, campaignSchema } from "@/lib/validations/campaign";

function normalizeTags(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildStatsMap(
  rows: Array<{
    campaignId: string;
    status: CampaignRecipientStatus;
    _count: { _all: number };
  }>
) {
  const statsMap = new Map<
    string,
    Record<CampaignRecipientStatus, number> & { total: number }
  >();

  for (const row of rows) {
    const current =
      statsMap.get(row.campaignId) ??
      {
        PENDING: 0,
        SENT: 0,
        FAILED: 0,
        SKIPPED: 0,
        UNSUBSCRIBED: 0,
        total: 0
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
      contactTypes: url.searchParams.getAll("contactTypes")
    });
    const audience = {
      tags: normalizeTags(filters.tags ?? []),
      groups: normalizeTags(filters.groups ?? []),
      priorities: normalizeTags(filters.priorities ?? []),
      locations: normalizeTags(filters.locations ?? []),
      interests: normalizeTags(filters.interests ?? []),
      contactTypes: normalizeTags(filters.contactTypes ?? [])
    };

    if (filters.eligibleCount) {
      const eligibleCount = await countAudienceContacts(mandateId, audience);
      return apiSuccess({ eligibleCount });
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        mandateId,
        status: filters.status ?? undefined
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true
          }
        },
        audienceConfig: true,
        operationState: true,
        safetySimulations: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    const statsRows =
      campaigns.length === 0
        ? []
        : await prisma.campaignRecipient.groupBy({
            by: ["campaignId", "status"],
            where: {
              campaignId: {
                in: campaigns.map((campaign) => campaign.id)
              }
            },
            _count: {
              _all: true
            }
          });

    const statsMap = buildStatsMap(statsRows);

    return apiSuccess({
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        audience:
          campaign.audienceConfig
            ? flattenAudience(campaign.audienceConfig)
            : campaign.segmentTags,
        stats:
          statsMap.get(campaign.id) ??
          {
            PENDING: 0,
            SENT: 0,
            FAILED: 0,
            SKIPPED: 0,
            UNSUBSCRIBED: 0,
            total: 0
          },
        operationState: campaign.operationState
        ,
        safetySimulation: campaign.safetySimulations[0] ?? null
      }))
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(campaignSchema, body);
    const audienceConfig = {
      tags: normalizeTags(parsed.segmentTags ?? []),
      groups: normalizeTags(parsed.groups ?? []),
      priorities: normalizeTags(parsed.priorities ?? []),
      locations: normalizeTags(parsed.locations ?? []),
      interests: normalizeTags(parsed.interests ?? []),
      contactTypes: normalizeTags(parsed.contactTypes ?? []),
      selectedContactIds: [...new Set(parsed.selectedContactIds)]
    };
    const segmentTags = audienceConfig.tags;
    const settings = await getCampaignSettings(mandateId);

    const template = await prisma.whatsAppTemplate.findFirst({
      where: {
        id: parsed.templateId,
        mandateId,
        status: WhatsAppTemplateStatus.APPROVED
      }
    });

    if (!template) {
      throw new ApiRouteError(
        400,
        "Template não encontrado ou ainda não aprovado para campanhas.",
        "TEMPLATE_NOT_APPROVED"
      );
    }

    if (audienceConfig.selectedContactIds.length === 0) {
      throw new ApiRouteError(
        400,
        "Selecione pelo menos um destinatário antes de criar a campanha.",
        "NO_SELECTED_RECIPIENTS"
      );
    }

    const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null;
    const campaign = await prisma.campaign.create({
      data: {
        mandateId,
        name: parsed.name,
        templateId: parsed.templateId,
        segmentTags,
        dailyLimit: parsed.dailyLimit ?? settings.defaultDailyLimit,
        delaySeconds: parsed.delaySeconds ?? settings.defaultDelaySeconds,
        scheduledAt,
        status: scheduledAt && scheduledAt > new Date() ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      audienceConfig: {
          create: {
            birthdayMonthDay: null,
            tags: audienceConfig.tags,
            groups: audienceConfig.groups,
            priorities: audienceConfig.priorities,
            locations: audienceConfig.locations,
            interests: audienceConfig.interests,
            contactTypes: audienceConfig.contactTypes,
            selectedContactIds: audienceConfig.selectedContactIds
          }
        }
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true
          }
        },
        audienceConfig: true,
        operationState: true
      }
    });
    await syncCampaignOperationState(campaign.id);

    return apiSuccess(
      {
        campaign,
        message: "Campanha criada com segurança. O envio só ocorrerá para contatos elegíveis."
      },
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
