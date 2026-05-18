import { apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { runCampaignSafetySimulation } from "@/lib/campaign-safety";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);

    const simulation = await runCampaignSafetySimulation({
      mandateId,
      campaignId,
      persist: true
    });

    return apiSuccess({
      simulation
    });
  } catch (error) {
    return apiError(error);
  }
}
