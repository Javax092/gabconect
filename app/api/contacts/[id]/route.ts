import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiRouteError, apiError, apiSuccess, parseRouteId, readJson, validateSchema } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { cancelQueuedCampaignDeliveries } from "@/lib/campaign-queue-cancellation";
import { recordConsent, suppressContact } from "@/lib/consent";
import { isValidPhone, normalizePhone, normalizeTagsInput, resolveContactStatus } from "@/lib/contacts";
import { CONSENT_OPTED_IN, CONSENT_OPTED_OUT, CONSENT_PENDING, MANUAL_CRM_SOURCE } from "@/lib/first-contact";
import { invalidateContactOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/security";

const roles = [
  "CITIZEN",
  "COMMUNITY_LEADER",
  "RELIGIOUS_LEADER",
  "SPORTS_LEADER",
  "STUDENT_LEADER",
  "BUSINESS_OWNER",
  "PUBLIC_SERVANT",
  "ASSOCIATION_LEADER",
  "ACTIVE_SUPPORTER",
  "COLD_SUPPORTER",
  "UNDECIDED",
  "SOCIAL_DEMAND",
  "INSTITUTIONAL_CONTACT"
] as const;

const influenceLevels = ["LOW", "MEDIUM", "HIGH", "VIP"] as const;
const interestAreas = [
  "HEALTH",
  "EDUCATION",
  "INFRASTRUCTURE",
  "SPORTS",
  "EMPLOYMENT",
  "SECURITY",
  "SOCIAL_ASSISTANCE",
  "CULTURE",
  "OTHER"
] as const;
const politicalTemperatures = ["COLD", "WARM", "HOT", "STRATEGIC"] as const;
const relationshipTypes = ["RESIDENT", "LEADER", "SUPPORTER", "INSTITUTIONAL", "DEMAND", "EVENT"] as const;
const nextActions = ["CALL", "VISIT", "MESSAGE", "MEETING", "FOLLOW_UP_DEMAND"] as const;

const updateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do contato."),
  phone: z.string().trim().min(8, "Informe o telefone do contato."),
  source: z.string().trim().min(2).default("manual"),
  birthday: z.string().trim().optional().or(z.literal("")),
  optIn: z.coerce.boolean().default(false),
  status: z.string().trim().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional().default([])
});

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("")]).optional().transform((value) => value || null);

const qualificationSchema = z.object({
  mode: z.literal("qualification"),
  neighborhood: z.string().trim().max(120).optional().transform((value) => value || null),
  zone: z.string().trim().max(80).optional().transform((value) => value || null),
  role: optionalEnum(roles),
  influenceLevel: optionalEnum(influenceLevels),
  interestArea: optionalEnum(interestAreas),
  politicalTemperature: optionalEnum(politicalTemperatures),
  relationshipType: optionalEnum(relationshipTypes),
  nextAction: optionalEnum(nextActions),
  notes: z.string().trim().max(2000).optional().transform((value) => value || null)
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { mandateId } = getMandateContext(user);
    const { id } = await context.params;
    const contactId = parseRouteId(id);
    const body = await readJson(request);

    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        mandateId
      }
    });

    if (!existing) {
      throw new ApiRouteError(404, "Contato não encontrado.", "CONTACT_NOT_FOUND");
    }

    if (body && typeof body === "object" && body.mode === "qualification") {
      const parsed = qualificationSchema.parse(body);
      const updated = await prisma.contact.update({
        where: { id: contactId },
        data: {
          neighborhood: parsed.neighborhood,
          zone: parsed.zone,
          role: parsed.role,
          communityRole: parsed.role,
          influenceLevel: parsed.influenceLevel,
          interestArea: parsed.interestArea,
          politicalTemperature: parsed.politicalTemperature,
          relationshipType: parsed.relationshipType,
          relationshipStatus: parsed.politicalTemperature,
          nextAction: parsed.nextAction,
          notes: parsed.notes
        }
      });

      return apiSuccess({
        contact: serializeContact(updated),
        message: "Qualificação atualizada."
      });
    }

    const parsed = validateSchema(updateSchema, body);
    const phone = normalizePhone(parsed.phone);
    const resolvedStatus = resolveContactStatus(parsed.status, phone);

    const updated = await prisma.contact.update({
      where: {
        id: contactId
      },
      data: {
        name: parsed.name,
        phone,
        source: parsed.source || MANUAL_CRM_SOURCE,
        tags: normalizeTagsInput(parsed.tags ?? ""),
        optIn: parsed.optIn,
        optInAt: parsed.optIn ? existing.optInAt ?? new Date() : null,
        consentStatus: parsed.optIn ? CONSENT_OPTED_IN : resolvedStatus === "UNSUBSCRIBED" ? CONSENT_OPTED_OUT : CONSENT_PENDING,
        blockedFromCampaigns: resolvedStatus === "UNSUBSCRIBED" || resolvedStatus === "BLOCKED",
        birthday: parsed.birthday ? new Date(parsed.birthday) : null,
        status: resolvedStatus
      }
    });
    await recordConsent({
      mandateId,
      contactId: updated.id,
      phone: updated.phone,
      action: parsed.optIn ? "MANUAL_OPT_IN" : "MANUAL_OPT_OUT",
      source: parsed.source || "manual",
      reason: parsed.optIn ? "Atualização manual com opt-in." : "Atualização manual sem opt-in ativo.",
      ipAddress: getClientIp(request),
      userId: user.id
    });

    if (["UNSUBSCRIBED", "BLOCKED", "INVALID"].includes(resolvedStatus)) {
      await suppressContact({
        mandateId,
        contactId: updated.id,
        phone: updated.phone,
        reason: resolvedStatus !== "ACTIVE" ? `Status ${resolvedStatus}.` : "Contato sem opt-in ativo.",
        source: parsed.source || "manual"
      });
      await cancelQueuedCampaignDeliveries({
        mandateId,
        contactId: updated.id,
        reason: "Contato atualizado sem elegibilidade para envio."
      });
    }
    invalidateContactOperationalCache(mandateId);

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
