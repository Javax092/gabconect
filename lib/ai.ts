import { z } from "zod";

import type { Category, Citizen, Conversation, Mandate, Message } from "@prisma/client";

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const actionSchema = z.enum(["AUTO_REPLY", "ASK_CONTEXT", "ESCALATE_HUMAN", "IGNORE", "USE_TEMPLATE"]);
const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const aiResponseSchema = z.object({
  action: actionSchema,
  reply: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sensitive: z.boolean(),
  riskLevel: riskLevelSchema,
  shouldCreateDemand: z.boolean(),
  demandTitle: z.string().nullable(),
  demandDescription: z.string().nullable(),
  categorySuggestion: z.string().nullable(),
  priority: prioritySchema,
  requiresHuman: z.boolean()
});

export type ProcessCitizenMessageResult = z.infer<typeof aiResponseSchema>;

type ProcessCitizenMessageParams = {
  mandate: Pick<Mandate, "name" | "politicianName" | "city" | "state" | "aiPrompt"> & {
    categories?: Pick<Category, "name">[];
  };
  citizen: Pick<Citizen, "name" | "phone">;
  conversationHistory: Array<
    Pick<Message, "direction" | "content" | "createdAt"> | Pick<Conversation, "createdAt">
  >;
  message: string;
};

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function extractOutputText(response: unknown) {
  if (!response || typeof response !== "object") {
    return "";
  }

  const output = Reflect.get(response, "output");

  if (!Array.isArray(output)) {
    return "";
  }

  const texts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Reflect.get(item, "content");

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        Reflect.get(part, "type") === "output_text" &&
        typeof Reflect.get(part, "text") === "string"
      ) {
        texts.push(Reflect.get(part, "text") as string);
      }
    }
  }

  return texts.join("\n").trim();
}

function buildHistory(history: ProcessCitizenMessageParams["conversationHistory"]) {
  return history
    .map((item) => {
      if ("direction" in item) {
        return `${item.direction === "INBOUND" ? "CIDADÃO" : "GABINETE"}: ${item.content}`;
      }

      return `CONVERSA_INICIADA: ${item.createdAt.toISOString()}`;
    })
    .join("\n");
}

function fallbackCategorySuggestion(message: string) {
  const normalized = normalizeText(message);

  if (
    normalized.includes("buraco") ||
    normalized.includes("asfalto") ||
    normalized.includes("iluminacao") ||
    normalized.includes("poste") ||
    normalized.includes("limpeza") ||
    normalized.includes("lixo")
  ) {
    return "Infraestrutura";
  }

  if (
    normalized.includes("posto") ||
    normalized.includes("hospital") ||
    normalized.includes("consulta") ||
    normalized.includes("exame") ||
    normalized.includes("remedio") ||
    normalized.includes("saude") ||
    normalized.includes("vacina")
  ) {
    return "Saúde";
  }

  if (
    normalized.includes("escola") ||
    normalized.includes("creche") ||
    normalized.includes("professor") ||
    normalized.includes("merenda")
  ) {
    return "Educação";
  }

  if (
    normalized.includes("onibus") ||
    normalized.includes("transporte") ||
    normalized.includes("lotacao") ||
    normalized.includes("terminal")
  ) {
    return "Transporte";
  }

  if (
    normalized.includes("seguranca") ||
    normalized.includes("roubo") ||
    normalized.includes("violencia") ||
    normalized.includes("ameaça") ||
    normalized.includes("ameaca") ||
    normalized.includes("agress") ||
    normalized.includes("denuncia")
  ) {
    return "Segurança";
  }

  if (
    normalized.includes("cadunico") ||
    normalized.includes("cadunico") ||
    normalized.includes("assistencia") ||
    normalized.includes("beneficio") ||
    normalized.includes("cesta basica") ||
    normalized.includes("bolsa")
  ) {
    return "Assistência Social";
  }

  return null;
}

function detectRequiresHuman(message: string) {
  const normalized = normalizeText(message);

  return [
    "amea",
    "violencia",
    "agress",
    "urgente",
    "emergencia",
    "emergência",
    "denuncia",
    "corrup",
    "abuso",
    "risco",
    "morte",
    "suic"
  ].some((term) => normalized.includes(term));
}

function detectGenericGreeting(message: string) {
  const normalized = normalizeText(message).trim();

  return [
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "ok",
    "obrigado",
    "obrigada"
  ].includes(normalized);
}

function inferPriority(message: string, requiresHuman: boolean): "LOW" | "MEDIUM" | "HIGH" {
  const normalized = normalizeText(message);

  if (
    requiresHuman ||
    normalized.includes("urgente") ||
    normalized.includes("sem atendimento") ||
    normalized.includes("perigo") ||
    normalized.includes("risco")
  ) {
    return "HIGH";
  }

  if (
    normalized.includes("semana") ||
    normalized.includes("mes") ||
    normalized.includes("mês") ||
    normalized.includes("ha dias") ||
    normalized.includes("faz dias")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function fallbackProcessCitizenMessage(params: ProcessCitizenMessageParams): ProcessCitizenMessageResult {
  const text = params.message.trim();
  const requiresHuman = detectRequiresHuman(text);
  const categorySuggestion = fallbackCategorySuggestion(text);
  const genericGreeting = detectGenericGreeting(text);
  const shouldCreateDemand = !genericGreeting && Boolean(categorySuggestion);
  const priority = inferPriority(text, requiresHuman);

  if (genericGreeting) {
    return {
      action: "ASK_CONTEXT",
      reply:
        `Olá, ${params.citizen.name}. Sou a assistente de atendimento do ${params.mandate.name}. ` +
        "Posso registrar o contexto inicial e encaminhar sua solicitação para a equipe. Conte o que está acontecendo.",
      reason: "Saudação inicial sem contexto operacional suficiente.",
      confidence: 0.92,
      sensitive: false,
      riskLevel: "LOW",
      shouldCreateDemand: false,
      demandTitle: null,
      demandDescription: null,
      categorySuggestion: null,
      priority: "LOW",
      requiresHuman: false
    };
  }

  if (shouldCreateDemand && categorySuggestion) {
    return {
      action: requiresHuman ? "ESCALATE_HUMAN" : "AUTO_REPLY",
      reply:
        `Recebemos sua mensagem, ${params.citizen.name}. Vamos registrar essa solicitação e encaminhar ` +
        "para análise da equipe responsável. Se puder, informe endereço, ponto de referência ou outros detalhes que ajudem no atendimento.",
      reason: requiresHuman
        ? "Tema sensível identificado; contexto será preservado para humano."
        : "Solicitação classificável com resposta assistiva curta.",
      confidence: requiresHuman ? 0.78 : 0.88,
      sensitive: requiresHuman,
      riskLevel: requiresHuman ? "HIGH" : priority === "MEDIUM" ? "MEDIUM" : "LOW",
      shouldCreateDemand: true,
      demandTitle: `${categorySuggestion}: solicitação de ${params.citizen.name}`,
      demandDescription: text,
      categorySuggestion,
      priority,
      requiresHuman
    };
  }

  return {
    action: requiresHuman ? "ESCALATE_HUMAN" : "ASK_CONTEXT",
    reply:
      `Recebemos sua mensagem, ${params.citizen.name}. Para orientar melhor, envie mais detalhes sobre a situação, ` +
      "como local, data, órgão envolvido e o que você precisa que seja verificado pela equipe.",
    reason: requiresHuman
      ? "Caso potencialmente sensível sem contexto suficiente."
      : "Mensagem insuficiente para decisão segura.",
    confidence: requiresHuman ? 0.74 : 0.83,
    sensitive: requiresHuman,
    riskLevel: requiresHuman ? "HIGH" : "MEDIUM",
    shouldCreateDemand: false,
    demandTitle: null,
    demandDescription: null,
    categorySuggestion: categorySuggestion ?? null,
    priority: "LOW",
    requiresHuman
  };
}

async function callOpenAI(params: ProcessCitizenMessageParams) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const categoryNames = params.mandate.categories?.map((category) => category.name) ?? [];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `Você é uma IA assistiva de uma central operacional de atendimento no WhatsApp e responde em pt-BR.\n` +
                `Regras obrigatórias:\n` +
                `- Seja educada, curta, objetiva e humana.\n` +
                `- Não prometa solução imediata.\n` +
                `- Não invente protocolo oficial.\n` +
                `- Não faça propaganda política.\n` +
                `- Não insista nem envie mensagens longas.\n` +
                `- Peça informações faltantes quando necessário.\n` +
                `- Identifique temas como buraco na rua, iluminação, saúde, escola, denúncia, transporte, limpeza urbana, segurança e assistência social.\n` +
                `- Em casos sensíveis, marque requiresHuman=true.\n` +
                `- Se for só saudação ou dúvida genérica, não crie demanda.\n` +
                `- Seu papel é triagem operacional com supervisão humana.\n` +
                `Contexto operacional: ${params.mandate.aiPrompt}\n` +
                `Operação: ${params.mandate.name}\n` +
                `Cidade/UF: ${params.mandate.city}/${params.mandate.state}\n` +
                `Categorias conhecidas: ${categoryNames.join(", ") || "Geral"}.\n` +
                `Retorne JSON estritamente conforme o schema.`
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Cidadão: ${params.citizen.name}\n` +
                `Telefone: ${params.citizen.phone}\n` +
                `Histórico da conversa:\n${buildHistory(params.conversationHistory) || "Sem histórico anterior."}\n\n` +
                `Nova mensagem:\n${params.message}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "gabinete_conectado_citizen_message",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              action: {
                type: "string",
                enum: ["AUTO_REPLY", "ASK_CONTEXT", "ESCALATE_HUMAN", "IGNORE", "USE_TEMPLATE"]
              },
              reason: { type: "string" },
              confidence: { type: "number" },
              sensitive: { type: "boolean" },
              riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
              shouldCreateDemand: { type: "boolean" },
              demandTitle: { type: ["string", "null"] },
              demandDescription: { type: ["string", "null"] },
              categorySuggestion: { type: ["string", "null"] },
              priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
              requiresHuman: { type: "boolean" }
            },
            required: [
              "action",
              "reply",
              "reason",
              "confidence",
              "sensitive",
              "riskLevel",
              "shouldCreateDemand",
              "demandTitle",
              "demandDescription",
              "categorySuggestion",
              "priority",
              "requiresHuman"
            ]
          }
        }
      }
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error("Falha ao gerar resposta da IA.");
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new Error("A IA não retornou conteúdo utilizável.");
  }

  return aiResponseSchema.parse(JSON.parse(outputText));
}

export async function processCitizenMessage(
  params: ProcessCitizenMessageParams
): Promise<ProcessCitizenMessageResult> {
  if (!hasOpenAIKey()) {
    return fallbackProcessCitizenMessage(params);
  }

  try {
    return await callOpenAI(params);
  } catch {
    return fallbackProcessCitizenMessage(params);
  }
}
