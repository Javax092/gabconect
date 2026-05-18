import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateUpdateSchema } from "@/lib/validations/template";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const templateId = parseRouteId(id);
    const body = await readJson(request);
    const parsed = validateSchema(templateUpdateSchema, body);

    const existing = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        mandateId
      }
    });

    if (!existing) {
      throw new ApiRouteError(404, "Template não encontrado.", "NOT_FOUND");
    }

    const template = await prisma.messageTemplate.update({
      where: {
        id: templateId
      },
      data: parsed
    });

    return apiSuccess({ template, message: "Template atualizado com sucesso." });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const templateId = parseRouteId(id);

    const existing = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        mandateId
      }
    });

    if (!existing) {
      throw new ApiRouteError(404, "Template não encontrado.", "NOT_FOUND");
    }

    await prisma.messageTemplate.delete({
      where: {
        id: templateId
      }
    });

    return apiSuccess({ message: "Template removido com sucesso." });
  } catch (error) {
    return apiError(error);
  }
}
