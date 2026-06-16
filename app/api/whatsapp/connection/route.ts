import { ApiRouteError, apiError, apiSuccess } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getWhatsAppHealthCheck } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
    const health = await getWhatsAppHealthCheck();

    return apiSuccess({
      health,
      status: health.status,
      connection: health.ok ? health.connection : null,
      approvedTemplates: "approvedTemplates" in health ? health.approvedTemplates : [],
      message: health.ok ? "Conexão com a Meta validada." : "Conexão com a Meta não está pronta para envio real."
    });
  } catch (error) {
    return apiError(
      error instanceof ApiRouteError
        ? error
        : new ApiRouteError(
            400,
            error instanceof Error ? error.message : "Não foi possível validar a conexão.",
            "WHATSAPP_CONNECTION_FAILED"
          )
    );
  }
}
