import { ApiRouteError } from "@/lib/api";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type ProductionEnvItem = {
  key: string;
  required: boolean;
  configured: boolean;
  description: string;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || cfIp || "unknown";
}

export function assertRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return;
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new ApiRouteError(429, "Muitas tentativas. Aguarde antes de tentar novamente.", "RATE_LIMITED", {
      retryAfterSeconds
    });
  }

  current.count += 1;
}

export function redactPhone(value: string | null | undefined) {
  const digits = value?.replace(/[^\d]/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (digits.length <= 4) {
    return "*".repeat(digits.length);
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function redactIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 2)}...`;
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function configured(value: string | undefined | null) {
  return Boolean(value?.trim());
}

export function getProductionEnvChecklist(): ProductionEnvItem[] {
  return [
    {
      key: "DATABASE_URL",
      required: true,
      configured: configured(process.env.DATABASE_URL),
      description: "URL do PostgreSQL usado pelo Prisma."
    },
    {
      key: "DIRECT_URL",
      required: true,
      configured: configured(process.env.DIRECT_URL),
      description: "URL direta do PostgreSQL para migrations e operações administrativas."
    },
    {
      key: "JWT_SECRET",
      required: true,
      configured: configured(process.env.JWT_SECRET) || configured(process.env.AUTH_SECRET),
      description: "Segredo forte para assinar sessões JWT."
    },
    {
      key: "AUTH_SECRET",
      required: true,
      configured: configured(process.env.AUTH_SECRET) || configured(process.env.JWT_SECRET),
      description: "Segredo forte alternativo/compatível para autenticação."
    },
    {
      key: "APP_URL",
      required: true,
      configured: configured(process.env.APP_URL) || configured(process.env.NEXT_PUBLIC_APP_URL),
      description: "URL pública HTTPS usada no webhook da Meta."
    },
    {
      key: "REDIS_URL",
      required: true,
      configured: configured(process.env.REDIS_URL),
      description: "Redis para BullMQ em produção."
    },
    {
      key: "WHATSAPP_VERIFY_TOKEN",
      required: true,
      configured: configured(process.env.WHATSAPP_VERIFY_TOKEN),
      description: "Token de validação GET do webhook WhatsApp."
    },
    {
      key: "META_APP_SECRET",
      required: true,
      configured: configured(process.env.META_APP_SECRET),
      description: "App Secret da Meta para validar x-hub-signature-256."
    },
    {
      key: "WHATSAPP_ACCESS_TOKEN",
      required: true,
      configured: configured(process.env.WHATSAPP_ACCESS_TOKEN),
      description: "Token de acesso da WhatsApp Cloud API."
    },
    {
      key: "WHATSAPP_PHONE_NUMBER_ID",
      required: true,
      configured: configured(process.env.WHATSAPP_PHONE_NUMBER_ID),
      description: "ID do número oficial no WhatsApp Business Platform."
    },
    {
      key: "WHATSAPP_DRY_RUN",
      required: true,
      configured: configured(process.env.WHATSAPP_DRY_RUN),
      description: "Deve iniciar como true até homologação operacional."
    },
    {
      key: "WHATSAPP_MASS_CAMPAIGN_ENABLED",
      required: true,
      configured: configured(process.env.WHATSAPP_MASS_CAMPAIGN_ENABLED),
      description: "Flag explícita para liberar campanhas em massa controladas."
    },
    {
      key: "MAX_SENDS_PER_MINUTE",
      required: true,
      configured: configured(process.env.MAX_SENDS_PER_MINUTE),
      description: "Limite Redis de envios por minuto."
    },
    {
      key: "MAX_SENDS_PER_HOUR",
      required: true,
      configured: configured(process.env.MAX_SENDS_PER_HOUR),
      description: "Limite Redis de envios por hora."
    },
    {
      key: "MAX_SENDS_PER_DAY",
      required: true,
      configured: configured(process.env.MAX_SENDS_PER_DAY),
      description: "Limite Redis de envios por dia."
    },
    {
      key: "OPENAI_API_KEY",
      required: true,
      configured: configured(process.env.OPENAI_API_KEY),
      description: "Chave da OpenAI para o processamento assistido por IA."
    },
    {
      key: "NEXT_PUBLIC_DEMO_MODE",
      required: true,
      configured: process.env.NEXT_PUBLIC_DEMO_MODE === "false",
      description: "Em produção deve estar explicitamente false."
    }
  ];
}

export function assertProductionEnvReady() {
  if (!isProductionRuntime()) {
    return;
  }

  const missing = getProductionEnvChecklist().filter((item) => item.required && !item.configured);

  if (missing.length > 0) {
    throw new Error(
      `Variaveis obrigatorias ausentes para producao: ${missing.map((item) => item.key).join(", ")}`
    );
  }
}
