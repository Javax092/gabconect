export type DemoIntentLabel =
  | "ILUMINACAO_PUBLICA"
  | "BURACO_NA_RUA"
  | "UNIDADE_DE_SAUDE"
  | "TRANSPORTE_PUBLICO"
  | "LIMPEZA_URBANA"
  | "DENUNCIA"
  | "INFORMACAO_INSTITUCIONAL"
  | "RECLAMACAO"
  | "ELOGIO";

export type DemoDecision = "RESPOND" | "WAIT_HUMAN" | "ESCALATE" | "USE_TEMPLATE" | "BLOCK";

export type DemoIntentClassification = {
  label: DemoIntentLabel;
  confidence: number;
  summary: string;
};

export type DemoRiskAnalysis = {
  score: number;
  decision: DemoDecision;
  reason: string;
  requiresHuman: boolean;
};

export type DemoAIReply = {
  reply: string;
  decision: DemoDecision;
  confidence: number;
  reason: string;
  delayMs: number;
};

const intentCatalog: Array<{
  label: DemoIntentLabel;
  keywords: string[];
  summary: string;
}> = [
  {
    label: "ILUMINACAO_PUBLICA",
    keywords: ["iluminacao", "poste", "lampada", "escuro"],
    summary: "Solicitacao relacionada a iluminacao publica e seguranca noturna."
  },
  {
    label: "BURACO_NA_RUA",
    keywords: ["buraco", "asfalto", "cratera", "rua", "avenida"],
    summary: "Ocorrencia viaria com potencial de dano a veiculos e risco de acidente."
  },
  {
    label: "UNIDADE_DE_SAUDE",
    keywords: ["posto", "ubs", "consulta", "medico", "saude", "remedio"],
    summary: "Demanda envolvendo atendimento em unidade de saude ou acesso a servicos."
  },
  {
    label: "TRANSPORTE_PUBLICO",
    keywords: ["onibus", "linha", "terminal", "transporte", "rota"],
    summary: "Demanda operacional de mobilidade urbana ou transporte publico."
  },
  {
    label: "LIMPEZA_URBANA",
    keywords: ["lixo", "limpeza", "entulho", "coleta", "capinacao"],
    summary: "Solicitacao de limpeza urbana, retirada de residuos ou manutencao basica."
  },
  {
    label: "DENUNCIA",
    keywords: ["denuncia", "agressao", "ameaca", "violencia", "irregular"],
    summary: "Caso sensivel com necessidade de supervisao humana e cuidado reputacional."
  },
  {
    label: "INFORMACAO_INSTITUCIONAL",
    keywords: ["horario", "endereco", "informacao", "funciona", "atendimento"],
    summary: "Pedido objetivo de informacao institucional ou orientacao inicial."
  },
  {
    label: "RECLAMACAO",
    keywords: ["reclamacao", "indignado", "ninguem", "absurdo", "demora"],
    summary: "Manifestacao de insatisfacao que exige postura objetiva e acolhedora."
  },
  {
    label: "ELOGIO",
    keywords: ["obrigado", "agradecer", "elogio", "parabens"],
    summary: "Feedback positivo recebido do cidadao."
  }
];

export function simulateIntentClassification(message: string): DemoIntentClassification {
  const normalized = message.toLowerCase();

  const matched =
    intentCatalog.find((intent) =>
      intent.keywords.some((keyword) => normalized.includes(keyword))
    ) ?? intentCatalog[7];

  const confidence =
    matched.label === "DENUNCIA" || matched.label === "UNIDADE_DE_SAUDE" ? 0.93 : 0.88;

  return {
    label: matched.label,
    confidence,
    summary: matched.summary
  };
}

export function simulateRiskAnalysis(message: string): DemoRiskAnalysis {
  const normalized = message.toLowerCase();

  if (
    ["ameaca", "violencia", "agressao", "denuncia", "prefiro nao me identificar"].some((term) =>
      normalized.includes(term)
    )
  ) {
    return {
      score: 91,
      decision: "ESCALATE",
      reason: "Caso sensivel com potencial reputacional e necessidade de triagem humana imediata.",
      requiresHuman: true
    };
  }

  if (["urgente", "crianca", "idoso", "saude", "hospital", "medico"].some((term) => normalized.includes(term))) {
    return {
      score: 78,
      decision: "WAIT_HUMAN",
      reason: "Solicitacao com urgencia percebida e impacto social relevante.",
      requiresHuman: true
    };
  }

  if (["fora da janela", "24h", "template"].some((term) => normalized.includes(term))) {
    return {
      score: 62,
      decision: "USE_TEMPLATE",
      reason: "Conversa exige uso de template aprovado devido a restricao de janela.",
      requiresHuman: false
    };
  }

  if (["absurdo", "indignado", "vergonha"].some((term) => normalized.includes(term))) {
    return {
      score: 57,
      decision: "WAIT_HUMAN",
      reason: "Tom de atrito identificado. Recomendado pacing antes de responder.",
      requiresHuman: true
    };
  }

  return {
    score: 28,
    decision: "RESPOND",
    reason: "Solicitacao objetiva e apta para resposta assistida com baixo risco.",
    requiresHuman: false
  };
}

export function simulateAIReply(message: string): DemoAIReply {
  const intent = simulateIntentClassification(message);
  const risk = simulateRiskAnalysis(message);

  const replies: Record<DemoIntentLabel, string> = {
    ILUMINACAO_PUBLICA:
      "Recebemos o relato sobre iluminacao publica e vamos registrar o ponto para encaminhamento operacional. Se puder, envie numero do poste ou uma referencia proxima para agilizar a triagem.",
    BURACO_NA_RUA:
      "Obrigado pelo aviso. Vou deixar registrado com prioridade operacional e, se houver risco imediato para veiculos ou motos, podemos sinalizar como urgencia com o ponto exato da via.",
    UNIDADE_DE_SAUDE:
      "Entendi a situacao. Vou registrar a demanda com contexto completo para avaliacao humana e peco, se possivel, unidade, horario e especialidade envolvida.",
    TRANSPORTE_PUBLICO:
      "Obrigado por detalhar. Vou organizar a ocorrencia com linha, horario e local para acompanhamento da equipe.",
    LIMPEZA_URBANA:
      "Recebi sua solicitacao. Vamos encaminhar o registro com local, referencia e tipo de material acumulado para priorizacao.",
    DENUNCIA:
      "Recebemos seu relato com confidencialidade e vamos direcionar para avaliacao humana. Se considerar seguro, envie local, horario e uma referencia objetiva do ocorrido.",
    INFORMACAO_INSTITUCIONAL:
      "Posso adiantar a orientacao inicial por aqui. Se quiser, me diga o servico ou unidade e eu organizo a resposta institucional correta.",
    RECLAMACAO:
      "Entendi sua reclamacao e vou registrar com o contexto completo para retorno mais objetivo da equipe. Se puder, envie local, horario e desde quando o problema persiste.",
    ELOGIO:
      "Obrigado pela mensagem. Vou registrar o retorno positivo no historico da operacao e compartilhar com a equipe responsavel."
  };

  return {
    reply: replies[intent.label],
    decision: risk.decision,
    confidence: Math.max(intent.confidence - risk.score / 500, 0.66),
    reason: `${intent.summary} ${risk.reason}`,
    delayMs: risk.requiresHuman ? 4200 : 2200
  };
}
