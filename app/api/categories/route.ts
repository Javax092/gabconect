import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { ensureDefaultCategoriesForMandate, normalizeCategoryName } from "@/lib/categories";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validations/category";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);

    await ensureDefaultCategoriesForMandate(mandateId);
    const categoriesWithUsage = await prisma.category.findMany({
      where: {
        mandateId
      },
      orderBy: {
        name: "asc"
      },
      include: {
        _count: {
          select: {
            demands: true
          }
        }
      }
    });

    return apiSuccess({
      categories: categoriesWithUsage.map(({ _count, ...category }) => ({
        ...category,
        demandsCount: _count.demands
      }))
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(categorySchema, body);

    await ensureDefaultCategoriesForMandate(mandateId);

    const normalizedName = normalizeCategoryName(parsed.name);
    const categories = await prisma.category.findMany({
      where: {
        mandateId
      },
      select: {
        id: true,
        name: true
      }
    });

    const duplicated = categories.some(
      (category) => normalizeCategoryName(category.name) === normalizedName
    );

    if (duplicated) {
      throw new ApiRouteError(
        409,
        "Já existe uma categoria com esse nome neste mandato.",
        "CATEGORY_CONFLICT"
      );
    }

    const category = await prisma.category.create({
      data: {
        mandateId,
        name: parsed.name,
        color: parsed.color
      }
    });

    return apiSuccess({
      message: "Categoria criada com sucesso.",
      category: {
        ...category,
        demandsCount: 0
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
