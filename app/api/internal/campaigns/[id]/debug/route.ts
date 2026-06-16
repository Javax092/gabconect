import { ApiRouteError, apiError, apiSuccess, parseRouteId } from "@/lib/api";
import { getCampaignDebugReport } from "@/lib/campaign-debug";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function assertInternalToken(request: Request) {
  const expected = process.env.INTERNAL_TEST_TOKEN?.trim();
  const headerToken = request.headers.get("x-internal-test-token")?.trim();
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!expected) {
    throw new ApiRouteError(503, "INTERNAL_TEST_TOKEN não configurado.", "INTERNAL_TOKEN_NOT_CONFIGURED");
  }

  if (headerToken !== expected && bearerToken !== expected) {
    throw new ApiRouteError(401, "Token interno inválido.", "UNAUTHORIZED_INTERNAL_DEBUG");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertInternalToken(request);
    const { id } = await context.params;
    const campaignId = parseRouteId(id);
    const report = await getCampaignDebugReport(campaignId);

    return apiSuccess({
      data: report
    });
  } catch (error) {
    return apiError(error);
  }
}
