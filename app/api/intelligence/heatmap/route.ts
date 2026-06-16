import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getRelationshipHeatmap } from "@/lib/relationship-heatmap";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const heatmap = await getRelationshipHeatmap(mandateId);

    return apiSuccess({
      heatmap
    });
  } catch (error) {
    return apiError(error);
  }
}
