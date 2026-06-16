import {
  ConversationStatus,
  DemandPriority,
  DemandStatus,
  MessageDirection
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PENDING_DEMAND_STATUSES = [DemandStatus.NEW, DemandStatus.IN_PROGRESS] as const;

type DashboardDataParams = {
  mandateId: string;
};

type DemandWithText = {
  description: string;
};

type ConversationWithMessages = {
  messages: Array<{
    direction: MessageDirection;
    createdAt: Date;
  }>;
};

function extractNeighborhood(text: string) {
  const match = text.match(
    /\b(?:bairro|comunidade|zona|região)\s+(?:do|da|de|dos|das)?\s*([A-ZÀ-ÿ][\p{L}'’-]+(?:\s+[A-ZÀ-ÿ][\p{L}'’-]+){0,2})/iu
  );

  return match?.[1]?.trim() ?? null;
}

function buildNeighborhoodRanking(demands: DemandWithText[]) {
  const counts = new Map<string, number>();

  for (const demand of demands) {
    const neighborhood = extractNeighborhood(demand.description);

    if (!neighborhood) {
      continue;
    }

    counts.set(neighborhood, (counts.get(neighborhood) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5);
}

function calculateAverageResponseTime(conversations: ConversationWithMessages[]) {
  const responseTimes: number[] = [];

  for (const conversation of conversations) {
    let lastInboundAt: Date | null = null;

    for (const message of conversation.messages) {
      if (message.direction === MessageDirection.INBOUND) {
        lastInboundAt = message.createdAt;
        continue;
      }

      if (lastInboundAt) {
        responseTimes.push(message.createdAt.getTime() - lastInboundAt.getTime());
        lastInboundAt = null;
      }
    }
  }

  if (responseTimes.length === 0) {
    return null;
  }

  const averageMs =
    responseTimes.reduce((total, current) => total + current, 0) / responseTimes.length;

  return Math.round(averageMs / (1000 * 60));
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData({ mandateId }: DashboardDataParams) {
  const now = new Date();
  const last7DaysStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalConversations,
    openConversations,
    waitingHumanConversations,
    newDemands,
    inProgressDemands,
    resolvedDemands,
    criticalDemands,
    inboundMessagesLast7Days,
    demandsByCategoryRaw,
    demandsByPriorityRaw,
    topCategoriesThisMonthRaw,
    oldestPendingDemands,
    latestConversations,
    latestDemands,
    conversationResponseData,
    demandDescriptions
  ] = await Promise.all([
    prisma.conversation.count({
      where: {
        mandateId
      }
    }),
    prisma.conversation.count({
      where: {
        mandateId,
        status: ConversationStatus.OPEN
      }
    }),
    prisma.conversation.count({
      where: {
        mandateId,
        status: ConversationStatus.HUMAN
      }
    }),
    prisma.demand.count({
      where: {
        mandateId,
        status: DemandStatus.NEW
      }
    }),
    prisma.demand.count({
      where: {
        mandateId,
        status: DemandStatus.IN_PROGRESS
      }
    }),
    prisma.demand.count({
      where: {
        mandateId,
        status: DemandStatus.RESOLVED
      }
    }),
    prisma.demand.count({
      where: {
        mandateId,
        priority: DemandPriority.HIGH,
        status: {
          in: [...PENDING_DEMAND_STATUSES]
        }
      }
    }),
    prisma.message.count({
      where: {
        conversation: {
          mandateId
        },
        direction: MessageDirection.INBOUND,
        createdAt: {
          gte: last7DaysStart
        }
      }
    }),
    prisma.demand.groupBy({
      by: ["categoryId"],
      where: {
        mandateId
      },
      _count: {
        _all: true
      }
    }),
    prisma.demand.groupBy({
      by: ["priority"],
      where: {
        mandateId
      },
      _count: {
        _all: true
      }
    }),
    prisma.demand.groupBy({
      by: ["categoryId"],
      where: {
        mandateId,
        createdAt: {
          gte: currentMonthStart
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.demand.findMany({
      where: {
        mandateId,
        status: {
          in: [...PENDING_DEMAND_STATUSES]
        }
      },
      include: {
        citizen: true,
        category: true
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 5
    }),
    prisma.conversation.findMany({
      where: {
        mandateId
      },
      include: {
        citizen: true,
        messages: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        lastMessageAt: "desc"
      },
      take: 5
    }),
    prisma.demand.findMany({
      where: {
        mandateId
      },
      include: {
        citizen: true,
        category: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    }),
    prisma.conversation.findMany({
      where: {
        mandateId
      },
      select: {
        messages: {
          select: {
            direction: true,
            createdAt: true
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    }),
    prisma.demand.findMany({
      where: {
        mandateId
      },
      select: {
        description: true
      }
    })
  ]);

  const categoryIds = new Set([
    ...demandsByCategoryRaw.map((item) => item.categoryId),
    ...topCategoriesThisMonthRaw.map((item) => item.categoryId)
  ]);

  const categories = categoryIds.size
    ? await prisma.category.findMany({
        where: {
          id: {
            in: [...categoryIds]
          }
        },
        select: {
          id: true,
          name: true,
          color: true
        }
      })
    : [];

  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  const demandsByCategory = demandsByCategoryRaw
    .map((item) => {
      const category = categoryMap.get(item.categoryId);

      if (!category) {
        return null;
      }

      return {
        categoryId: item.categoryId,
        name: category.name,
        color: category.color,
        total: item._count._all
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));

  const priorityOrder: DemandPriority[] = [
    DemandPriority.HIGH,
    DemandPriority.MEDIUM,
    DemandPriority.LOW
  ];

  const priorityLabel: Record<DemandPriority, string> = {
    HIGH: "Alta",
    MEDIUM: "Média",
    LOW: "Baixa"
  };

  const priorityColor: Record<DemandPriority, string> = {
    HIGH: "#e11d48",
    MEDIUM: "#d97706",
    LOW: "#475569"
  };

  const priorityCountMap = new Map(
    demandsByPriorityRaw.map((item) => [item.priority, item._count._all])
  );

  const demandsByPriority = priorityOrder.map((priority) => ({
    priority,
    label: priorityLabel[priority],
    color: priorityColor[priority],
    total: priorityCountMap.get(priority) ?? 0
  }));

  const topCategoriesThisMonth = topCategoriesThisMonthRaw
    .map((item) => {
      const category = categoryMap.get(item.categoryId);

      if (!category) {
        return null;
      }

      return {
        categoryId: item.categoryId,
        name: category.name,
        color: category.color,
        total: item._count._all
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    metrics: {
      totalConversations,
      openConversations,
      waitingHumanConversations,
      newDemands,
      inProgressDemands,
      resolvedDemands,
      criticalDemands,
      inboundMessagesLast7Days,
      averageResponseTimeMinutes: calculateAverageResponseTime(conversationResponseData)
    },
    demandsByCategory,
    demandsByPriority,
    summary: {
      topCategoriesThisMonth,
      oldestPendingDemands,
      latestConversations,
      latestDemands,
      topNeighborhoods: buildNeighborhoodRanking(demandDescriptions)
    }
  };
}
