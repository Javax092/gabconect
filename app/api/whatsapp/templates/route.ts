import { ApiRouteError, apiError, apiSuccess } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listApprovedMetaWhatsAppTemplates } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
    const templates = await listApprovedMetaWhatsAppTemplates();

    return apiSuccess({
      templates,
      count: templates.length,
      message: "Templates aprovados retornados pela Meta."
    });
  } catch (error) {
    return apiError(
      error instanceof ApiRouteError
        ? error
        : new ApiRouteError(
            409,
            error instanceof Error ? error.message : "Não foi possível listar templates da Meta.",
            "WHATSAPP_TEMPLATES_LIST_FAILED",
            error && typeof error === "object" && "details" in error
              ? (error as { details?: unknown }).details
              : undefined
          )
    );
  }
}
