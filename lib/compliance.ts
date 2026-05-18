import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ComplianceInput = {
  mandateId: string;
  conversationId?: string;
  messageId?: string;
  phone: string;
  message: string;
  metadata?: Record<string, unknown>;
  now?: Date;
};

type ComplianceResult = {
  allowed: boolean;
  riskScore: number;
  spamRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  actionTaken: "ALLOW" | "PACE" | "ESCALATE" | "BLOCK";
  cooldownMs: number;
};

const WINDOW_HOURS = 24;
const RATE_LIMIT_COUNT = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function hasRepeatedPunctuation(text: string) {
  return /(.)\1{5,}/.test(text) || /[!?]{4,}/.test(text);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toJson(value: Record<string, unknown> | undefined) {
  return value as Prisma.InputJsonValue | undefined;
}

export function detectLoopRisk(message: string, recentMessages: string[]) {
  const normalized = normalize(message);
  const repetitions = recentMessages.filter((item) => normalize(item) === normalized).length;
  return repetitions >= 2;
}

export function calculateRiskScore(message: string, recentMessages: string[], outsideWindow: boolean) {
  const normalized = normalize(message);
  let score = 10;

  if (normalized.length > 280) {
    score += 10;
  }

  if (hasRepeatedPunctuation(normalized)) {
    score += 18;
  }

  if (recentMessages.some((item) => normalize(item) === normalized)) {
    score += 25;
  }

  if (detectLoopRisk(message, recentMessages)) {
    score += 30;
  }

  if (recentMessages.length >= RATE_LIMIT_COUNT) {
    score += 22;
  }

  if (outsideWindow) {
    score += 35;
  }

  return clamp(score, 0, 100);
}

export function detectSpamRisk(message: string, recentMessages: string[], outsideWindow: boolean) {
  const riskScore = calculateRiskScore(message, recentMessages, outsideWindow);

  if (riskScore >= 80) {
    return { riskScore, spamRisk: "CRITICAL" as const };
  }

  if (riskScore >= 60) {
    return { riskScore, spamRisk: "HIGH" as const };
  }

  if (riskScore >= 35) {
    return { riskScore, spamRisk: "MEDIUM" as const };
  }

  return { riskScore, spamRisk: "LOW" as const };
}

export function validateConversationWindow(lastInboundAt: Date | null, now = new Date()) {
  if (!lastInboundAt) {
    return {
      metaWindowOpen: false,
      conversationWindowExpiresAt: null
    };
  }

  const expiresAt = new Date(lastInboundAt.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  return {
    metaWindowOpen: expiresAt.getTime() > now.getTime(),
    conversationWindowExpiresAt: expiresAt
  };
}

export function enforceRateLimit(lastOutboundAt: Date | null, now = new Date()) {
  if (!lastOutboundAt) {
    return { allowed: true, cooldownMs: 0 };
  }

  const diff = now.getTime() - lastOutboundAt.getTime();
  const cooldownMs = Math.max(0, RATE_LIMIT_WINDOW_MS - diff);

  return {
    allowed: cooldownMs === 0,
    cooldownMs
  };
}

export async function canSendMessage(input: ComplianceInput): Promise<ComplianceResult> {
  const now = input.now ?? new Date();

  const recentMessages = input.conversationId
    ? await prisma.message.findMany({
        where: {
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          createdAt: {
            gte: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS)
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: RATE_LIMIT_COUNT
      })
    : [];

  const lastInbound = input.conversationId
    ? await prisma.message.findFirst({
        where: {
          conversationId: input.conversationId,
          direction: "INBOUND"
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    : null;

  const lastOutbound = recentMessages[0] ?? null;
  const windowState = validateConversationWindow(lastInbound?.createdAt ?? null, now);
  const rateLimit = enforceRateLimit(lastOutbound?.createdAt ?? null, now);
  const spam = detectSpamRisk(
    input.message,
    recentMessages.map((item) => item.content),
    !windowState.metaWindowOpen
  );

  let allowed = true;
  let reason = "Mensagem liberada para envio supervisionado.";
  let actionTaken: ComplianceResult["actionTaken"] = "ALLOW";

  if (!windowState.metaWindowOpen) {
    allowed = false;
    reason = "Janela de 24 horas da Meta encerrada.";
    actionTaken = "BLOCK";
  } else if (!rateLimit.allowed) {
    allowed = false;
    reason = "Cooldown operacional ativo para evitar flood.";
    actionTaken = "PACE";
  } else if (spam.spamRisk === "CRITICAL" || spam.spamRisk === "HIGH") {
    allowed = false;
    reason = "Risco operacional elevado detectado pelo compliance.";
    actionTaken = "ESCALATE";
  }

  await prisma.complianceLog.create({
    data: {
      mandateId: input.mandateId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      riskScore: spam.riskScore,
      spamRisk: spam.spamRisk,
      reason,
      actionTaken,
      metadata: toJson(input.metadata)
    }
  });

  if (input.conversationId) {
    await prisma.conversation.update({
      where: {
        id: input.conversationId
      },
      data: {
        riskScore: spam.riskScore,
        spamRisk: spam.spamRisk,
        lastComplianceCheckAt: now
      }
    });
  }

  return {
    allowed,
    riskScore: spam.riskScore,
    spamRisk: spam.spamRisk,
    reason,
    actionTaken,
    cooldownMs: rateLimit.cooldownMs
  };
}
