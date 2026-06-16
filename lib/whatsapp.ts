import {
  TEMPLATE_NOT_APPROVED,
  validateApprovedTemplateForRealSend,
} from "@/lib/whatsapp/templates";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
        }>;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        statuses?: Array<{
          id?: string;
          status?: "sent" | "delivered" | "read" | "failed";
          timestamp?: string;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
          }>;
        }>;
      };
    }>;
  }>;
};

export type ParsedWhatsAppMessage = {
  externalMessageId: string;
  fromPhone: string;
  profileName: string | null;
  text: string;
  timestamp: Date;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export type ParsedWhatsAppStatus = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  failureReason: string | null;
};

const DEFAULT_WHATSAPP_GRAPH_VERSION = "v23.0";

function getWhatsAppGraphVersion() {
  return process.env.WHATSAPP_API_VERSION?.trim() || DEFAULT_WHATSAPP_GRAPH_VERSION;
}

export function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.WHATSAPP_TOKEN?.trim() || null;
}

const PERMANENT_META_ERROR_CODES = new Set([
  100,
  131026,
  131047,
  132000,
  132001,
  132005,
  132007,
  132012,
  132015,
  133010
]);

export class WhatsAppApiError extends Error {
  code: number | null;
  status: number;
  retryable: boolean;
  details: unknown;

  constructor(message: string, input: { code?: number | null; status: number; retryable: boolean; details?: unknown }) {
    super(message);
    this.name = "WhatsAppApiError";
    this.code = input.code ?? null;
    this.status = input.status;
    this.retryable = input.retryable;
    this.details = input.details ?? null;
  }
}

export function isPermanentMetaError(input: { status: number; code?: number | null }) {
  if (input.code && PERMANENT_META_ERROR_CODES.has(input.code)) {
    return true;
  }

  if (input.status === 429 || input.status >= 500) {
    return false;
  }

  return input.status >= 400 && input.status < 500;
}

export function maskSecret(value: string | undefined | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "Ausente";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 1)}••••${trimmed.slice(-1)}`;
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function redactPhone(phone: string) {
  if (phone.length <= 4) {
    return phone;
  }

  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

function getWhatsAppConfig() {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Configuração do WhatsApp ausente: defina WHATSAPP_TOKEN ou WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
    );
  }

  return { accessToken, phoneNumberId, apiVersion: getWhatsAppGraphVersion() };
}

export function getWhatsAppCredentialSummary() {
  return {
    accessToken: maskSecret(getWhatsAppAccessToken()),
    phoneNumberId: maskSecret(process.env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: maskSecret(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    apiVersion: getWhatsAppGraphVersion(),
    verifyToken: maskSecret(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: maskSecret(process.env.META_APP_SECRET),
    testRecipient: maskSecret(process.env.WHATSAPP_TEST_RECIPIENT_PHONE)
  };
}

export function logWhatsAppEvent(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(`[whatsapp:${event}]`, details);
}

type GraphError = {
  message?: string;
  code?: number;
  type?: string;
  error_subcode?: number;
  fbtrace_id?: string;
};

type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: unknown;
};

export type MetaWhatsAppTemplate = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: MetaTemplateComponent[];
};

export type WhatsAppTemplateComponentPayload = {
  type: "body";
  parameters: Array<{
    type: "text";
    text: string;
  }>;
};

const VALID_META_TEMPLATE_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);

function classifyGraphError(status: number, error?: GraphError | null) {
  if (status === 401 || error?.code === 190) {
    return "TOKEN_INVALID";
  }

  if (status === 400 || status === 404) {
    return "PHONE_ID_INVALID";
  }

  return "META_GRAPH_ERROR";
}

function getBodyVariableNames(text: string) {
  return Array.from(text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)).map((match) => match[1]);
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function resolveTemplateVariableValue(variable: string, contact?: { name?: string | null }) {
  const normalized = variable.toLowerCase();
  const name = contact?.name?.trim() || "Contato";

  if (normalized === "name" || normalized === "nome" || normalized === "1") {
    return name;
  }

  if (normalized === "firstname" || normalized === "first_name" || normalized === "primeironome") {
    return firstNameOf(name);
  }

  return name;
}

function countTemplateComponentVariables(template: MetaWhatsAppTemplate) {
  const body = template.components?.find((component) => component.type?.toUpperCase() === "BODY");
  return body?.text ? getBodyVariableNames(body.text).length : 0;
}

function getUnsupportedVariableComponents(template: MetaWhatsAppTemplate) {
  return (template.components ?? [])
    .filter((component) => component.type?.toUpperCase() !== "BODY")
    .map((component) => ({
      type: component.type ?? null,
      format: component.format ?? null,
      variableCount: component.text ? getBodyVariableNames(component.text).length : 0
    }))
    .filter((component) => component.variableCount > 0);
}

function toApprovedTemplateSummary(template: MetaWhatsAppTemplate) {
  const bodyVariableCount = countTemplateComponentVariables(template);
  const unsupportedVariableComponents = getUnsupportedVariableComponents(template);

  return {
    id: template.id ?? null,
    name: template.name ?? null,
    language: template.language ?? null,
    status: template.status ?? null,
    category: template.category ?? null,
    variableCount:
      bodyVariableCount +
      unsupportedVariableComponents.reduce((total, component) => total + component.variableCount, 0),
    bodyVariableCount,
    unsupportedVariableComponents,
    components: template.components ?? []
  };
}

export function buildWhatsAppTemplateComponents(input: {
  localBody: string;
  metaTemplate?: MetaWhatsAppTemplate | null;
  contact?: { name?: string | null };
}): WhatsAppTemplateComponentPayload[] | undefined {
  const requiredCount = input.metaTemplate ? countTemplateComponentVariables(input.metaTemplate) : 0;

  if (requiredCount <= 0) {
    return undefined;
  }

  const localVariables = getBodyVariableNames(input.localBody);
  const values = Array.from({ length: requiredCount }, (_, index) =>
    resolveTemplateVariableValue(localVariables[index] ?? String(index + 1), input.contact)
  );

  return [
    {
      type: "body",
      parameters: values.map((text) => ({
        type: "text",
        text
      }))
    }
  ];
}

export function validateWhatsAppTemplateComponents(input: {
  localBody: string;
  metaTemplate: MetaWhatsAppTemplate;
}) {
  const requiredCount = countTemplateComponentVariables(input.metaTemplate);
  const localVariables = getBodyVariableNames(input.localBody);
  const unsupportedVariableComponents = getUnsupportedVariableComponents(input.metaTemplate);

  if (unsupportedVariableComponents.length > 0) {
    return {
      valid: false,
      requiredCount,
      providedCount: localVariables.length,
      unsupportedVariableComponents,
      reason: "Template tem variáveis fora do BODY; cadastre um mapeamento de components antes do envio."
    };
  }

  if (requiredCount > localVariables.length) {
    return {
      valid: false,
      requiredCount,
      providedCount: localVariables.length,
      unsupportedVariableComponents,
      reason: `Template exige ${requiredCount} variável(is) de BODY, mas o corpo local mapeia ${localVariables.length}.`
    };
  }

  return {
    valid: true,
    requiredCount,
    providedCount: requiredCount,
    unsupportedVariableComponents,
    reason: null
  };
}

function getLikelyTemplateInvalidReason(input: {
  templateName: string;
  language: string;
  availableApprovedTemplates: MetaWhatsAppTemplate[];
  matchingByName: MetaWhatsAppTemplate[];
}) {
  if (input.matchingByName.length === 0) {
    return "Nome do template não existe no WABA configurado.";
  }

  if (!input.matchingByName.some((template) => template.language === input.language)) {
    return "Template existe no WABA, mas não no idioma cadastrado.";
  }

  if (!input.matchingByName.some((template) => template.status === "APPROVED")) {
    return "Template existe no WABA/idioma informado, mas não está APPROVED.";
  }

  if (input.availableApprovedTemplates.length === 0) {
    return "Nenhum template APPROVED foi retornado pelo WABA configurado.";
  }

  return "Template não corresponde exatamente a nome, idioma, status e categoria esperados.";
}

export async function fetchMetaWhatsAppTemplates(input?: {
  status?: "APPROVED";
  name?: string;
}) {
  const accessToken = getWhatsAppAccessToken();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const apiVersion = getWhatsAppGraphVersion();

  if (!accessToken || !businessAccountId) {
    throw new WhatsAppApiError("Configuração Meta ausente para listar templates.", {
      status: 409,
      retryable: false,
      details: {
        missing: [
          ...(!accessToken ? ["WHATSAPP_TOKEN"] : []),
          ...(!businessAccountId ? ["WHATSAPP_BUSINESS_ACCOUNT_ID"] : [])
        ]
      }
    });
  }

  const templates: MetaWhatsAppTemplate[] = [];
  const params = new URLSearchParams({
    fields: "id,name,language,status,category,components",
    limit: "100"
  });

  if (input?.name) {
    params.set("name", input.name);
  }

  let nextUrl: string | null =
    `https://graph.facebook.com/${apiVersion}/${businessAccountId}/message_templates?${params.toString()}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    const data = (await response.json().catch(() => null)) as
      | {
          data?: MetaWhatsAppTemplate[];
          paging?: { next?: string };
          error?: GraphError;
        }
      | null;

    if (!response.ok) {
      throw new WhatsAppApiError(
        data?.error?.message ?? "Falha ao listar templates do WhatsApp Business Account.",
        {
          status: response.status,
          code: data?.error?.code ?? null,
          retryable: !isPermanentMetaError({ status: response.status, code: data?.error?.code ?? null }),
          details: data?.error ?? null
        }
      );
    }

    templates.push(...(data?.data ?? []));
    nextUrl = data?.paging?.next ?? null;
  }

  return input?.status ? templates.filter((template) => template.status === input.status) : templates;
}

export async function listApprovedMetaWhatsAppTemplates() {
  const templates = await fetchMetaWhatsAppTemplates({ status: "APPROVED" });

  return templates.map(toApprovedTemplateSummary);
}

export async function validateMetaWhatsAppTemplate(input: {
  templateName: string;
  language: string;
  category?: string | null;
  localBody?: string | null;
}) {
  const allTemplates = await fetchMetaWhatsAppTemplates({ name: input.templateName });
  const approvedTemplates = await fetchMetaWhatsAppTemplates({ status: "APPROVED" });
  const matchingByName = allTemplates.filter((template) => template.name === input.templateName);
  const matchingTemplate =
    matchingByName.find(
      (template) =>
        template.language === input.language &&
        template.status === "APPROVED" &&
        (!input.category || template.category === input.category)
    ) ?? null;
  const approvedSummaries = approvedTemplates.map(toApprovedTemplateSummary);
  const details = {
    templateUsed: {
      name: input.templateName,
      language: input.language,
      category: input.category ?? null
    },
    availableApprovedTemplates: approvedSummaries,
    matchingTemplates: matchingByName.map(toApprovedTemplateSummary),
    probableReason: getLikelyTemplateInvalidReason({
      templateName: input.templateName,
      language: input.language,
      availableApprovedTemplates: approvedTemplates,
      matchingByName
    })
  };

  if (input.category && !VALID_META_TEMPLATE_CATEGORIES.has(input.category)) {
    return {
      ok: false as const,
      status: "TEMPLATE_INVALID" as const,
      details: {
        ...details,
        probableReason: "Categoria local inválida para WhatsApp Cloud API."
      }
    };
  }

  if (!matchingTemplate) {
    return {
      ok: false as const,
      status: "TEMPLATE_INVALID" as const,
      details
    };
  }

  if (input.localBody) {
    const componentValidation = validateWhatsAppTemplateComponents({
      localBody: input.localBody,
      metaTemplate: matchingTemplate
    });

    if (!componentValidation.valid) {
      return {
        ok: false as const,
        status: "TEMPLATE_INVALID" as const,
        details: {
          ...details,
          metaTemplate: toApprovedTemplateSummary(matchingTemplate),
          componentsValidation: componentValidation,
          probableReason: componentValidation.reason
        }
      };
    }
  }

  return {
    ok: true as const,
    status: "OK" as const,
    metaTemplate: matchingTemplate,
    details: {
      ...details,
      metaTemplate: toApprovedTemplateSummary(matchingTemplate),
      componentsValidation: input.localBody
        ? validateWhatsAppTemplateComponents({
            localBody: input.localBody,
            metaTemplate: matchingTemplate
          })
        : null
    }
  };
}

export async function getWhatsAppHealthCheck(input?: {
  templateName?: string | null;
  language?: string | null;
  category?: string | null;
  localBody?: string | null;
}) {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const configuredApiVersion = process.env.WHATSAPP_API_VERSION?.trim();
  const apiVersion = getWhatsAppGraphVersion();
  const dryRun = process.env.WHATSAPP_DRY_RUN?.trim().toLowerCase() === "true";
  const missingCore = [
    ["WHATSAPP_TOKEN", accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", phoneNumberId],
    ["WHATSAPP_API_VERSION", configuredApiVersion]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const missing = [
    ...missingCore,
    ...(!businessAccountId ? ["WHATSAPP_BUSINESS_ACCOUNT_ID"] : [])
  ];

  if (dryRun) {
    return {
      ok: false,
      status: "DRY_RUN_ENABLED" as const,
      dryRun,
      missing,
      apiVersion,
      credentials: getWhatsAppCredentialSummary(),
      message: "WHATSAPP_DRY_RUN=true bloqueia envio real."
    };
  }

  if (missingCore.length > 0) {
    return {
      ok: false,
      status: "CONFIG_MISSING" as const,
      dryRun,
      missing: missingCore,
      apiVersion,
      credentials: getWhatsAppCredentialSummary(),
      message: `Configuração Meta ausente: ${missingCore.join(", ")}.`
    };
  }

  let phoneResponse: Response;
  try {
    phoneResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    return {
      ok: false,
      status: "META_GRAPH_UNREACHABLE" as const,
      dryRun,
      missing,
      apiVersion,
      credentials: getWhatsAppCredentialSummary(),
      message: error instanceof Error ? error.message : "Graph API indisponível."
    };
  }
  const phoneData = (await phoneResponse.json().catch(() => null)) as
    | {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        platform_type?: string;
        error?: GraphError;
      }
    | null;

  if (!phoneResponse.ok) {
    const status = classifyGraphError(phoneResponse.status, phoneData?.error);
    logWhatsAppEvent("warn", "connection_test_failed", {
      status: phoneResponse.status,
      code: phoneData?.error?.code ?? null,
      errorSubcode: phoneData?.error?.error_subcode ?? null,
      fbtraceId: phoneData?.error?.fbtrace_id ?? null,
      healthStatus: status
    });

    return {
      ok: false,
      status,
      dryRun,
      missing,
      apiVersion,
      credentials: getWhatsAppCredentialSummary(),
      meta: {
        httpStatus: phoneResponse.status,
        code: phoneData?.error?.code ?? null,
        errorSubcode: phoneData?.error?.error_subcode ?? null,
        message: phoneData?.error?.message ?? "Falha ao validar phone_number_id.",
        fbtraceId: phoneData?.error?.fbtrace_id ?? null
      }
    };
  }

  if (!businessAccountId) {
    return {
      ok: false,
      status: "CONFIG_MISSING" as const,
      dryRun,
      missing,
      apiVersion,
      credentials: getWhatsAppCredentialSummary(),
      connection: {
        id: phoneData?.id ?? phoneNumberId,
        displayPhoneNumber: phoneData?.display_phone_number ?? null,
        verifiedName: phoneData?.verified_name ?? null,
        qualityRating: phoneData?.quality_rating ?? null,
        platformType: phoneData?.platform_type ?? null
      },
      message: "Configuração Meta ausente: WHATSAPP_BUSINESS_ACCOUNT_ID."
    };
  }

  let template: unknown = null;
  let approvedTemplates: unknown[] = [];
  if (input?.templateName && input.language) {
    try {
      const validation = await validateMetaWhatsAppTemplate({
        templateName: input.templateName,
        language: input.language,
        category: input.category,
        localBody: input.localBody
      });
      approvedTemplates = validation.details.availableApprovedTemplates;

      if (!validation.ok) {
        return {
          ok: false,
          status: "TEMPLATE_INVALID" as const,
          dryRun,
          missing,
          apiVersion,
          credentials: getWhatsAppCredentialSummary(),
          template: {
            name: input.templateName,
            language: input.language,
            matched: false
          },
          approvedTemplates,
          message: "Template não encontrado como APPROVED no WABA/idioma/categoria configurados.",
          details: validation.details
        };
      }

      template = validation.details.metaTemplate;
    } catch (error) {
      const metaError = error instanceof WhatsAppApiError ? error : null;
      return {
        ok: false,
        status: metaError ? "BUSINESS_ACCOUNT_INVALID" as const : "META_GRAPH_UNREACHABLE" as const,
        dryRun,
        missing,
        apiVersion,
        credentials: getWhatsAppCredentialSummary(),
        meta: {
          httpStatus: metaError?.status ?? null,
          code: metaError?.code ?? null,
          message: error instanceof Error ? error.message : "Falha ao validar business_account_id."
        }
      };
    }
  } else if (businessAccountId) {
    approvedTemplates = await listApprovedMetaWhatsAppTemplates().catch(() => []);
  }

  logWhatsAppEvent("info", "connection_test_ok", {
    phoneNumberId: maskSecret(phoneNumberId),
    businessAccountId: maskSecret(businessAccountId),
    apiVersion,
    quality: phoneData?.quality_rating ?? null
  });

  return {
    ok: true,
    status: "OK" as const,
    dryRun,
    missing,
    apiVersion,
    credentials: getWhatsAppCredentialSummary(),
    connection: {
      id: phoneData?.id ?? phoneNumberId,
      displayPhoneNumber: phoneData?.display_phone_number ?? null,
      verifiedName: phoneData?.verified_name ?? null,
      qualityRating: phoneData?.quality_rating ?? null,
      platformType: phoneData?.platform_type ?? null
    },
    template,
    approvedTemplates
  };
}

export function parseWebhookMessage(payload: WhatsAppWebhookPayload): ParsedWhatsAppMessage[] {
  const parsedMessages: ParsedWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const contacts = change.value?.contacts ?? [];
      const messages = change.value?.messages ?? [];
      const profileName = contacts[0]?.profile?.name ?? null;
      const fallbackPhone = contacts[0]?.wa_id ?? null;
      const phoneNumberId = change.value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = change.value?.metadata?.display_phone_number ?? null;

      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body || !message.id) {
          continue;
        }

        const fromPhone = message.from ?? fallbackPhone;

        if (!fromPhone) {
          continue;
        }

        parsedMessages.push({
          externalMessageId: message.id,
          fromPhone,
          profileName,
          text: message.text.body.trim(),
          timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : new Date(),
          phoneNumberId,
          displayPhoneNumber
        });
      }
    }
  }

  return parsedMessages;
}

export function parseWebhookStatuses(payload: WhatsAppWebhookPayload): ParsedWhatsAppStatus[] {
  const parsedStatuses: ParsedWhatsAppStatus[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) {
          continue;
        }

        parsedStatuses.push({
          providerMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
          failureReason:
            status.errors?.map((item) => item.message || item.title).filter(Boolean).join(" | ") ||
            null
        });
      }
    }
  }

  return parsedStatuses;
}

export async function testWhatsAppConnection() {
  const health = await getWhatsAppHealthCheck();

  if (!health.ok) {
    throw new Error(
      "meta" in health && health.meta && typeof health.meta === "object" && "message" in health.meta
        ? String(health.meta.message)
        : health.message ?? "Falha ao validar conexão com a Meta."
    );
  }

  return health.connection;
}

export async function assertWhatsAppReadyForRealSend(input?: {
  templateName?: string | null;
  language?: string | null;
  category?: string | null;
  localBody?: string | null;
}) {
  const health = await getWhatsAppHealthCheck(input);

  if (!health.ok) {
    const meta =
      "meta" in health && health.meta && typeof health.meta === "object"
        ? health.meta
        : null;
    const message =
      meta && "message" in meta
        ? String(meta.message)
        : "message" in health && health.message
          ? health.message
          : `WhatsApp indisponível: ${health.status}`;

    throw new WhatsAppApiError(message, {
      status:
        meta && "httpStatus" in meta && typeof meta.httpStatus === "number"
          ? meta.httpStatus
          : 409,
      code:
        meta && "code" in meta && typeof meta.code === "number"
          ? meta.code
          : null,
      retryable: false,
      details: health
    });
  }

  return health;
}

export async function testLegacyWhatsAppConnection() {
  const { accessToken, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        platform_type?: string;
        error?: { message?: string; code?: number };
      }
    | null;

  if (!response.ok) {
    logWhatsAppEvent("warn", "connection_test_failed", {
      status: response.status,
      code: data?.error?.code ?? null
    });
    throw new Error(data?.error?.message ?? "Falha ao validar conexão com a Meta.");
  }

  logWhatsAppEvent("info", "connection_test_ok", {
    phoneNumberId: maskSecret(phoneNumberId),
    quality: data?.quality_rating ?? null
  });

  return {
    id: data?.id ?? phoneNumberId,
    displayPhoneNumber: data?.display_phone_number ?? null,
    verifiedName: data?.verified_name ?? null,
    qualityRating: data?.quality_rating ?? null,
    platformType: data?.platform_type ?? null
  };
}

export async function sendWhatsAppTemplateRequest(input: {
  phone: string;
  templateName: string;
  language: string;
  components?: WhatsAppTemplateComponentPayload[];
}) {
  const templateValidation = validateApprovedTemplateForRealSend(input.templateName);

  if (!templateValidation.allowed) {
    throw new WhatsAppApiError(templateValidation.message ?? "Template não aprovado na Meta.", {
      status: 400,
      retryable: false,
      details: {
        code: TEMPLATE_NOT_APPROVED,
        templateName: input.templateName,
        suggestion: "Use hello_world em ambiente de teste.",
      },
    });
  }

  const { accessToken, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.phone,
    type: "template",
    template: {
      name: input.templateName,
      language: {
        code: input.language
      },
      ...(input.components?.length ? { components: input.components } : {})
    }
  };

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  logWhatsAppEvent("info", "send:request", {
    phone: redactPhone(input.phone),
    templateName: input.templateName,
    language: input.language,
    componentsCount: input.components?.length ?? 0,
    phoneNumberId: maskSecret(phoneNumberId),
    apiVersion,
    payload: {
      ...payload,
      to: redactPhone(input.phone)
    }
  });

  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: GraphError;
      }
    | null;

  if (!response.ok) {
    const code = data?.error?.code ?? null;
    const permanent = isPermanentMetaError({
      status: response.status,
      code
    });

    logWhatsAppEvent("error", "send:failed", {
      status: response.status,
      phone: redactPhone(input.phone),
      code,
      errorSubcode: data?.error?.error_subcode ?? null,
      fbtraceId: data?.error?.fbtrace_id ?? null,
      retryable: !permanent,
      message: data?.error?.message ?? null
    });
    throw new WhatsAppApiError(data?.error?.message ?? "Falha ao enviar template pelo WhatsApp.", {
      status: response.status,
      code,
      retryable: !permanent,
      details: data?.error ?? null
    });
  }

  const providerMessageId = data?.messages?.[0]?.id ?? null;

  logWhatsAppEvent("info", "send:success", {
    phone: redactPhone(input.phone),
    providerMessageId,
    status: response.status
  });

  return {
    providerMessageId,
    response: data
  };
}

export async function sendWhatsAppMessage(phone: string, text: string) {
  const { accessToken, phoneNumberId, apiVersion } = getWhatsAppConfig();

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          body: text,
          preview_url: false
        }
      })
    }
  );

  const data = (await response.json().catch(() => null)) as
    | {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      }
    | null;

  if (!response.ok) {
    const code = data?.error?.code ?? null;
    const permanent = isPermanentMetaError({
      status: response.status,
      code
    });

    logWhatsAppEvent("error", "send_failed", {
      status: response.status,
      phone: redactPhone(phone),
      code,
      retryable: !permanent
    });
    throw new WhatsAppApiError(data?.error?.message ?? "Falha ao enviar mensagem pelo WhatsApp.", {
      status: response.status,
      code,
      retryable: !permanent
    });
  }

  const externalMessageId = data?.messages?.[0]?.id ?? null;

  logWhatsAppEvent("info", "message_sent", {
    phone: redactPhone(phone),
    externalMessageId
  });

  return {
    externalMessageId,
    providerMessageId: externalMessageId
  };
}
