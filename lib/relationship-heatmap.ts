import { prisma } from "@/lib/prisma";

const noInteractionFallbackDays = 365;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysSince(value: Date | null, now = new Date()) {
  if (!value) {
    return noInteractionFallbackDays;
  }

  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildHeatReason(input: {
  vipContacts: number;
  leaderContacts: number;
  socialDemandContacts: number;
  staleContacts: number;
  averageDaysWithoutInteraction: number;
}) {
  const reasons: string[] = [];

  if (input.vipContacts > 0) reasons.push("concentracao de VIPs");
  if (input.leaderContacts > 0) reasons.push("liderancas territoriais");
  if (input.socialDemandContacts > 0) reasons.push("demandas sociais");
  if (input.staleContacts > 0) reasons.push("contatos sem interacao recente");
  if (input.averageDaysWithoutInteraction >= 90) reasons.push("tempo elevado sem interacao");

  return reasons.length > 0
    ? reasons.join(" + ")
    : "Regiao com baixa criticidade registrada";
}

export async function getRelationshipHeatmap(mandateId: string) {
  const contacts = await prisma.contact.findMany({
    where: { mandateId },
    select: {
      neighborhood: true,
      zone: true,
      influenceLevel: true,
      influenceScore: true,
      relationshipScore: true,
      relationshipStatus: true,
      role: true,
      lastInteractionAt: true
    }
  });

  const groups = new Map<
    string,
    {
      neighborhood: string;
      zone: string;
      influenceScores: number[];
      relationshipScores: number[];
      daysWithoutInteraction: number[];
      totalContacts: number;
      vipContacts: number;
      highInfluenceContacts: number;
      inactiveContacts: number;
      leaderContacts: number;
      socialDemandContacts: number;
      staleContacts: number;
    }
  >();

  for (const contact of contacts) {
    const neighborhood = contact.neighborhood?.trim() || "Sem bairro";
    const zone = contact.zone?.trim() || "Sem zona";
    const key = `${neighborhood}::${zone}`;
    const group =
      groups.get(key) ??
      {
        neighborhood,
        zone,
        influenceScores: [],
        relationshipScores: [],
        daysWithoutInteraction: [],
        totalContacts: 0,
        vipContacts: 0,
        highInfluenceContacts: 0,
        inactiveContacts: 0,
        leaderContacts: 0,
        socialDemandContacts: 0,
        staleContacts: 0
      };

    const daysWithoutInteraction = daysSince(contact.lastInteractionAt);
    group.totalContacts += 1;
    group.influenceScores.push(contact.influenceScore);
    group.relationshipScores.push(contact.relationshipScore);
    group.daysWithoutInteraction.push(daysWithoutInteraction);

    if (contact.influenceLevel === "VIP") group.vipContacts += 1;
    if (contact.influenceLevel === "HIGH") group.highInfluenceContacts += 1;
    if (contact.relationshipStatus === "INACTIVE") group.inactiveContacts += 1;
    if (
      contact.role === "COMMUNITY_LEADER" ||
      contact.role === "RELIGIOUS_LEADER" ||
      contact.role === "SPORTS_LEADER" ||
      contact.role === "ASSOCIATION_LEADER"
    ) {
      group.leaderContacts += 1;
    }
    if (contact.role === "SOCIAL_DEMAND") group.socialDemandContacts += 1;
    if (daysWithoutInteraction >= 90) group.staleContacts += 1;

    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const averageDaysWithoutInteraction = average(group.daysWithoutInteraction);
      const heatScore = clampScore(
        Math.min(40, group.totalContacts * 4) +
          group.vipContacts * 12 +
          group.leaderContacts * 8 +
          group.socialDemandContacts * 6 +
          group.staleContacts * 4
      );

      return {
        neighborhood: group.neighborhood,
        zone: group.zone,
        totalContacts: group.totalContacts,
        vipContacts: group.vipContacts,
        highInfluenceContacts: group.highInfluenceContacts,
        inactiveContacts: group.inactiveContacts,
        leaderContacts: group.leaderContacts,
        socialDemandContacts: group.socialDemandContacts,
        staleContacts: group.staleContacts,
        averageInfluenceScore: Math.round(average(group.influenceScores)),
        averageRelationshipScore: Math.round(average(group.relationshipScores)),
        heatScore,
        heatReason: buildHeatReason({
          vipContacts: group.vipContacts,
          leaderContacts: group.leaderContacts,
          socialDemandContacts: group.socialDemandContacts,
          staleContacts: group.staleContacts,
          averageDaysWithoutInteraction
        })
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore || b.totalContacts - a.totalContacts);
}
