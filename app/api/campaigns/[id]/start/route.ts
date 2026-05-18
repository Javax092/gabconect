import { CampaignStatus, WhatsAppTemplateStatus } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { createCampaignRecipients, syncCampaignCounters } from "@/lib/whatsapp-campaigns";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        mandateId
      },
      include: {
        template: true
      }
    });

    if (!campaign) {
      throw new ApiRouteError(404, "Campanha não encontrada.", "NOT_FOUND");
    }

    if (campaign.template.status !== WhatsAppTemplateStatus.APPROVED) {
      throw new ApiRouteError(
        400,
        "A campanha só pode iniciar com template aprovado pela Meta.",
        "TEMPLATE_NOT_APPROVED"
      );
    }

    const recipientSummary = await createCampaignRecipients(
      campaign.id,
      mandateId,
      campaign.segmentTags
    );

    if (recipientSummary.eligibleContacts === 0) {
      throw new ApiRouteError(
        400,
        "Nenhum contato elegível encontrado. Verifique opt-in, status e tags do segmento.",
        "NO_ELIGIBLE_CONTACTS"
      );
    }

    const updatedCampaign = await prisma.campaign.update({
      where: {
        id: campaign.id
      },
      data: {
        status: CampaignStatus.RUNNING
      }
    });

    await syncCampaignCounters(campaign.id);

    return apiSuccess({
      campaign: updatedCampaign,
      createdRecipients: recipientSummary.createdRecipients,
      eligibleContacts: recipientSummary.eligibleContacts,
      message: "Campanha iniciada. Use o endpoint send-next para processar envios com pacing."
    });
  } catch (error) {
    return apiError(error);
  }
}
