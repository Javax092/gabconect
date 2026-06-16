import { apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getCampaignSettings, upsertCampaignSettings } from "@/lib/campaign-settings";
import { invalidateCampaignOperationalCache } from "@/lib/operational-cache";
import { campaignSettingsSchema } from "@/lib/validations/campaign-settings";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const settings = await getCampaignSettings(mandateId);

    return apiSuccess({ settings });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(campaignSettingsSchema, body);
    const settings = await upsertCampaignSettings(mandateId, parsed);
    invalidateCampaignOperationalCache(mandateId);

    return apiSuccess({
      settings,
      message: "Configurações padrão de campanhas salvas com sucesso."
    });
  } catch (error) {
    return apiError(error);
  }
}
