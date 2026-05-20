import { CampaignRecipientStatus, ContactStatus, Prisma } from "@prisma/client";

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
  blockedBy: Array<{
    reason: string;
    count: number;
  }>;
  recipients: ResolvedAudienceRecipient[];
  page: number;
  limit: number;
  totalPages: number;
};

type AudienceResolutionRecord = ResolvedAudienceRecipient;

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
}

function getMonthDayKey(date: Date | null | undefined) {
  if (!date) {
    return null;
  }

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
  return [...new Set((ids ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function isValidPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.length >= 10 && normalized.length <= 15;
}

function buildAudienceWhere(input: {
  mandateId: string;
  filter: CampaignAudienceFilter;
  selectedContactIds: string[];
  selectedOnly: boolean;
}) {
  const normalized = normalizeAudienceFilter(input.filter);
  const flattenedTerms = [...new Set(flattenAudience(normalized))];
  const manualSelection = input.selectedContactIds.length > 0;

  return {
    mandateId: input.mandateId,
    ...(manualSelection
      ? {
          id: {
            in: input.selectedContactIds
          }
        }
      : {}),
    ...(!manualSelection && flattenedTerms.length > 0
      ? {
          tags: {
            hasEvery: flattenedTerms
          }
        }
      : {}),
    ...(!manualSelection && normalized.birthdayMonthDay
      ? {
          birthday: {
            not: null
          }
        }
      : {})
  } satisfies Prisma.ContactWhereInput;
}

function getOptInStatus(input: {
  phone: string;
  optIn: boolean;
  status: ContactStatus;
  manualSelection: boolean;
}) {
  const phone = input.phone.trim();

  if (!phone) {
    return "SEM_TELEFONE" as const;
  }

  if (!isValidPhone(phone) || input.status === ContactStatus.INVALID) {
    return "INVALIDO" as const;
  }

  if (input.status === ContactStatus.UNSUBSCRIBED) {
    return "OPT_OUT" as const;
  }

  if (input.status === ContactStatus.BLOCKED) {
    return "BLOQUEADO" as const;
  }

  if (!input.optIn && !input.manualSelection) {
    return "SEM_OPT_IN" as const;
  }

  return "OPT_IN" as const;
}

function getSelectionState(input: {
  isEligible: boolean;
  optInStatus: ResolvedAudienceRecipient["optInStatus"];
  alreadyQueued: boolean;
}) {
  if (input.alreadyQueued) {
    return "JA_ENFILEIRADO" as const;
  }

  if (input.isEligible) {
    return "ELEGIVEL" as const;
  }

  if (input.optInStatus === "BLOQUEADO" || input.optInStatus === "INVALIDO") {
    return "BLOQUEADO" as const;
  }

  if (input.optInStatus === "SEM_OPT_IN") {
    return "SEM_OPT_IN" as const;
  }

  if (input.optInStatus === "SEM_TELEFONE") {
    return "SEM_TELEFONE" as const;
  }

  return "OPT_OUT" as const;
}

function getInclusionReason(input: {
  tags: string[];
  birthdayMonthDay: string | null;
  selectedOnly: boolean;
  selectedContactIds: string[];
}) {
  const reasons: string[] = [];

  if (input.selectedOnly && input.selectedContactIds.length > 0) {
    reasons.push("selecionado manualmente");
  }

  if (input.tags.length > 0) {
    reasons.push("tags conferem");
  }

  if (input.birthdayMonthDay) {
    reasons.push("aniversario confere");
  }

  reasons.push("preview individual pronto");

  return reasons.join(" • ");
}

function matchesQuery(record: AudienceResolutionRecord, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPhone = record.phone.replace(/[^\d]/g, "");

  return (
    record.name.toLowerCase().includes(normalizedQuery) ||
    record.code.toLowerCase().includes(normalizedQuery) ||
    normalizedPhone.includes(normalizedQuery.replace(/[^\d]/g, ""))
  );
}

function matchesExtraFilters(
  record: AudienceResolutionRecord,
  input: {
    optInFilter: CampaignAudienceOptInFilter;
    contactStatus: CampaignAudienceContactStatusFilter;
    birthdayFilter: CampaignAudienceBirthdayFilter;
    todayMonthDay: string;
  }
) {
  const hasBirthday = Boolean(record.birthday);
  const birthdayKey = record.birthday ? getMonthDayKey(new Date(record.birthday)) : null;

  if (input.optInFilter === "OPT_IN" && record.optInStatus !== "OPT_IN") {
    return false;
  }

  if (input.optInFilter === "SEM_OPT_IN" && record.optInStatus !== "SEM_OPT_IN") {
    return false;
  }

  if (input.optInFilter === "OPT_OUT" && record.optInStatus !== "OPT_OUT") {
    return false;
  }

  if (input.contactStatus !== "ALL") {
    if (record.contactStatus !== input.contactStatus) {
      return false;
    }
  }

  if (input.birthdayFilter === "WITH_BIRTHDAY" && !hasBirthday) {
    return false;
  }

  if (input.birthdayFilter === "TODAY" && birthdayKey !== input.todayMonthDay) {
    return false;
  }

  return true;
}

function compareRecipients(
  left: AudienceResolutionRecord,
  right: AudienceResolutionRecord,
  sortBy: CampaignAudienceSortBy,
  sortOrder: CampaignAudienceSortOrder
) {
  const direction = sortOrder === "asc" ? 1 : -1;
  const leftValue = sortBy === "importedAt" ? left.importedAt : sortBy === "code" ? left.code : left.name;
  const rightValue = sortBy === "importedAt" ? right.importedAt : sortBy === "code" ? right.code : right.name;

  return leftValue.localeCompare(rightValue, "pt-BR") * direction;
}

async function collectAudienceResolution(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  campaignId?: string;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
}) {
  const normalizedAudience = normalizeAudienceFilter(input.audienceFilter);
  const selectedContactIds = normalizeSelectionIds(input.selectedContactIds);
  const manualSelection = selectedContactIds.length > 0;

  const [contacts, existingRecipients] = await Promise.all([
    prisma.contact.findMany({
      where: buildAudienceWhere({
        mandateId: input.mandateId,
        filter: normalizedAudience,
        selectedContactIds,
        selectedOnly: Boolean(input.selectedOnly)
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
          where: {
            campaignId: input.campaignId
          },
          select: {
            contactId: true,
            status: true
          }
        })
      : Promise.resolve([])
  ]);

  const existingByContactId = new Map(existingRecipients.map((recipient) => [recipient.contactId, recipient.status]));
  const audienceTerms = flattenAudience(normalizedAudience);

  const resolvedRecipients: AudienceResolutionRecord[] = contacts
    .filter((contact) =>
      manualSelection
        ? true
        : normalizedAudience.birthdayMonthDay
          ? getMonthDayKey(contact.birthday) === normalizedAudience.birthdayMonthDay
          : true
    )
    .map((contact) => {
      const optInStatus = getOptInStatus({
        phone: contact.phone,
        optIn: contact.optIn,
        status: contact.status,
        manualSelection
      });
      const existingStatus = existingByContactId.get(contact.id);
      const alreadyQueued = Boolean(existingStatus && existingStatus !== CampaignRecipientStatus.SKIPPED);
      const isEligible =
        !alreadyQueued &&
        (manualSelection
          ? optInStatus === "OPT_IN" && contact.status === ContactStatus.ACTIVE
          : optInStatus === "OPT_IN" && contact.status === ContactStatus.ACTIVE);
      const selectionState = getSelectionState({
        isEligible,
        optInStatus,
        alreadyQueued
      });

      return {
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        code: toShortCode(contact.id),
        tags: contact.tags,
        birthday: contact.birthday?.toISOString() ?? null,
        optInStatus,
        inclusionReason: getInclusionReason({
          tags: audienceTerms,
          birthdayMonthDay: normalizedAudience.birthdayMonthDay,
          selectedOnly: manualSelection,
          selectedContactIds
        }),
        renderedPreview: personalizeCampaignText(input.templateBody, contact.name),
        importedAt: contact.createdAt.toISOString(),
        contactStatus: contact.status,
        isEligible,
        alreadyQueued,
        selectionState
      };
    });

  const skippedReasonCounts = new Map<string, number>();

  for (const recipient of resolvedRecipients) {
    if (recipient.isEligible) {
      continue;
    }

    const reason =
      recipient.selectionState === "JA_ENFILEIRADO"
        ? "already_queued"
        : recipient.selectionState === "SEM_TELEFONE"
          ? "missing_phone"
          : recipient.selectionState === "OPT_OUT"
            ? "opt_out"
            : recipient.selectionState === "SEM_OPT_IN"
              ? "missing_opt_in"
              : recipient.selectionState === "BLOQUEADO"
                ? recipient.optInStatus === "INVALIDO"
                  ? "invalid_phone"
                  : "explicit_block"
                : "unknown";

    skippedReasonCounts.set(reason, (skippedReasonCounts.get(reason) ?? 0) + 1);
  }

  console.info("[campaign-audience] resolved", {
    campaignId: input.campaignId ?? null,
    mandateId: input.mandateId,
    manualSelection,
    selectedContactIds: selectedContactIds.length,
    foundContacts: contacts.length,
    eligibleContacts: resolvedRecipients.filter((recipient) => recipient.isEligible).length,
    skippedContacts: resolvedRecipients.filter((recipient) => !recipient.isEligible).length,
    skippedReasons: Object.fromEntries(skippedReasonCounts)
  });

  return {
    resolvedRecipients,
    totalSelected: selectedContactIds.length,
    totalFoundContacts: contacts.length,
    existingByContactId
  };
}

export async function resolveCampaignAudience(input: {
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  campaignId?: string;
  selectedContactIds?: string[];
  selectedOnly?: boolean;
  showOnlyEligible?: boolean;
  query?: string;
  optInFilter?: CampaignAudienceOptInFilter;
  contactStatus?: CampaignAudienceContactStatusFilter;
  birthdayFilter?: CampaignAudienceBirthdayFilter;
  page?: number;
  limit?: number;
  sortBy?: CampaignAudienceSortBy;
  sortOrder?: CampaignAudienceSortOrder;
}) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const sortBy = input.sortBy ?? "name";
  const sortOrder = input.sortOrder ?? "asc";
  const query = input.query?.trim() ?? "";
  const optInFilter = input.optInFilter ?? "ALL";
  const contactStatus = input.contactStatus ?? "ALL";
  const birthdayFilter = input.birthdayFilter ?? "ALL";
  const todayMonthDay = getMonthDayKey(new Date()) ?? "";
  const { resolvedRecipients, existingByContactId, totalSelected, totalFoundContacts } = await collectAudienceResolution(
    input
  );

  const filteredRecipients = resolvedRecipients
    .filter((recipient) => matchesQuery(recipient, query))
    .filter((recipient) =>
      matchesExtraFilters(recipient, {
        optInFilter,
        contactStatus,
        birthdayFilter,
        todayMonthDay
      })
    );

  const recipientsToPaginate = input.showOnlyEligible
    ? filteredRecipients.filter((recipient) => recipient.isEligible)
    : filteredRecipients;
  const sortedRecipients = [...recipientsToPaginate].sort((left, right) =>
    compareRecipients(left, right, sortBy, sortOrder)
  );
  const offset = (page - 1) * limit;
  const paginatedRecipients = sortedRecipients.slice(offset, offset + limit);
  const totalPages = Math.max(1, Math.ceil(sortedRecipients.length / limit));
  const blockedBy = [
    { reason: "invalid_phone", count: filteredRecipients.filter((recipient) => recipient.optInStatus === "INVALIDO").length },
    { reason: "opt_out", count: filteredRecipients.filter((recipient) => recipient.optInStatus === "OPT_OUT").length },
    { reason: "explicit_block", count: filteredRecipients.filter((recipient) => recipient.optInStatus === "BLOQUEADO").length },
    { reason: "missing_phone", count: filteredRecipients.filter((recipient) => recipient.optInStatus === "SEM_TELEFONE").length },
    { reason: "missing_opt_in", count: filteredRecipients.filter((recipient) => recipient.optInStatus === "SEM_OPT_IN").length },
    {
      reason: "already_queued",
      count: filteredRecipients.filter((recipient) => recipient.selectionState === "JA_ENFILEIRADO").length
    }
  ].filter((item) => item.count > 0);

  return {
    totalElegiveis: filteredRecipients.filter((recipient) => recipient.isEligible).length,
    totalInvalidos: filteredRecipients.filter((recipient) => recipient.optInStatus === "INVALIDO").length,
    totalBloqueados: filteredRecipients.filter((recipient) => recipient.optInStatus === "BLOQUEADO").length,
    totalOptOut: filteredRecipients.filter((recipient) => recipient.optInStatus === "OPT_OUT").length,
    totalSemTelefone: filteredRecipients.filter((recipient) => recipient.optInStatus === "SEM_TELEFONE").length,
    totalSemOptIn: filteredRecipients.filter((recipient) => recipient.optInStatus === "SEM_OPT_IN").length,
    totalJaConfirmados: filteredRecipients.filter((recipient) => existingByContactId.has(recipient.contactId)).length,
    totalSelecionados: totalSelected,
    totalEncontrados: totalFoundContacts,
    totalMatched: filteredRecipients.length,
    blockedBy,
    recipients: paginatedRecipients,
    page,
    limit,
    totalPages
  } satisfies ResolvedCampaignAudience;
}

export async function materializeCampaignAudience(input: {
  campaignId: string;
  mandateId: string;
  templateBody: string;
  audienceFilter: CampaignAudienceFilter;
  selectedContactIds?: string[];
}) {
  const [{ resolvedRecipients }, resolvedAudience] = await Promise.all([
    collectAudienceResolution({
      campaignId: input.campaignId,
      mandateId: input.mandateId,
      templateBody: input.templateBody,
      audienceFilter: input.audienceFilter,
      selectedContactIds: input.selectedContactIds,
      selectedOnly: Boolean(input.selectedContactIds?.length)
    }),
    resolveCampaignAudience({
      mandateId: input.mandateId,
      campaignId: input.campaignId,
      templateBody: input.templateBody,
      audienceFilter: input.audienceFilter,
      selectedContactIds: input.selectedContactIds,
      selectedOnly: Boolean(input.selectedContactIds?.length),
      showOnlyEligible: false
    })
  ]);

  if (resolvedRecipients.length > 0) {
    await prisma.campaignRecipient.createMany({
      data: resolvedRecipients.map((recipient) => ({
        campaignId: input.campaignId,
        contactId: recipient.contactId,
        status: recipient.isEligible
          ? CampaignRecipientStatus.PENDING
          : recipient.optInStatus === "OPT_OUT"
            ? CampaignRecipientStatus.UNSUBSCRIBED
            : CampaignRecipientStatus.SKIPPED,
        messagePreview: recipient.renderedPreview,
        errorMessage: recipient.isEligible
          ? null
          : recipient.selectionState === "SEM_TELEFONE"
            ? "Contato sem telefone para envio."
            : recipient.optInStatus === "INVALIDO"
              ? "Contato com telefone invalido para envio."
              : recipient.optInStatus === "BLOQUEADO"
                ? "Contato bloqueado explicitamente para envio."
                : recipient.selectionState === "SEM_OPT_IN"
                  ? "Contato sem opt-in para campanha."
                  : recipient.selectionState === "OPT_OUT"
                    ? "Contato com opt-out registrado."
                    : recipient.selectionState === "JA_ENFILEIRADO"
                      ? "Contato já foi confirmado anteriormente nesta campanha."
                      : "Contato bloqueado para envio supervisionado."
      })),
      skipDuplicates: true
    });
  }

  return {
    ...resolvedAudience,
    createdRecipients: resolvedRecipients.filter((recipient) => recipient.isEligible).length
  };
}
