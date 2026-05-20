import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { isValidPhone, normalizePhone, normalizeTagsInput, parseCsvRows, resolveContactStatus } from "@/lib/contacts";
import { prisma } from "@/lib/prisma";

const listSchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["ALL", "ACTIVE", "UNSUBSCRIBED", "BLOCKED", "INVALID"]).optional().default("ALL"),
  optIn: z.enum(["ALL", "OPT_IN", "OPT_OUT"]).optional().default("ALL")
});

const createSingleSchema = z.object({
  mode: z.literal("single"),
  name: z.string().trim().min(2, "Informe o nome do contato."),
  phone: z.string().trim().min(8, "Informe o telefone do contato."),
  source: z.string().trim().min(2).default("manual"),
  birthday: z.string().trim().optional().or(z.literal("")),
  optIn: z.coerce.boolean().default(false),
  status: z.string().trim().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional().default([])
});

const createCsvSchema = z.object({
  mode: z.literal("csv"),
  csvContent: z.string().trim().min(10, "Cole um CSV com cabeçalho e pelo menos uma linha."),
  source: z.string().trim().min(2).default("csv"),
  defaultOptIn: z.coerce.boolean().default(false)
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

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const url = new URL(request.url);
    const filters = validateSchema(
      listSchema,
      Object.fromEntries(url.searchParams.entries())
    );
    const query = (filters.q ?? "").toLowerCase();

    const contacts = await prisma.contact.findMany({
      where: {
        mandateId,
        ...(filters.status !== "ALL" ? { status: filters.status } : {}),
        ...(filters.optIn === "OPT_IN"
          ? { optIn: true }
          : filters.optIn === "OPT_OUT"
            ? { optIn: false }
            : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { phone: { contains: query } },
                { id: { endsWith: query.toLowerCase() } }
              ]
            }
          : {})
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    return apiSuccess({
      contacts: contacts.map(serializeContact)
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

    if (body && typeof body === "object" && body.mode === "csv") {
      const parsed = validateSchema(createCsvSchema, body);
      const rows = parseCsvRows(parsed.csvContent);

      if (rows.length === 0) {
        throw new ApiRouteError(400, "CSV sem linhas válidas para importação.", "EMPTY_CSV");
      }

      const importedIds: string[] = [];
      for (const row of rows) {
        const normalizedPhone = normalizePhone(row.phone ?? "");
        if (!normalizedPhone) {
          continue;
        }

        const optIn = (row.optin ?? "").trim().toLowerCase();
        const resolvedOptIn = optIn ? ["1", "true", "sim", "yes"].includes(optIn) : parsed.defaultOptIn;
        const contact = await prisma.contact.upsert({
          where: {
            mandateId_phone: {
              mandateId,
              phone: normalizedPhone
            }
          },
          update: {
            name: row.name?.trim() || normalizedPhone,
            source: row.source?.trim() || parsed.source || "csv",
            tags: normalizeTagsInput(row.tags ?? ""),
            optIn: resolvedOptIn,
            optInAt: resolvedOptIn ? new Date() : null,
            birthday: row.birthday ? new Date(row.birthday) : null,
            status: resolveContactStatus(row.status, normalizedPhone)
          },
          create: {
            mandateId,
            name: row.name?.trim() || normalizedPhone,
            phone: normalizedPhone,
            source: row.source?.trim() || parsed.source || "csv",
            tags: normalizeTagsInput(row.tags ?? ""),
            optIn: resolvedOptIn,
            optInAt: resolvedOptIn ? new Date() : null,
            birthday: row.birthday ? new Date(row.birthday) : null,
            status: resolveContactStatus(row.status, normalizedPhone)
          }
        });

        importedIds.push(contact.id);
      }

      return apiSuccess({
        importedCount: importedIds.length,
        message: `${importedIds.length} contatos importados ou atualizados.`
      });
    }

    const parsed = validateSchema(createSingleSchema, body);
    const phone = normalizePhone(parsed.phone);
    const contact = await prisma.contact.upsert({
      where: {
        mandateId_phone: {
          mandateId,
          phone
        }
      },
      update: {
        name: parsed.name,
        source: parsed.source || "manual",
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? new Date() : null,
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolveContactStatus(parsed.status, phone)
      },
      create: {
        mandateId,
        name: parsed.name,
        phone,
        source: parsed.source || "manual",
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? new Date() : null,
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolveContactStatus(parsed.status, phone)
      }
    });

    return apiSuccess({
      contact: serializeContact(contact),
      message: "Contato salvo com sucesso."
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(new ApiRouteError(409, "Já existe contato com este telefone.", "CONTACT_DUPLICATE"));
    }

    return apiError(error);
  }
}
