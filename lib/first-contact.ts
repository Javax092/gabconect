import { ContactStatus, type CampaignMode } from "@prisma/client";

export const FIRST_CONTACT_MAX_SELECTED = 5;
export const FIRST_CONTACT_ALLOWED = "FIRST_CONTACT_ALLOWED" as const;
export const PENDING_FIRST_CONTACT = "PENDING_FIRST_CONTACT" as const;
export const CONSENT_PENDING = "PENDING" as const;
export const CONSENT_OPTED_IN = "OPTED_IN" as const;
export const CONSENT_OPTED_OUT = "OPTED_OUT" as const;
export const FIRST_CONTACT_SENT = "SENT" as const;
export const MANUAL_CRM_SOURCE = "MANUAL_CRM" as const;

const MANUAL_SOURCES = new Set(["manual", "manual_crm", "crm", "MANUAL_CRM"]);

export function normalizePhoneForFirstContact(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

export function isValidFirstContactPhone(phone: string) {
  const normalized = normalizePhoneForFirstContact(phone);
  return normalized.length >= 10 && normalized.length <= 15;
}

export function isManualCrmSource(source: string | null | undefined) {
  return MANUAL_SOURCES.has((source ?? "").trim()) || MANUAL_SOURCES.has((source ?? "").trim().toLowerCase());
}

export function isFirstContactCampaignMode(mode: CampaignMode | "FIRST_CONTACT" | string | null | undefined) {
  return mode === "TEST" || mode === "FIRST_CONTACT";
}

export function evaluateFirstContactEligibility(input: {
  campaignMode?: CampaignMode | "FIRST_CONTACT" | string | null;
  selectedContactIds?: string[];
  contactId: string;
  source?: string | null;
  phone: string;
  optIn: boolean;
  status: ContactStatus;
  consentStatus?: string | null;
  blockedFromCampaigns?: boolean | null;
  firstContactSentAt?: Date | string | null;
}) {
  if (input.optIn || input.consentStatus === CONSENT_OPTED_IN) {
    return { allowed: false, reason: "Contato ja possui opt-in ativo." };
  }

  if (input.status === ContactStatus.UNSUBSCRIBED || input.consentStatus === CONSENT_OPTED_OUT) {
    return { allowed: false, reason: "Contato em opt-out." };
  }

  if (input.status === ContactStatus.BLOCKED || input.blockedFromCampaigns) {
    return { allowed: false, reason: "Contato bloqueado para campanhas." };
  }

  if (input.status === ContactStatus.INVALID || !isValidFirstContactPhone(input.phone)) {
    return { allowed: false, reason: "Telefone invalido para primeiro contato." };
  }

  if (!isManualCrmSource(input.source)) {
    return { allowed: false, reason: "Contato nao foi cadastrado manualmente no CRM." };
  }

  if (input.firstContactSentAt) {
    return { allowed: false, reason: "Primeiro contato ja foi enviado." };
  }

  if (!isFirstContactCampaignMode(input.campaignMode)) {
    return { allowed: false, reason: "Primeiro contato pendente exige campanha TEST ou FIRST_CONTACT." };
  }

  const selected = input.selectedContactIds ?? [];

  if (selected.length === 0 || !selected.includes(input.contactId)) {
    return { allowed: false, reason: "Primeiro contato exige selecao manual explicita." };
  }

  if (selected.length > FIRST_CONTACT_MAX_SELECTED) {
    return { allowed: false, reason: "Primeiro contato controlado limitado a 5 contatos." };
  }

  return { allowed: true, reason: FIRST_CONTACT_ALLOWED };
}
