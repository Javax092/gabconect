import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import {
  getCachedAdminDashboardDeferredData,
  getCachedOperationalReadiness
} from "@/lib/operational-cache";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const [dashboard, readiness] = await Promise.all([
      getCachedAdminDashboardDeferredData(mandateId),
      getCachedOperationalReadiness(mandateId)
    ]);

    return apiSuccess({
      dashboard: {
        ...dashboard,
        readiness
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
