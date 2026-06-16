import { Role } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { recalculateContactIntelligence } from "@/lib/contact-intelligence";
import { getRelationshipHeatmap } from "@/lib/relationship-heatmap";
import { assertRateLimit, getClientIp } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `intelligence:recalculate:${getClientIp(request)}`,
      limit: 5,
      windowMs: 15 * 60_000
    });

    const user = await requireAuth();
    const { mandateId, role } = getMandateContext(user);

    if (role !== Role.ADMIN) {
      throw new ApiRouteError(403, "Apenas administradores podem recalcular inteligencia.", "ADMIN_REQUIRED");
    }

    const recalculation = await recalculateContactIntelligence(mandateId);
    const heatmap = await getRelationshipHeatmap(mandateId);

    return apiSuccess({
      ...recalculation,
      heatmapAreas: heatmap.length
    });
  } catch (error) {
    return apiError(error);
  }
}
