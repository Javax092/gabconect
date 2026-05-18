import { apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateFiltersSchema, templateSchema } from "@/lib/validations/template";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const url = new URL(request.url);
    const filters = validateSchema(templateFiltersSchema, {
      category: url.searchParams.get("category") ?? undefined,
      language: url.searchParams.get("language") ?? undefined
    });

    const templates = await prisma.messageTemplate.findMany({
      where: {
        mandateId,
        category: filters.category || undefined,
        language: filters.language || undefined
      },
      orderBy: [{ approved: "desc" }, { updatedAt: "desc" }]
    });

    return apiSuccess({ templates });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(templateSchema, body);

    const template = await prisma.messageTemplate.create({
      data: {
        mandateId,
        ...parsed
      }
    });

    return apiSuccess({ template, message: "Template criado com sucesso." }, 201);
  } catch (error) {
    return apiError(error);
  }
}
