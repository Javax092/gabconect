import { apiError, apiSuccess, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { buildDemandWhere } from "@/lib/demand-filters";
import { prisma } from "@/lib/prisma";
import { demandFiltersSchema } from "@/lib/validations/demand";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { searchParams } = new URL(request.url);
    const parsed = validateSchema(
      demandFiltersSchema,
      {
        status: searchParams.get("status") ?? undefined,
        priority: searchParams.get("priority") ?? undefined,
        categoryId: searchParams.get("categoryId") ?? undefined,
        q: searchParams.get("q") ?? undefined
      },
      "Filtros inválidos."
    );

    const demands = await prisma.demand.findMany({
      where: buildDemandWhere({
        mandateId,
        ...parsed
      }),
      include: {
        citizen: true,
        category: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return apiSuccess({ demands });
  } catch (error) {
    return apiError(error);
  }
}
