import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { invalidateWhatsAppOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { mandateSchema } from "@/lib/validations/mandate";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    const mandate = await prisma.mandate.findUnique({
      where: {
        id: mandateId
      },
      select: {
        id: true,
        name: true,
        politicianName: true,
        city: true,
        state: true,
        whatsappNumber: true,
        aiPrompt: true,
        createdAt: true
      }
    });

    if (!mandate) {
      throw new ApiRouteError(404, "Mandato não encontrado.", "NOT_FOUND");
    }

    return apiSuccess({ mandate });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(mandateSchema, body);

    const mandate = await prisma.mandate.update({
      where: {
        id: mandateId
      },
      data: parsed,
      select: {
        id: true,
        name: true,
        politicianName: true,
        city: true,
        state: true,
        whatsappNumber: true,
        aiPrompt: true,
        createdAt: true
      }
    });
    invalidateWhatsAppOperationalCache(mandateId);

    return apiSuccess({
      message: "Configurações operacionais salvas com sucesso.",
      mandate
    });
  } catch (error) {
    return apiError(error);
  }
}
