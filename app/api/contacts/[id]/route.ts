import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { isValidPhone, normalizePhone, normalizeTagsInput, resolveContactStatus } from "@/lib/contacts";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do contato."),
  phone: z.string().trim().min(8, "Informe o telefone do contato."),
  source: z.string().trim().min(2).default("manual"),
  birthday: z.string().trim().optional().or(z.literal("")),
  optIn: z.coerce.boolean().default(false),
  status: z.string().trim().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional().default([])
});

function serializeContact(contact: {
  id: string;
  name: string;
  phone: string;
  optIn: boolean;
  optInAt: Date | null;
  status: string;
  source: string;
  tags: string[];
  birthday: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...contact,
    code: contact.id.slice(-8).toUpperCase(),
    invalidPhone: !isValidPhone(contact.phone),
    birthday: contact.birthday?.toISOString() ?? null,
    optInAt: contact.optInAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString()
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const contactId = parseRouteId(id);
    const body = await readJson(request);
    const parsed = validateSchema(updateSchema, body);
    const phone = normalizePhone(parsed.phone);

    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        mandateId
      }
    });

    if (!existing) {
      throw new ApiRouteError(404, "Contato não encontrado.", "CONTACT_NOT_FOUND");
    }

    const updated = await prisma.contact.update({
      where: {
        id: contactId
      },
      data: {
        name: parsed.name,
        phone,
        source: parsed.source || "manual",
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? existing.optInAt ?? new Date() : null,
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolveContactStatus(parsed.status, phone)
      }
    });

    return apiSuccess({
      contact: serializeContact(updated),
      message: "Contato atualizado."
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiRouteError(409, "Já existe contato com este telefone.", "CONTACT_DUPLICATE"));
    }

    return apiError(error);
  }
}
