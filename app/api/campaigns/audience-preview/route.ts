import { apiError, apiSuccess, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getCampaignAudiencePreview } from "@/lib/campaign-execution";
import { appendCampaignEvent } from "@/lib/campaign-infrastructure";
import { prisma } from "@/lib/prisma";
import { campaignFiltersSchema } from "@/lib/validations/campaign";

function readAudienceFilter(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId") ?? undefined;
    const templateId = url.searchParams.get("templateId") ?? undefined;
    const audienceFilter = readAudienceFilter(url.searchParams.get("audienceFilter")) as {
      birthdayMonthDay?: string | null;
      tags?: string[];
      groups?: string[];
      priorities?: string[];
      locations?: string[];
      interests?: string[];
      contactTypes?: string[];
      selectedContactIds?: string[];
    };
    const filters = validateSchema(campaignFiltersSchema, {
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
      optInFilter: url.searchParams.get("optInFilter") ?? undefined,
      contactStatus: url.searchParams.get("contactStatus") ?? undefined,
      birthdayFilter: url.searchParams.get("birthdayFilter") ?? undefined,
      selectedOnly: url.searchParams.get("selectedOnly") ?? undefined,
      selectedContactIds: url.searchParams.getAll("selectedContactIds")
    });

    const campaign = campaignId
      ? await prisma.campaign.findFirst({
          where: {
            id: campaignId,
            mandateId
          },
          include: {
            template: true,
            audienceConfig: true
          }
        })
      : null;

    const template = campaign
      ? campaign.template
      : templateId
        ? await prisma.whatsAppTemplate.findFirst({
            where: {
              id: templateId,
              mandateId
            }
          })
        : null;

    const preview = await getCampaignAudiencePreview({
      mandateId,
      campaignId: campaign?.id,
      templateBody: template?.body ?? "",
      audienceFilter: campaign?.audienceConfig
        ? {
            birthdayMonthDay: campaign.audienceConfig.birthdayMonthDay,
            tags: campaign.audienceConfig.tags,
            groups: campaign.audienceConfig.groups,
            priorities: campaign.audienceConfig.priorities,
            locations: campaign.audienceConfig.locations,
            interests: campaign.audienceConfig.interests,
            contactTypes: campaign.audienceConfig.contactTypes,
            selectedContactIds: campaign.audienceConfig.selectedContactIds
          }
        : audienceFilter,
      selectedContactIds: campaign?.audienceConfig?.selectedContactIds ?? filters.selectedContactIds,
      selectedOnly: campaign ? (campaign.audienceConfig?.selectedContactIds.length ?? 0) > 0 : filters.selectedOnly,
      showOnlyEligible: false,
      query: filters.query,
      optInFilter: filters.optInFilter,
      contactStatus: filters.contactStatus,
      birthdayFilter: filters.birthdayFilter,
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    });

    if (campaign) {
      await appendCampaignEvent({
        mandateId,
        campaignId: campaign.id,
        eventType: "AUDIENCE_PREVIEW_GENERATED",
        title: "Destinatarios previstos",
        message: `${preview.totalElegiveis} elegiveis revisados antes do envio.`,
        metadata: {
          totalElegiveis: preview.totalElegiveis,
          totalOptOut: preview.totalOptOut,
          totalSemTelefone: preview.totalSemTelefone,
          totalSemOptIn: preview.totalSemOptIn
        }
      });
    }

    return apiSuccess(preview);
  } catch (error) {
    return apiError(error);
  }
}
