import { apiError, apiSuccess } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const dashboard = await getDashboardData({
      mandateId
    });

    return apiSuccess({ dashboard });
  } catch (error) {
    return apiError(error);
  }
}
