import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { demandUpdateSchema } from "@/lib/validations/demand";

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
    const demandId = parseRouteId(id);

    const demand = await prisma.demand.findFirst({
      where: {
        id: demandId,
        mandateId
      },
      include: {
        citizen: true,
        category: true,
        conversation: {
          include: {
            messages: {
              orderBy: {
                createdAt: "desc"
              },
              take: 5
            }
          }
        }
      }
    });

    if (!demand) {
      throw new ApiRouteError(404, "Demanda não encontrada.", "NOT_FOUND");
    }

    return apiSuccess({ demand });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(demandUpdateSchema, body);
    const { id } = await context.params;
    const demandId = parseRouteId(id);

    const demand = await prisma.demand.findFirst({
      where: {
        id: demandId,
        mandateId
      }
    });

    if (!demand) {
      throw new ApiRouteError(404, "Demanda não encontrada.", "NOT_FOUND");
    }

    const category = await prisma.category.findFirst({
      where: {
        id: parsed.categoryId,
        mandateId
      }
    });

    if (!category) {
      throw new ApiRouteError(400, "Categoria inválida para este mandato.", "INVALID_CATEGORY");
    }

    const updatedDemand = await prisma.demand.update({
      where: {
        id: demand.id
      },
      data: parsed,
      include: {
        citizen: true,
        category: true,
        conversation: true
      }
    });

    return apiSuccess({
      message: "Demanda atualizada com sucesso.",
      demand: updatedDemand
    });
  } catch (error) {
    return apiError(error);
  }
}
