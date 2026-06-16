import { Role, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type InfluenceLevel = "LOW" | "MEDIUM" | "HIGH" | "VIP";
export type RelationshipStatus = "COLD" | "WARM" | "HOT" | "INACTIVE";

type ContactForIntelligence = {
  communityRole: string | null;
  role?: string | null;
  influenceLevel?: string | null;
  politicalTemperature?: string | null;
  relationshipType?: string | null;
  tags: string[];
  relationshipStatus: string | null;
  lastInteractionAt: Date | null;
};

const recentInteractionWindowMs = 30 * 24 * 60 * 60 * 1000;
const staleInteractionWindowMs = 90 * 24 * 60 * 60 * 1000;
const inactiveWindowMs = 180 * 24 * 60 * 60 * 1000;

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasRecentInteraction(lastInteractionAt: Date | null, now = new Date()) {
  return Boolean(lastInteractionAt && now.getTime() - lastInteractionAt.getTime() <= recentInteractionWindowMs);
}

function hasNoRecentInteraction(lastInteractionAt: Date | null, now = new Date()) {
  return !lastInteractionAt || now.getTime() - lastInteractionAt.getTime() > staleInteractionWindowMs;
}

function resolveInfluenceLevel(score: number): InfluenceLevel {
  if (score >= 90) return "VIP";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function normalizeRelationshipStatus(value: string | null | undefined): RelationshipStatus | null {
  const normalized = normalizeText(value).toUpperCase();

  if (normalized === "HOT" || normalized === "WARM" || normalized === "COLD" || normalized === "INACTIVE") {
    return normalized;
  }

  return null;
}

export function resolveRelationshipStatus(contact: Pick<ContactForIntelligence, "relationshipStatus" | "lastInteractionAt">): RelationshipStatus {
  const existing = normalizeRelationshipStatus(contact.relationshipStatus);

  if (existing) {
    return existing;
  }

  if (!contact.lastInteractionAt) {
    return "COLD";
  }

  const ageMs = Date.now() - contact.lastInteractionAt.getTime();

  if (ageMs > inactiveWindowMs) {
    return "INACTIVE";
  }

  if (ageMs <= recentInteractionWindowMs) {
    return "WARM";
  }

  return "COLD";
}

export function calculateRelationshipScore(contact: Pick<ContactForIntelligence, "relationshipStatus" | "lastInteractionAt">) {
  const relationshipStatus = resolveRelationshipStatus(contact);
  let score = 25;

  if (relationshipStatus === "HOT") score = 80;
  if (relationshipStatus === "WARM") score = 55;
  if (relationshipStatus === "INACTIVE") score = 10;
  if (hasRecentInteraction(contact.lastInteractionAt)) score += 10;

  return {
    relationshipStatus,
    relationshipScore: clampScore(score)
  };
}

export function calculateInfluenceScore(contact: ContactForIntelligence) {
  const reasons: string[] = [];
  let score = 0;
  const role = normalizeText(contact.role ?? contact.communityRole);
  const tags = contact.tags.map(normalizeText);
  const relationshipStatus = normalizeRelationshipStatus(contact.politicalTemperature) ?? resolveRelationshipStatus(contact);

  if (contact.influenceLevel === "VIP") {
    score += 40;
    reasons.push("VIP");
  }

  if (contact.influenceLevel === "HIGH") {
    score += 30;
    reasons.push("alta influencia");
  }

  if (contact.influenceLevel === "MEDIUM") {
    score += 15;
    reasons.push("media influencia");
  }

  if (role.includes("presidente") && role.includes("associacao")) {
    score += 30;
    reasons.push("presidente de associacao");
  }

  if (
    role.includes("lideranca comunitaria") ||
    role.includes("lider comunitario") ||
    role.includes("lideranca de bairro")
  ) {
    score += 35;
    reasons.push("lideranca comunitaria");
  }

  if (
    role.includes("pastor") ||
    role.includes("religioso") ||
    role.includes("lider religioso") ||
    role.includes("padre")
  ) {
    score += 25;
    reasons.push("lideranca religiosa");
  }

  if (role.includes("comerciante") || role.includes("empresario") || role.includes("empreendedor")) {
    score += 20;
    reasons.push("comerciante");
  }

  if (
    role.includes("professor") ||
    role.includes("professora") ||
    role.includes("diretor") ||
    role.includes("diretora")
  ) {
    score += 20;
    reasons.push("educacao");
  }

  if (
    contact.role === "COMMUNITY_LEADER" ||
    contact.role === "RELIGIOUS_LEADER" ||
    contact.role === "SPORTS_LEADER" ||
    contact.role === "ASSOCIATION_LEADER"
  ) {
    score += 25;
    reasons.push("lideranca territorial");
  }

  if (contact.role === "ACTIVE_SUPPORTER") {
    score += 20;
    reasons.push("apoiador ativo");
  }

  if (contact.role === "INSTITUTIONAL_CONTACT") {
    score += 15;
    reasons.push("contato institucional");
  }

  if (contact.role === "SOCIAL_DEMAND") {
    score += 10;
    reasons.push("demanda social");
  }

  if (contact.politicalTemperature === "STRATEGIC") {
    score += 30;
    reasons.push("temperatura estrategica");
  }

  if (contact.politicalTemperature === "HOT") {
    score += 20;
    reasons.push("temperatura quente");
  }

  if (tags.some((tag) => tag.includes("estrategic") || tag.includes("lideranca") || tag.includes("vip"))) {
    score += 15;
    reasons.push("tag estrategica");
  }

  if (relationshipStatus === "HOT") {
    score += 15;
    reasons.push("relacionamento quente");
  }

  if (relationshipStatus === "WARM") {
    score += 10;
    reasons.push("relacionamento morno");
  }

  if (hasRecentInteraction(contact.lastInteractionAt)) {
    score += 10;
    reasons.push("interacao recente");
  }

  if (hasNoRecentInteraction(contact.lastInteractionAt)) {
    score += 10;
    reasons.push("sem interacao recente");
  }

  if (relationshipStatus === "INACTIVE") {
    score -= 20;
    reasons.push("relacionamento inativo");
  }

  const influenceScore = clampScore(score);

  return {
    influenceScore,
    influenceLevel: resolveInfluenceLevel(influenceScore),
    influenceReason: reasons.length > 0 ? reasons.join(" + ") : "Sem sinais de influencia registrados"
  };
}

function mostRecentDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, null);
}

type ContactWithInteractionLogs = Prisma.ContactGetPayload<{
  include: {
    messageLogs: { select: { createdAt: true }; orderBy: { createdAt: "desc" }; take: 1 };
    sendAttempts: { select: { createdAt: true }; orderBy: { createdAt: "desc" }; take: 1 };
  };
}>;

function resolveLastInteractionAt(contact: ContactWithInteractionLogs) {
  return mostRecentDate([
    contact.lastInteractionAt,
    contact.messageLogs[0]?.createdAt,
    contact.sendAttempts[0]?.createdAt
  ]);
}

export async function recalculateContactIntelligence(mandateId: string) {
  const contacts = await prisma.contact.findMany({
    where: { mandateId },
    include: {
      messageLogs: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      sendAttempts: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  let vipContacts = 0;
  let highInfluenceContacts = 0;

  for (const contact of contacts) {
    const lastInteractionAt = resolveLastInteractionAt(contact);
    const relationship = calculateRelationshipScore({
      relationshipStatus: contact.relationshipStatus,
      lastInteractionAt
    });
    const influence = calculateInfluenceScore({
      communityRole: contact.communityRole,
      role: contact.role,
      influenceLevel: contact.influenceLevel,
      politicalTemperature: contact.politicalTemperature,
      relationshipType: contact.relationshipType,
      tags: contact.tags,
      relationshipStatus: relationship.relationshipStatus,
      lastInteractionAt
    });

    if (influence.influenceLevel === "VIP") vipContacts += 1;
    if (influence.influenceLevel === "HIGH") highInfluenceContacts += 1;

    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        ...influence,
        relationshipStatus: relationship.relationshipStatus,
        relationshipScore: relationship.relationshipScore,
        lastInteractionAt
      }
    });
  }

  return {
    totalContacts: contacts.length,
    recalculatedContacts: contacts.length,
    vipContacts,
    highInfluenceContacts
  };
}

export function assertAdminRole(role: Role) {
  if (role !== Role.ADMIN) {
    throw new Error("ADMIN_REQUIRED");
  }
}
