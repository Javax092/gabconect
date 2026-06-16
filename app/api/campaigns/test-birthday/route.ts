import { CampaignStatus, WhatsAppTemplateStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getMonthDayKey } from "@/lib/campaign-execution";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { invalidateCampaignOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const settings = await getCampaignSettings(mandateId);

    const template =
      (await prisma.whatsAppTemplate.findFirst({
        where: {
          mandateId,
          status: WhatsAppTemplateStatus.APPROVED,
          metaTemplateName: "feliz_aniversario_teste",
        },
      })) ??
      (await prisma.whatsAppTemplate.findFirst({
        where: {
          mandateId,
          status: WhatsAppTemplateStatus.APPROVED,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }));

    if (!template) {
      throw new ApiRouteError(
        400,
        "Cadastre um template aprovado antes de rodar o teste de aniversário.",
        "TEMPLATE_NOT_APPROVED",
      );
    }

    const todayMonthDay = getMonthDayKey();
    const campaign = await prisma.campaign.create({
      data: {
        mandateId,
        name: `Teste aniversario ${new Date().toLocaleDateString("pt-BR")}`,
        templateId: template.id,
        segmentTags: [],
        dailyLimit: Math.min(settings.defaultDailyLimit, 3),
        delaySeconds: Math.max(60, settings.defaultDelaySeconds),
        campaignMode: "BIRTHDAY",
        status: CampaignStatus.DRAFT,
        audienceConfig: {
          create: {
            birthdayMonthDay: todayMonthDay,
            tags: [],
            groups: [],
            priorities: [],
            locations: [],
            interests: [],
            contactTypes: [],
            selectedContactIds: [],
          },
        },
      },
    });
    invalidateCampaignOperationalCache(mandateId);

    return apiSuccess({
      campaignId: campaign.id,
      message: "Campanha de aniversario de teste criada.",
    });
  } catch (error) {
    return apiError(error);
  }
}
