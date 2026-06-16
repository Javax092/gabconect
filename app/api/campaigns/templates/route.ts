import { Prisma } from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { invalidateCampaignOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/security";
import { whatsAppTemplateSchema } from "@/lib/validations/campaign-settings";

export async function GET() {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const templates = await prisma.whatsAppTemplate.findMany({
      where: {
        mandateId
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { createdAt: "desc" }]
    });

    return apiSuccess({ templates });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(
        new ApiRouteError(
          409,
          "Já existe um template com esse nome oficial e idioma para este mandato.",
          "TEMPLATE_ALREADY_EXISTS"
        )
      );
    }

    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `campaign-template:create:${getClientIp(request)}`,
      limit: 20,
      windowMs: 15 * 60_000
    });

    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request);
    const parsed = validateSchema(whatsAppTemplateSchema, body);

    const template = await prisma.whatsAppTemplate.create({
      data: {
        mandateId,
        ...parsed
      }
    });
    invalidateCampaignOperationalCache(mandateId);

    return apiSuccess(
      {
        template,
        message: "Template de campanha cadastrado com sucesso."
      },
      201
    );
  } catch (error) {
    return apiError(error);
  }
}
