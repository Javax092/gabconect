import {
  CampaignRecipientStatus,
  ContactStatus,
  Prisma,
} from "@prisma/client";

import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import { flattenAudience } from "@/lib/campaign-infrastructure";
import { personalizeCampaignText } from "@/lib/campaign-execution";
import {
  evaluateFirstContactEligibility,
  FIRST_CONTACT_ALLOWED,
  PENDING_FIRST_CONTACT,
} from "@/lib/first-contact";
import { prisma } from "@/lib/prisma";

/* =========================
   TYPES
========================= */

export type CampaignAudienceFilter = {
  birthdayMonthDay?: string | null;
  tags?: string[];
  groups?: string[];
  priorities?: string[];
  locations?: string[];
  interests?: string[];
  contactTypes?: string[];
  selectedContactIds?: string[];
};

export type CampaignAudienceSortBy = "name" | "code" | "importedAt";
export type CampaignAudienceSortOrder = "asc" | "desc";

export type ResolvedAudienceRecipient = {
  contactId: string;
  name: string;
  phone: string;
  code: string;
  tags: string[];
  birthday: string | null;
  optInStatus:
    | "OPTED_IN"
    | "PENDING_FIRST_CONTACT"
    | "FIRST_CONTACT_ALLOWED"
    | "OPTED_OUT"
    | "BLOCKED"
    | "SEM_TELEFONE";
  inclusionReason: string;
  renderedPreview: string;
  importedAt: string;
  contactStatus: ContactStatus;
  isEligible: boolean;
  alreadyQueued: boolean;
  selectionState:
    | "ELEGIVEL"
    | "BLOQUEADO"
    | "SEM_OPT_IN"
    | "PRIMEIRO_CONTATO_PENDENTE"
    | "SEM_TELEFONE"
    | "OPT_OUT"
    | "JA_ENFILEIRADO";
};

export type ResolvedCampaignAudience = {
  totalElegiveis: number;
  totalEncontrados: number;
  totalMatched: number;
  totalSelecionados: number;
  totalJaConfirmados: number;
  totalInvalidos: number;
  totalBloqueados: number;
  totalOptOut: number;
  totalSemTelefone: number;
  totalSemOptIn: number;
  blockedBy: Array<{
    reason: string;
    count: number;
  }>;
  recipients: ResolvedAudienceRecipient[];
  page: number;
  limit: number;
  totalPages: number;
};

/* =========================
   UTILS
========================= */

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

export function getMonthDayKey(date: Date | null | undefined = new Date()) {
  if (!date) return null;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${month}-${day}`;
}

function toShortCode(id: string) {
  return id.slice(-8).toUpperCase();
}

function normalizeAudienceFilter(filter: CampaignAudienceFilter) {
  return {
    birthdayMonthDay: filter.birthdayMonthDay ?? null,
    tags: [...new Set((filter.tags ?? []).map(normalizeTag).filter(Boolean))],
    groups: [...new Set((filter.groups ?? []).map(normalizeTag).filter(Boolean))],
    priorities: [...new Set((filter.priorities ?? []).map(normalizeTag).filter(Boolean))],
    locations: [...new Set((filter.locations ?? []).map(normalizeTag).filter(Boolean))],
    interests: [...new Set((filter.interests ?? []).map(normalizeTag).filter(Boolean))],
    contactTypes: [...new Set((filter.contactTypes ?? []).map(normalizeTag).filter(Boolean))],
  };
}

function normalizeSelectionIds(ids: string[] | undefined) {
  return [...new Set((ids ?? []).map((v) => v.trim()).filter(Boolean))];
}

function isValidPhone(phone: string) {
  const normalized = phone.replace(/[^\d]/g, "");
  return normalized.length >= 10 && normalized.length <= 15;
}

/* =========================
   AUDIENCE BUILD
========================= */

function buildAudienceWhere(input: {
  mandateId: string;
  filter: CampaignAudienceFilter;
  selectedContactIds: string[];
}) {
  const normalized = normalizeAudienceFilter(input.filter);
  const manual = input.selectedContactIds.length > 0;

  const where: Prisma.ContactWhereInput = {
    mandateId: input.mandateId,
  };

  if (manual) {
    where.id = { in: input.selectedContactIds };
    return where;
  }

  if (normalized.tags.length > 0) {
    where.tags = { hasEvery: normalized.tags };
  }

  if (normalized.birthdayMonthDay) {
    where.birthday = { not: null };
  }

  return where;
}

/* =========================
   CORE RESOLUTION
========================= */

function getOptInStatus(input: {
  contactId: string;
  phone: string;
  optIn: boolean;
  status: ContactStatus;
  source: string;
  consentStatus: string | null;
  blockedFromCampaigns: boolean;
  firstContactSentAt: Date | null;
  campaignMode?: string | null;
  selectedContactIds: string[];
}) {
  if (!input.phone?.trim()) return "SEM_TELEFONE";
  if (!isValidPhone(input.phone) || input.status === ContactStatus.INVALID)
    return "BLOCKED";
  if (input.status === ContactStatus.UNSUBSCRIBED || input.consentStatus === "OPTED_OUT") return "OPTED_OUT";
  if (input.status === ContactStatus.BLOCKED || input.blockedFromCampaigns) return "BLOCKED";
  if (input.optIn || input.consentStatus === "OPTED_IN") return "OPTED_IN";

  const firstContact = evaluateFirstContactEligibility(input);
  return firstContact.allowed ? FIRST_CONTACT_ALLOWED : PENDING_FIRST_CONTACT;
}

function getSelectionState(input: {
  isEligible: boolean;
  optInStatus: ResolvedAudienceRecipient["optInStatus"];
  alreadyQueued: boolean;
}) {
  if (input.alreadyQueued) return "JA_ENFILEIRADO";
  if (input.isEligible) return "ELEGIVEL";
  if (input.optInStatus === "BLOCKED")
    return "BLOQUEADO";
  if (input.optInStatus === "PENDING_FIRST_CONTACT") return "PRIMEIRO_CONTATO_PENDENTE";
  if (input.optInStatus === "SEM_TELEFONE") return "SEM_TELEFONE";
  return "OPT_OUT";
}

/* =========================
   MAIN COLLECTION
========================= */

async function collectAudienceResolution(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  campaignId?: string;
  selectedContactIds?: string[];
  campaignMode?: string | null;
}) {
  const filter = normalizeAudienceFilter(input.audienceFilter);
  const selected = normalizeSelectionIds(input.selectedContactIds);
  const [contacts, existing] = await Promise.all([
    prisma.contact.findMany({
      where: buildAudienceWhere({
        mandateId: input.mandateId,
        filter,
        selectedContactIds: selected,
      }),
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
        birthday: true,
        optIn: true,
        optInAt: true,
        consentStatus: true,
        firstContactSentAt: true,
        firstContactStatus: true,
        blockedFromCampaigns: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),

    input.campaignId
      ? prisma.campaignRecipient.findMany({
          where: { campaignId: input.campaignId },
          select: { contactId: true, status: true },
        })
      : [],
  ]);

  const existingMap = new Map(existing.map((e) => [e.contactId, e.status]));
  const skipValidation = isAudienceValidationBypassed();
  const terms = flattenAudience(filter);

  const resolved: ResolvedAudienceRecipient[] = contacts.map((c) => {
    const optInStatus = getOptInStatus({
      contactId: c.id,
      phone: c.phone,
      optIn: c.optIn,
      status: c.status,
      source: c.source,
      consentStatus: c.consentStatus,
      blockedFromCampaigns: c.blockedFromCampaigns,
      firstContactSentAt: c.firstContactSentAt,
      campaignMode: input.campaignMode,
      selectedContactIds: selected,
    });

    const existingStatus = existingMap.get(c.id);

    const alreadyQueued =
      !!existingStatus &&
      existingStatus !== CampaignRecipientStatus.SKIPPED;

    const isEligible =
      !alreadyQueued &&
      (skipValidation ||
        ((optInStatus === "OPTED_IN" || optInStatus === FIRST_CONTACT_ALLOWED) &&
          c.status === ContactStatus.ACTIVE));

    const selectionState = getSelectionState({
      isEligible,
      optInStatus,
      alreadyQueued,
    });

    return {
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      code: toShortCode(c.id),
      tags: c.tags,
      birthday: c.birthday?.toISOString() ?? null,
      optInStatus,
      inclusionReason: terms.length
        ? "tags conferem"
        : "preview pronto",
      renderedPreview: personalizeCampaignText(input.templateBody, c.name),
      importedAt: c.createdAt.toISOString(),
      contactStatus: c.status,
      isEligible,
      alreadyQueued,
      selectionState,
    };
  });

  return {
    resolvedRecipients: resolved,
    totalSelected: selected.length,
    totalFoundContacts: contacts.length,
    existingByContactId: existingMap,
  };
}

/* =========================
   PUBLIC API
========================= */

type ResolveCampaignAudienceInput = {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  campaignId?: string;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
  showOnlyEligible?: boolean;
  optInFilter?: "ALL" | "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT";
  contactStatus?: "ALL" | "ACTIVE" | "UNSUBSCRIBED" | "BLOCKED" | "INVALID";
  birthdayFilter?: "ALL" | "WITH_BIRTHDAY" | "TODAY";
  page?: number;
  limit?: number;
  query?: string;
  sortBy?: CampaignAudienceSortBy;
  sortOrder?: CampaignAudienceSortOrder;
  campaignMode?: string | null;
};

export async function resolveCampaignAudience(
  input: ResolveCampaignAudienceInput,
) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const query = input.query?.trim() ?? "";
  const todayKey = getMonthDayKey(new Date());

  const {
    resolvedRecipients,
    existingByContactId,
    totalSelected,
    totalFoundContacts,
  } = await collectAudienceResolution(input);

  const filtered = resolvedRecipients.filter((recipient) => {
    if (
      query &&
      !recipient.name.toLowerCase().includes(query.toLowerCase()) &&
      !recipient.code.toLowerCase().includes(query.toLowerCase()) &&
      !recipient.phone.includes(query)
    ) {
      return false;
    }

    if (input.selectedOnly && !input.selectedContactIds?.includes(recipient.contactId)) {
      return false;
    }

    if (input.showOnlyEligible && !recipient.isEligible) {
      return false;
    }

    if (
      input.optInFilter &&
      input.optInFilter !== "ALL" &&
      !(
        (input.optInFilter === "OPT_IN" && recipient.optInStatus === "OPTED_IN") ||
        (input.optInFilter === "SEM_OPT_IN" &&
          (recipient.optInStatus === "PENDING_FIRST_CONTACT" ||
            recipient.optInStatus === FIRST_CONTACT_ALLOWED)) ||
        (input.optInFilter === "OPT_OUT" && recipient.optInStatus === "OPTED_OUT")
      )
    ) {
      return false;
    }

    if (input.contactStatus && input.contactStatus !== "ALL" && recipient.contactStatus !== input.contactStatus) {
      return false;
    }

    if (input.birthdayFilter === "WITH_BIRTHDAY" && !recipient.birthday) {
      return false;
    }

    if (
      input.birthdayFilter === "TODAY" &&
      getMonthDayKey(recipient.birthday ? new Date(recipient.birthday) : null) !== todayKey
    ) {
      return false;
    }

    return true;
  });

  filtered.sort((left, right) => {
    const direction = input.sortOrder === "desc" ? -1 : 1;
    const sortBy = input.sortBy ?? "name";

    if (sortBy === "code") {
      return left.code.localeCompare(right.code) * direction;
    }

    if (sortBy === "importedAt") {
      return (new Date(left.importedAt).getTime() - new Date(right.importedAt).getTime()) * direction;
    }

    return left.name.localeCompare(right.name) * direction;
  });

  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  const totalInvalidos = 0;
  const totalBloqueados = filtered.filter((r) => r.optInStatus === "BLOCKED").length;
  const totalOptOut = filtered.filter((r) => r.optInStatus === "OPTED_OUT").length;
  const totalSemTelefone = filtered.filter((r) => r.optInStatus === "SEM_TELEFONE").length;
  const totalSemOptIn = filtered.filter((r) =>
    r.optInStatus === "PENDING_FIRST_CONTACT" || r.optInStatus === FIRST_CONTACT_ALLOWED
  ).length;

  return {
    totalElegiveis: filtered.filter((r) => r.isEligible).length,
    totalEncontrados: totalFoundContacts,
    totalMatched: filtered.length,
    totalSelecionados: totalSelected,
    totalJaConfirmados: [...existingByContactId.keys()].length,
    totalInvalidos,
    totalBloqueados,
    totalOptOut,
    totalSemTelefone,
    totalSemOptIn,
    blockedBy: [
      { reason: "INVALIDO", count: totalInvalidos },
      { reason: "BLOQUEADO", count: totalBloqueados },
      { reason: "OPT_OUT", count: totalOptOut },
      { reason: "SEM_TELEFONE", count: totalSemTelefone },
      { reason: "SEM_OPT_IN", count: totalSemOptIn }
    ].filter((item) => item.count > 0),
    recipients: paginated,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
  };
}

/* =========================
   MATERIALIZE
========================= */

export async function materializeCampaignAudience(input: {
  campaignId: string;
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  selectedContactIds?: string[];
  campaignMode?: string | null;
}) {
  const { resolvedRecipients } = await collectAudienceResolution({
    campaignId: input.campaignId,
    mandateId: input.mandateId,
    templateBody: input.templateBody,
    audienceFilter: input.audienceFilter,
    selectedContactIds: input.selectedContactIds,
    campaignMode: input.campaignMode,
  });

  if (resolvedRecipients.length > 0) {
    await prisma.campaignRecipient.createMany({
      data: resolvedRecipients.map((r) => ({
        campaignId: input.campaignId,
        contactId: r.contactId,
        status: r.isEligible
          ? CampaignRecipientStatus.PENDING
          : CampaignRecipientStatus.SKIPPED,
        messagePreview: r.renderedPreview,
      })),
      skipDuplicates: true,
    });
  }

  return {
    createdRecipients: resolvedRecipients.filter((r) => r.isEligible).length,
    totalElegiveis: resolvedRecipients.filter((r) => r.isEligible).length,
    totalInvalidos: 0,
    totalBloqueados: resolvedRecipients.filter((r) => r.optInStatus === "BLOCKED").length,
    totalOptOut: resolvedRecipients.filter((r) => r.optInStatus === "OPTED_OUT").length,
    totalSemTelefone: resolvedRecipients.filter((r) => r.optInStatus === "SEM_TELEFONE").length,
    totalSemOptIn: resolvedRecipients.filter((r) =>
      r.optInStatus === "PENDING_FIRST_CONTACT" || r.optInStatus === FIRST_CONTACT_ALLOWED
    ).length,
  };
}
