import { apiError, apiSuccess } from "@/lib/api";
import { clearSessionCookie, requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

export async function POST() {
  try {
    if (isDemoMode()) {
      return apiSuccess({});
    }

    await requireAuth();
    await clearSessionCookie();

    return apiSuccess({});
  } catch (error) {
    return apiError(error);
  }
}
