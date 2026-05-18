import { DemandPriority, DemandStatus, Prisma } from "@prisma/client";

import type { ProcessCitizenMessageResult } from "@/lib/ai";
import { DEFAULT_MANDATE_CATEGORIES, normalizeCategoryName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";

const RECENT_DEMAND_WINDOW_DAYS = 7;

type CreateOrUpdateDemandFromAIResultParams = {
  mandateId: string;
  citizenId: string;
  conversationId: string;
  latestCitizenMessage: string;
  aiResult: ProcessCitizenMessageResult;
};

type CreateOrUpdateDemandFromAIResultResponse = {
  action: "created" | "updated" | "skipped";
  demandId: string | null;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

function calculateCategoryScore(categoryName: string, suggestion: string) {
  const categoryTokens = new Set(tokenize(categoryName));
  const suggestionTokens = tokenize(suggestion);

  if (categoryTokens.size === 0 || suggestionTokens.length === 0) {
    return 0;
  }

  let score = 0;

  for (const token of suggestionTokens) {
    if (categoryTokens.has(token)) {
      score += 2;
    }

    if (normalizeText(categoryName).includes(token)) {
      score += 1;
    }
  }

  return score;
}

function chooseHigherPriority(current: DemandPriority, incoming: DemandPriority) {
  const priorityWeight: Record<DemandPriority, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3
  };

  return priorityWeight[incoming] > priorityWeight[current] ? incoming : current;
}

async function ensureBestCategory(
  tx: Prisma.TransactionClient,
  mandateId: string,
  categorySuggestion: string | null
) {
  const categories = await tx.category.findMany({
    where: {
      mandateId
    }
  });

  if (categories.length === 0) {
    return tx.category.create({
      data: {
        mandateId,
        name: DEFAULT_MANDATE_CATEGORIES[DEFAULT_MANDATE_CATEGORIES.length - 1]!.name,
        color: DEFAULT_MANDATE_CATEGORIES[DEFAULT_MANDATE_CATEGORIES.length - 1]!.color
      }
    });
  }

  if (categorySuggestion) {
    const exactMatch = categories.find(
      (category) => normalizeCategoryName(category.name) === normalizeCategoryName(categorySuggestion)
    );

    if (exactMatch) {
      return exactMatch;
    }

    const ranked = categories
      .map((category) => ({
        category,
        score: calculateCategoryScore(category.name, categorySuggestion)
      }))
      .sort((a, b) => b.score - a.score);

    if (ranked[0] && ranked[0].score > 0) {
      return ranked[0].category;
    }
  }

  const fallback = categories.find((category) => normalizeCategoryName(category.name) === "geral");

  if (fallback) {
    return fallback;
  }

  return tx.category.create({
    data: {
      mandateId,
      name: DEFAULT_MANDATE_CATEGORIES[DEFAULT_MANDATE_CATEGORIES.length - 1]!.name,
      color: DEFAULT_MANDATE_CATEGORIES[DEFAULT_MANDATE_CATEGORIES.length - 1]!.color
    }
  });
}

function mergeDemandDescription(
  existingDescription: string,
  newDescription: string,
  latestCitizenMessage: string
) {
  const trimmedExisting = existingDescription.trim();
  const normalizedExisting = normalizeText(trimmedExisting);
  const normalizedIncoming = normalizeText(newDescription);

  if (normalizedExisting.includes(normalizedIncoming)) {
    return trimmedExisting;
  }

  return (
    `${trimmedExisting}\n\n` +
    `Atualização da conversa:\n` +
    `- Resumo da IA: ${newDescription.trim()}\n` +
    `- Nova mensagem do cidadão: ${latestCitizenMessage.trim()}`
  );
}

export async function createOrUpdateDemandFromAIResult({
  mandateId,
  citizenId,
  conversationId,
  latestCitizenMessage,
  aiResult
}: CreateOrUpdateDemandFromAIResultParams): Promise<CreateOrUpdateDemandFromAIResultResponse> {
  if (!aiResult.shouldCreateDemand || !aiResult.demandTitle || !aiResult.demandDescription) {
    return {
      action: "skipped",
      demandId: null
    };
  }

  const demandTitle = aiResult.demandTitle;
  const demandDescription = aiResult.demandDescription;

  try {
    return await prisma.$transaction(async (tx) => {
      const category = await ensureBestCategory(tx, mandateId, aiResult.categorySuggestion);
      const recentThreshold = new Date(
        Date.now() - RECENT_DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );

      const existingDemand = await tx.demand.findFirst({
        where: {
          mandateId,
          citizenId,
          conversationId,
          status: {
            in: [DemandStatus.NEW, DemandStatus.IN_PROGRESS]
          },
          updatedAt: {
            gte: recentThreshold
          }
        },
        orderBy: {
          updatedAt: "desc"
        }
      });

      if (existingDemand) {
        const updatedDemand = await tx.demand.update({
          where: {
            id: existingDemand.id
          },
          data: {
            description: mergeDemandDescription(
              existingDemand.description,
              demandDescription,
              latestCitizenMessage
            ),
            priority: chooseHigherPriority(existingDemand.priority, aiResult.priority),
            categoryId: category.id
          }
        });

        return {
          action: "updated" as const,
          demandId: updatedDemand.id
        };
      }

      const createdDemand = await tx.demand.create({
        data: {
          mandateId,
          citizenId,
          conversationId,
          categoryId: category.id,
          title: demandTitle,
          description: demandDescription,
          priority: aiResult.priority,
          status: DemandStatus.NEW
        }
      });

      return {
        action: "created" as const,
        demandId: createdDemand.id
      };
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Falha ao criar/atualizar demanda: ${error.message}`
        : "Falha ao criar/atualizar demanda."
    );
  }
}
