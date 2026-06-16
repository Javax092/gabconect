import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiRouteError, apiError, apiSuccess, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { cancelQueuedCampaignDeliveries } from "@/lib/campaign-queue-cancellation";
import { recordConsent, suppressContact } from "@/lib/consent";
import { isValidPhone, normalizePhone, normalizeTagsInput, parseCsvRows, resolveContactStatus } from "@/lib/contacts";
import { CONSENT_OPTED_IN, CONSENT_OPTED_OUT, CONSENT_PENDING, MANUAL_CRM_SOURCE } from "@/lib/first-contact";
import { invalidateContactOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp } from "@/lib/security";

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
  neighborhood: string | null;
  zone: string | null;
  city: string | null;
  role: string | null;
  influenceLevel: string | null;
  interestArea: string | null;
  politicalTemperature: string | null;
  relationshipType: string | null;
  nextAction: string | null;
  notes: string | null;
  lastInteractionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...contact,
    code: contact.id.slice(-8).toUpperCase(),
    invalidPhone: !isValidPhone(contact.phone),
    birthday: contact.birthday?.toISOString() ?? null,
    lastInteractionAt: contact.lastInteractionAt?.toISOString() ?? null,
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
    assertRateLimit({
      key: `contacts:write:${getClientIp(request)}`,
      limit: 30,
      windowMs: 15 * 60_000
    });

    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const ipAddress = getClientIp(request);
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
        const resolvedStatus = resolveContactStatus(row.status, normalizedPhone);
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
            consentStatus: resolvedOptIn ? CONSENT_OPTED_IN : resolvedStatus === "UNSUBSCRIBED" ? CONSENT_OPTED_OUT : CONSENT_PENDING,
            blockedFromCampaigns: resolvedStatus === "UNSUBSCRIBED" || resolvedStatus === "BLOCKED",
            birthday: row.birthday ? new Date(row.birthday) : null,
            status: resolvedStatus
          },
          create: {
            mandateId,
            name: row.name?.trim() || normalizedPhone,
            phone: normalizedPhone,
            source: row.source?.trim() || parsed.source || "csv",
            tags: normalizeTagsInput(row.tags ?? ""),
            optIn: resolvedOptIn,
            optInAt: resolvedOptIn ? new Date() : null,
            consentStatus: resolvedOptIn ? CONSENT_OPTED_IN : resolvedStatus === "UNSUBSCRIBED" ? CONSENT_OPTED_OUT : CONSENT_PENDING,
            blockedFromCampaigns: resolvedStatus === "UNSUBSCRIBED" || resolvedStatus === "BLOCKED",
            birthday: row.birthday ? new Date(row.birthday) : null,
            status: resolvedStatus
          }
        });
        await recordConsent({
          mandateId,
          contactId: contact.id,
          phone: contact.phone,
          action: resolvedOptIn ? "IMPORTED_OPT_IN" : "OPT_OUT",
          source: parsed.source || "csv",
          reason: resolvedOptIn ? "Importação CSV com opt-in informado." : "Importação CSV sem opt-in ativo.",
          ipAddress,
          userId: user.id
        });

        if (!resolvedOptIn || resolvedStatus !== "ACTIVE") {
          await suppressContact({
            mandateId,
            contactId: contact.id,
            phone: contact.phone,
            reason: resolvedStatus !== "ACTIVE" ? `Status ${resolvedStatus}.` : "Contato sem opt-in ativo.",
            source: parsed.source || "csv"
          });
          await cancelQueuedCampaignDeliveries({
            mandateId,
            contactId: contact.id,
            reason: "Contato importado sem elegibilidade para envio."
          });
        }

        importedIds.push(contact.id);
      }

      invalidateContactOperationalCache(mandateId);

      return apiSuccess({
        importedCount: importedIds.length,
        message: `${importedIds.length} contatos importados ou atualizados.`
      });
    }

    const parsed = validateSchema(createSingleSchema, body);
    const phone = normalizePhone(parsed.phone);
    const resolvedStatus = resolveContactStatus(parsed.status, phone);
    const contact = await prisma.contact.upsert({
      where: {
        mandateId_phone: {
          mandateId,
          phone
        }
      },
      update: {
        name: parsed.name,
        source: parsed.source || MANUAL_CRM_SOURCE,
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? new Date() : null,
        consentStatus: parsed.optIn ? CONSENT_OPTED_IN : resolvedStatus === "UNSUBSCRIBED" ? CONSENT_OPTED_OUT : CONSENT_PENDING,
        blockedFromCampaigns: resolvedStatus === "UNSUBSCRIBED" || resolvedStatus === "BLOCKED",
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolvedStatus
      },
      create: {
        mandateId,
        name: parsed.name,
        phone,
        source: parsed.source || MANUAL_CRM_SOURCE,
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? new Date() : null,
        consentStatus: parsed.optIn ? CONSENT_OPTED_IN : resolvedStatus === "UNSUBSCRIBED" ? CONSENT_OPTED_OUT : CONSENT_PENDING,
        blockedFromCampaigns: resolvedStatus === "UNSUBSCRIBED" || resolvedStatus === "BLOCKED",
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolvedStatus
      }
    });
    await recordConsent({
      mandateId,
      contactId: contact.id,
      phone: contact.phone,
      action: parsed.optIn ? "MANUAL_OPT_IN" : "MANUAL_OPT_OUT",
      source: parsed.source || "manual",
      reason: parsed.optIn ? "Cadastro manual com opt-in." : "Cadastro manual sem opt-in ativo.",
      ipAddress,
      userId: user.id
    });

    if (["UNSUBSCRIBED", "BLOCKED", "INVALID"].includes(resolvedStatus)) {
      await suppressContact({
        mandateId,
        contactId: contact.id,
        phone: contact.phone,
        reason: resolvedStatus !== "ACTIVE" ? `Status ${resolvedStatus}.` : "Contato sem opt-in ativo.",
        source: parsed.source || "manual"
      });
      await cancelQueuedCampaignDeliveries({
        mandateId,
        contactId: contact.id,
        reason: "Contato salvo sem elegibilidade para envio."
      });
    }
    invalidateContactOperationalCache(mandateId);

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
