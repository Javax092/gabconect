import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { normalizeCategoryName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validations/category";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(categorySchema, body);
    const { id } = await context.params;
    const categoryId = parseRouteId(id);

    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        mandateId
      }
    });

    if (!category) {
      throw new ApiRouteError(404, "Categoria não encontrada.", "NOT_FOUND");
    }

    const normalizedName = normalizeCategoryName(parsed.name);
    const categories = await prisma.category.findMany({
      where: {
        mandateId,
        NOT: {
          id: categoryId
        }
      },
      select: {
        id: true,
        name: true
      }
    });

    const duplicated = categories.some(
      (item) => normalizeCategoryName(item.name) === normalizedName
    );

    if (duplicated) {
      throw new ApiRouteError(
        409,
        "Já existe uma categoria com esse nome neste mandato.",
        "CATEGORY_CONFLICT"
      );
    }

    const updatedCategory = await prisma.category.update({
      where: {
        id: category.id
      },
      data: parsed
    });

    const demandsCount = await prisma.demand.count({
      where: {
        mandateId,
        categoryId: updatedCategory.id
      }
    });

    return apiSuccess({
      message: "Categoria atualizada com sucesso.",
      category: {
        ...updatedCategory,
        demandsCount
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const categoryId = parseRouteId(id);

    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        mandateId
      }
    });

    if (!category) {
      throw new ApiRouteError(404, "Categoria não encontrada.", "NOT_FOUND");
    }

    const demandsCount = await prisma.demand.count({
      where: {
        mandateId,
        categoryId: category.id
      }
    });

    if (demandsCount > 0) {
      throw new ApiRouteError(
        409,
        "Esta categoria está em uso e não pode ser excluída.",
        "CATEGORY_IN_USE"
      );
    }

    await prisma.category.delete({
      where: {
        id: category.id
      }
    });

    return apiSuccess({
      message: "Categoria excluída com sucesso."
    });
  } catch (error) {
    return apiError(error);
  }
}
