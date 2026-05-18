import { AIActionType } from "@prisma/client";

import { calculateRiskScore } from "@/lib/compliance";

type Intent = "GREETING" | "SUPPORT" | "URGENT" | "SENSITIVE" | "FOLLOW_UP" | "UNKNOWN";

type RouterInput = {
  message: string;
  recentMessages?: string[];
  metaWindowOpen: boolean;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function classifyIntent(message: string): Intent {
  const text = normalize(message);

  if (["oi", "ola", "bom dia", "boa tarde", "boa noite"].some((item) => text.includes(item))) {
    return "GREETING";
  }

  if (["urgente", "emergencia", "socorro", "risco"].some((item) => text.includes(item))) {
    return "URGENT";
  }

  if (["denuncia", "violencia", "ameaca", "abuso", "sigilo"].some((item) => text.includes(item))) {
    return "SENSITIVE";
  }

  if (["status", "retorno", "andamento", "protocolo"].some((item) => text.includes(item))) {
    return "FOLLOW_UP";
  }

  if (text.length > 0) {
    return "SUPPORT";
  }

  return "UNKNOWN";
}

export function detectSensitiveCase(message: string) {
  const intent = classifyIntent(message);
  return intent === "URGENT" || intent === "SENSITIVE";
}

export function shouldEscalate(message: string, metaWindowOpen: boolean, recentMessages: string[] = []) {
  const sensitive = detectSensitiveCase(message);
  const riskScore = calculateRiskScore(message, recentMessages, !metaWindowOpen);

  return sensitive || !metaWindowOpen || riskScore >= 60;
}

export function chooseBestAction(input: RouterInput) {
  const recentMessages = input.recentMessages ?? [];
  const intent = classifyIntent(input.message);
  const sensitive = detectSensitiveCase(input.message);
  const riskScore = calculateRiskScore(input.message, recentMessages, !input.metaWindowOpen);

  if (!input.metaWindowOpen) {
    return {
      intent,
      sensitive,
      riskScore,
      action: AIActionType.USE_TEMPLATE
    };
  }

  if (sensitive || riskScore >= 60) {
    return {
      intent,
      sensitive,
      riskScore,
      action: AIActionType.ESCALATE
    };
  }

  if (intent === "FOLLOW_UP") {
    return {
      intent,
      sensitive,
      riskScore,
      action: AIActionType.REQUEST_CONTEXT
    };
  }

  return {
    intent,
    sensitive,
    riskScore,
      action: AIActionType.RESPOND
  };
}
