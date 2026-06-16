import { CampaignRecipientStatus, ContactStatus, Prisma } from "@prisma/client";

import { isAudienceValidationBypassed } from "@/lib/audience-validation";
import { flattenAudience } from "@/lib/campaign-infrastructure";
import { personalizeCampaignText } from "@/lib/campaign-execution";
import { prisma } from "@/lib/prisma";

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
export type CampaignAudienceOptInFilter = "ALL" | "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT";
export type CampaignAudienceContactStatusFilter =
  | "ALL"
  | "ACTIVE"
  | "UNSUBSCRIBED"
  | "BLOCKED"
  | "INVALID";
export type CampaignAudienceBirthdayFilter = "ALL" | "WITH_BIRTHDAY" | "TODAY";

export type ResolvedAudienceRecipient = {
  contactId: string;
  name: string;
  phone: string;
  code: string;
  tags: string[];
  birthday: string | null;
  optInStatus: "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT" | "BLOQUEADO" | "INVALIDO" | "SEM_TELEFONE";
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
    | "SEM_TELEFONE"
    | "OPT_OUT"
    | "JA_ENFILEIRADO";
};

export type ResolvedCampaignAudience = {
  totalElegiveis: number;
  totalInvalidos: number;
  totalBloqueados: number;
  totalOptOut: number;
  totalSemTelefone: number;
  totalSemOptIn: number;
  totalJaConfirmados: number;
  totalSelecionados: number;
  totalEncontrados: number;
  totalMatched: number;
  blockedBy: Array<{ reason: string; count: number }>;
  recipients: ResolvedAudienceRecipient[];
  page: number;
  limit: number;
  totalPages: number;
};

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

function getMonthDayKey(date: Date | null | undefined) {
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
    contactTypes: [...new Set((filter.contactTypes ?? []).map(normalizeTag).filter(Boolean))]
  };
}

function normalizeSelectionIds(ids: string[] | undefined) {
  return [...new Set((ids ?? []).map((v) => v.trim()).filter(Boolean))];
}

function isValidPhone(phone: string) {
  const normalized = phone.replace(/[^\d]/g, "");
  return normalized.length >= 10 && normalized.length <= 15;
}

function buildAudienceWhere(input: {
  mandateId: string;
  filter: CampaignAudienceFilter;
  selectedContactIds: string[];
}) {
  const normalized = normalizeAudienceFilter(input.filter);
  const flattened = [...new Set(flattenAudience(normalized))];
  const manual = input.selectedContactIds.length > 0;

  const where: Prisma.ContactWhereInput = {
    mandateId: input.mandateId
  };

  if (manual) {
    where.id = { in: input.selectedContactIds };
    return where;
  }

  if (flattened.length > 0) {
    where.tags = { hasEvery: flattened };
  }

  if (normalized.birthdayMonthDay) {
    where.birthday = { not: null };
  }

  return where;
}

function getOptInStatus(input: {
  phone: string;
  optIn: boolean;
  status: ContactStatus;
  manualSelection: boolean;
}) {
  if (!input.phone?.trim()) return "SEM_TELEFONE";
  if (!isValidPhone(input.phone) || input.status === ContactStatus.INVALID) return "INVALIDO";
  if (input.status === ContactStatus.UNSUBSCRIBED) return "OPT_OUT";
  if (input.status === ContactStatus.BLOCKED) return "BLOQUEADO";
  if (!input.optIn && !input.manualSelection) return "SEM_OPT_IN";
  return "OPT_IN";
}

function getSelectionState(input: {
  isEligible: boolean;
  optInStatus: ResolvedAudienceRecipient["optInStatus"];
  alreadyQueued: boolean;
}) {
  if (input.alreadyQueued) return "JA_ENFILEIRADO";
  if (input.isEligible) return "ELEGIVEL";
  if (input.optInStatus === "BLOQUEADO" || input.optInStatus === "INVALIDO") return "BLOQUEADO";
  if (input.optInStatus === "SEM_OPT_IN") return "SEM_OPT_IN";
  if (input.optInStatus === "SEM_TELEFONE") return "SEM_TELEFONE";
  return "OPT_OUT";
}

function getInclusionReason(input: {
  tags: string[];
  birthdayMonthDay: string | null;
  selectedOnly: boolean;
}) {
  const r: string[] = [];
  if (input.selectedOnly) r.push("selecionado manualmente");
  if (input.tags.length) r.push("tags conferem");
  if (input.birthdayMonthDay) r.push("aniversario confere");
  r.push("preview pronto");
  return r.join(" • ");
}

function matchesQuery(r: ResolvedAudienceRecipient, q: string) {
  if (!q) return true;
  const nq = q.toLowerCase();
  return (
    r.name.toLowerCase().includes(nq) ||
    r.code.toLowerCase().includes(nq) ||
    r.phone.replace(/[^\d]/g, "").includes(nq.replace(/[^\d]/g, ""))
  );
}

function compareRecipients(
  a: ResolvedAudienceRecipient,
  b: ResolvedAudienceRecipient,
  sortBy: CampaignAudienceSortBy,
  order: CampaignAudienceSortOrder
) {
  const dir = order === "asc" ? 1 : -1;
  const av = sortBy === "importedAt" ? a.importedAt : sortBy === "code" ? a.code : a.name;
  const bv = sortBy === "importedAt" ? b.importedAt : sortBy === "code" ? b.code : b.name;
  return av.localeCompare(bv, "pt-BR") * dir;
}

async function collectAudienceResolution(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  campaignId?: string;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
}) {
  const filter = normalizeAudienceFilter(input.audienceFilter);
  const selected = normalizeSelectionIds(input.selectedContactIds);
  const manual = selected.length > 0;

  const [contacts, existing] = await Promise.all([
    prisma.contact.findMany({
      where: buildAudienceWhere({
        mandateId: input.mandateId,
        filter,
        selectedContactIds: selected
      }),
      select: {
        id: true,
        name: true,
        phone: true,
        tags: true,
        birthday: true,
        optIn: true,
        status: true,
        createdAt: true
      }
    }),
    input.campaignId
      ? prisma.campaignRecipient.findMany({
          where: { campaignId: input.campaignId },
          select: { contactId: true, status: true }
        })
      : []
  ]);

  const existingMap = new Map(existing.map((e) => [e.contactId, e.status]));
  const skipValidation = isAudienceValidationBypassed();
  const terms = flattenAudience(filter);

  const resolved: ResolvedAudienceRecipient[] = contacts.map((c) => {
    const optInStatus = getOptInStatus({
      phone: c.phone,
      optIn: c.optIn,
      status: c.status,
      manualSelection: manual
    });

    const alreadyQueued = Boolean(
      existingMap.get(c.id) && existingMap.get(c.id) !== CampaignRecipientStatus.SKIPPED
    );

    const isEligible =
      !alreadyQueued &&
      (skipValidation || (optInStatus === "OPT_IN" && c.status === ContactStatus.ACTIVE));

    const selectionState = getSelectionState({
      isEligible,
      optInStatus,
      alreadyQueued
    });

    return {
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      code: toShortCode(c.id),
      tags: c.tags,
      birthday: c.birthday?.toISOString() ?? null,
      optInStatus,
      inclusionReason: getInclusionReason({
        tags: terms,
        birthdayMonthDay: filter.birthdayMonthDay,
        selectedOnly: manual
      }),
      renderedPreview: personalizeCampaignText(input.templateBody, c.name),
      importedAt: c.createdAt.toISOString(),
      contactStatus: c.status,
      isEligible,
      alreadyQueued,
      selectionState
    };
  });

  return {
    resolvedRecipients: resolved,
    totalSelected: selected.length,
    totalFoundContacts: contacts.length,
    existingByContactId: existingMap
  };
}

export async function resolveCampaignAudience(input: any) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const query = input.query?.trim() ?? "";
  const skipValidation = isAudienceValidationBypassed();

  const { resolvedRecipients, existingByContactId, totalSelected, totalFoundContacts } =
    await collectAudienceResolution(input);

  const filtered = resolvedRecipients.filter((r) => matchesQuery(r, query));

  const sorted = [...filtered].sort((a, b) =>
    compareRecipients(a, b, input.sortBy ?? "name", input.sortOrder ?? "asc")
  );

  const offset = (page - 1) * limit;
  const paginated = sorted.slice(offset, offset + limit);

  return {
    totalElegiveis: filtered.filter((r) => r.isEligible).length,
    totalInvalidos: 0,
    totalBloqueados: 0,
    totalOptOut: 0,
    totalSemTelefone: 0,
    totalSemOptIn: 0,
    totalJaConfirmados: filtered.filter((r) => existingByContactId.has(r.contactId)).length,
    totalSelecionados: totalSelected,
    totalEncontrados: totalFoundContacts,
    totalMatched: filtered.length,
    blockedBy: [],
    recipients: paginated,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(sorted.length / limit))
  };
}

export async function materializeCampaignAudience(input: {
  campaignId: string;
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  selectedContactIds?: string[];
}) {
  const { resolvedRecipients } = await collectAudienceResolution({
    campaignId: input.campaignId,
    mandateId: input.mandateId,
    templateBody: input.templateBody,
    audienceFilter: input.audienceFilter,
    selectedContactIds: input.selectedContactIds,
    selectedOnly: Boolean(input.selectedContactIds?.length)
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
        errorMessage: r.isEligible ? null : "Contato inelegível"
      })),
      skipDuplicates: true
    });
  }

  return {
    createdRecipients: resolvedRecipients.filter((r) => r.isEligible).length
  };
}
