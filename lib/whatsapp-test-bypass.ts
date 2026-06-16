import { Role } from "@prisma/client";

import type { AuthenticatedUser } from "@/lib/auth";

type WhatsAppTestBypassInput = {
  user: Pick<AuthenticatedUser, "role">;
  to: string;
};

type WhatsAppTestBypassResult = {
  allowed: boolean;
  reason: string;
};

export function normalizeWhatsAppTestPhone(value: string) {
  return value.replace(/[\s+()-]/g, "");
}

function getAllowedNumbers() {
  return (process.env.WHATSAPP_TEST_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((value) => normalizeWhatsAppTestPhone(value.trim()))
    .filter(Boolean);
}

export function isWhatsAppTestBypassAllowed(input: WhatsAppTestBypassInput): WhatsAppTestBypassResult {
  if (process.env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Bypass de teste indisponível em produção."
    };
  }

  if (process.env.WHATSAPP_TEST_BYPASS_SEND_GATE !== "true") {
    return {
      allowed: false,
      reason: "WHATSAPP_TEST_BYPASS_SEND_GATE não está habilitado."
    };
  }

  if (input.user.role !== Role.ADMIN) {
    return {
      allowed: false,
      reason: "Usuário autenticado não é ADMIN."
    };
  }

  const normalizedTo = normalizeWhatsAppTestPhone(input.to);
  const allowedNumbers = getAllowedNumbers();

  if (!normalizedTo || !allowedNumbers.includes(normalizedTo)) {
    return {
      allowed: false,
      reason: "Número destino não está em WHATSAPP_TEST_ALLOWED_NUMBERS."
    };
  }

  return {
    allowed: true,
    reason: "Teste real controlado autorizado."
  };
}
