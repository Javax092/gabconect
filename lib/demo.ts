import {
  simulateAIReply,
  simulateIntentClassification,
  simulateRiskAnalysis,
  type DemoDecision,
  type DemoIntentLabel
} from "@/lib/demo-ai";

export type DemoConversationStatus = "OPEN" | "HUMAN" | "CLOSED";
export type DemoMessageDirection = "INBOUND" | "OUTBOUND";
export type DemoMessageSource = "WHATSAPP" | "AI" | "HUMAN" | "TEMPLATE";
export type DemoQueueStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED";
export type DemoComplianceStatus = "PENDING" | "APPROVED" | "PACED" | "ESCALATED" | "BLOCKED";

export type DemoTimelineStatus = {
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

export type DemoMessage = {
  id: string;
  direction: DemoMessageDirection;
  content: string;
  source: DemoMessageSource;
  complianceStatus: DemoComplianceStatus;
  createdAt: string;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failureReason: string | null;
};

export type DemoDemand = {
  id: string;
  title: string;
  description: string;
  category: {
    id: string;
    name: string;
    color: string;
  };
  status: "NEW" | "IN_PROGRESS" | "RESOLVED";
  priority: "LOW" | "MEDIUM" | "HIGH";
};

export type DemoConversation = {
  id: string;
  citizen: {
    id: string;
    name: string;
    phone: string;
    region: string;
    avatar: string;
  };
  status: DemoConversationStatus;
  currentQueue: string;
  metaWindowOpen: boolean;
  conversationWindowExpiresAt: string | null;
  aiPaused: boolean;
  humanTakeoverActive: boolean;
  sensitive: boolean;
  humanPriority: boolean;
  riskScore: number;
  spamRisk: string;
  operationalScore: number;
  lastAIAction: DemoDecision | null;
  lastComplianceCheckAt: string | null;
  intent: DemoIntentLabel;
  intentLabel: string;
  decisionReason: string;
  escalationReason: string | null;
  aiDecision: string;
  aiConfidence: number;
  timeline: DemoTimelineStatus;
  unreadCount: number;
  messages: DemoMessage[];
  demands: DemoDemand[];
};

export type DemoTemplate = {
  id: string;
  name: string;
  category: string;
  language: string;
  templateId: string;
  content: string;
  approved: boolean;
  updatedAt: string;
};

export type DemoComplianceLog = {
  id: string;
  actionTaken: string;
  reason: string;
  riskScore: number;
  spamRisk: string;
  createdAt: string;
  conversationId: string | null;
};

export type DemoAIAction = {
  id: string;
  conversationId: string;
  actionType: DemoDecision;
  decision: string;
  confidence: number;
  reason: string;
  createdAt: string;
};

export type DemoActivityEvent = {
  id: string;
  type: "message" | "ai" | "compliance" | "human" | "status";
  title: string;
  detail: string;
  createdAt: string;
  conversationId: string | null;
};

export type DemoInfrastructureStatus = {
  whatsapp: "operacional" | "observacao";
  redis: "simulado";
  queues: "simulado";
  openAi: "simulado";
  webhook: "simulado";
  reason: string;
};

export type DemoData = {
  mandate: {
    id: string;
    name: string;
    politicianName: string;
    city: string;
    state: string;
    whatsappNumber: string;
    aiPrompt: string;
    createdAt: string;
  };
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN";
    createdAt: string;
  };
  conversations: DemoConversation[];
  templates: DemoTemplate[];
  complianceLogs: DemoComplianceLog[];
  aiActions: DemoAIAction[];
  activity: DemoActivityEvent[];
  infrastructure: DemoInfrastructureStatus;
  counters: {
    waitingMessages: number;
    approvedTemplates: number;
    humanQueue: number;
    openConversations: number;
    pausedConversations: number;
    averageRisk: number;
    activeTakeovers: number;
    whatsappStatus: "Conectado" | "Operando em modo demonstracao";
  };
  simulation: {
    tick: number;
    running: boolean;
    lastEventAt: string;
  };
};

type ScenarioSeed = {
  id: string;
  name: string;
  phone: string;
  region: string;
  avatar: string;
  subject: string;
  inbound: string;
  followup?: string;
  humanReply?: string;
  status: DemoConversationStatus;
  queue: string;
  riskScore: number;
  sensitive: boolean;
  humanPriority: boolean;
  metaWindowOpen: boolean;
  minutesAgo: number;
  demandTitle?: string;
  demandDescription?: string;
  demandCategory?: string;
  demandPriority?: "LOW" | "MEDIUM" | "HIGH";
  escalationReason?: string;
};

function isoMinutesAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function plusMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function buildTimeline(createdAt: string, opened: boolean): DemoTimelineStatus {
  return {
    queuedAt: plusMinutes(createdAt, 1),
    sentAt: plusMinutes(createdAt, 2),
    deliveredAt: plusMinutes(createdAt, 3),
    readAt: opened ? plusMinutes(createdAt, 6) : null
  };
}

const templateSeeds: DemoTemplate[] = [
  {
    id: "tpl-demo-1",
    name: "Confirmacao institucional",
    category: "Confirmacao",
    language: "pt_BR",
    templateId: "gc_confirmacao_institucional_v3",
    content:
      "Ola, aqui e da central do gabinete. Recebemos sua mensagem e seu atendimento foi registrado para acompanhamento.",
    approved: true,
    updatedAt: isoMinutesAgo(180)
  },
  {
    id: "tpl-demo-2",
    name: "Retorno de atendimento",
    category: "Follow-up",
    language: "pt_BR",
    templateId: "gc_retorno_atendimento_v2",
    content:
      "Estamos retornando sobre sua solicitacao. A equipe revisou o caso e segue acompanhando os proximos passos operacionais.",
    approved: true,
    updatedAt: isoMinutesAgo(330)
  },
  {
    id: "tpl-demo-3",
    name: "Mensagem fora da janela",
    category: "Janela Meta",
    language: "pt_BR",
    templateId: "gc_fora_janela_24h_v1",
    content:
      "Para continuar este atendimento fora da janela de 24h, precisamos retomar a conversa com uma mensagem aprovada pela Meta.",
    approved: true,
    updatedAt: isoMinutesAgo(520)
  },
  {
    id: "tpl-demo-4",
    name: "Atualizacao de protocolo",
    category: "Protocolo",
    language: "pt_BR",
    templateId: "gc_atualizacao_protocolo_v4",
    content:
      "Seu protocolo recebeu atualizacao interna. Assim que houver novo andamento relevante, enviaremos retorno pelo canal oficial.",
    approved: true,
    updatedAt: isoMinutesAgo(760)
  },
  {
    id: "tpl-demo-5",
    name: "Agradecimento institucional",
    category: "Relacionamento",
    language: "pt_BR",
    templateId: "gc_agradecimento_relacionamento_v1",
    content:
      "Agradecemos o contato e o registro realizado. Seu retorno ajuda a melhorar o atendimento e a priorizacao da operacao.",
    approved: true,
    updatedAt: isoMinutesAgo(920)
  }
];

const scenarioSeeds: ScenarioSeed[] = [
  {
    id: "conv-demo-1",
    name: "Marcos Oliveira",
    phone: "+55 92 99231-4401",
    region: "Novo Aleixo",
    avatar: "MO",
    subject: "Iluminacao publica",
    inbound: "Boa tarde, aqui na Rua 12 do bairro Novo Aleixo estamos sem iluminacao ha 3 dias. O trecho fica muito escuro perto da escola.",
    followup: "O poste fica de frente para o mercadinho Sao Jorge.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 34,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 18,
    demandTitle: "Escuridao em via proxima a escola",
    demandDescription: "Moradores relatam iluminacao inoperante ha 3 dias na Rua 12, com risco de seguranca no horario noturno.",
    demandCategory: "Iluminacao publica",
    demandPriority: "MEDIUM"
  },
  {
    id: "conv-demo-2",
    name: "Rita Barbosa",
    phone: "+55 92 99388-1204",
    region: "Cidade Nova",
    avatar: "RB",
    subject: "Buraco na rua",
    inbound: "Tem um buraco grande na avenida Noel Nutels, quase em frente ao terminal, e ontem um motoqueiro quase caiu.",
    followup: "Ja sinalizaram com galho, mas de noite nao da para ver.",
    status: "OPEN",
    queue: "priority-routing",
    riskScore: 49,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 29,
    demandTitle: "Buraco com risco de acidente",
    demandDescription: "Cratera em via de alto fluxo proxima ao terminal, com quase-acidente reportado por municipe.",
    demandCategory: "Infraestrutura viaria",
    demandPriority: "HIGH"
  },
  {
    id: "conv-demo-3",
    name: "Sueli Nascimento",
    phone: "+55 92 98141-1108",
    region: "Compensa",
    avatar: "SN",
    subject: "Unidade de saude",
    inbound: "Minha mae idosa chegou 5h20 na UBS da Compensa e ate agora nao conseguiu encaixe para clinico. Preciso de orientacao urgente.",
    humanReply: "Sueli, recebemos seu relato e um assessor vai acompanhar esse caso com prioridade para orientar os proximos passos.",
    status: "HUMAN",
    queue: "human-escalation",
    riskScore: 82,
    sensitive: true,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 41,
    escalationReason: "Solicitacao urgente envolvendo idosa e atendimento em saude."
  },
  {
    id: "conv-demo-4",
    name: "Joao Pedro Alves",
    phone: "+55 92 98472-9910",
    region: "Alvorada",
    avatar: "JP",
    subject: "Transporte publico",
    inbound: "A linha 448 passou lotada e deixou muita gente no ponto da avenida C ontem e hoje de novo no mesmo horario.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 31,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 56
  },
  {
    id: "conv-demo-5",
    name: "Eliane Costa",
    phone: "+55 92 99117-2201",
    region: "Jorge Teixeira",
    avatar: "EC",
    subject: "Limpeza urbana",
    inbound: "Tem entulho e lixo acumulado na esquina da Rua Acari com a Rua 5 ha quase duas semanas. Ja apareceu muito mosquito.",
    followup: "Posso mandar foto se ajudar.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 43,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 73
  },
  {
    id: "conv-demo-6",
    name: "Carlos Henrique Lima",
    phone: "+55 92 99602-7711",
    region: "Redencao",
    avatar: "CL",
    subject: "Denuncia sensivel",
    inbound: "Quero fazer uma denuncia sobre atendimento irregular, mas prefiro nao me identificar. Tem servidor cobrando para agilizar documento.",
    humanReply: "Recebemos seu relato com sigilo. Vamos direcionar o caso para avaliacao humana e registrar apenas informacoes objetivas.",
    status: "HUMAN",
    queue: "compliance-review",
    riskScore: 94,
    sensitive: true,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 84,
    escalationReason: "Denuncia sensivel com potencial reputacional e necessidade de sigilo."
  },
  {
    id: "conv-demo-7",
    name: "Neusa Farias",
    phone: "+55 92 99209-0048",
    region: "Sao Jose",
    avatar: "NF",
    subject: "Informacao institucional",
    inbound: "Bom dia, o atendimento para regularizacao de cadastro funciona ate que horas hoje?",
    status: "CLOSED",
    queue: "resolved",
    riskScore: 12,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 96
  },
  {
    id: "conv-demo-8",
    name: "Vanessa Moura",
    phone: "+55 92 98102-6671",
    region: "Parque Dez",
    avatar: "VM",
    subject: "Reclamacao",
    inbound: "Ja e a terceira vez que registro falta de coleta na rua e ninguem volta com uma previsao. Fica muito ruim para os moradores.",
    status: "HUMAN",
    queue: "human-escalation",
    riskScore: 64,
    sensitive: false,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 112,
    escalationReason: "Tom de atrito com recorrencia e necessidade de resposta institucional mais cuidadosa."
  },
  {
    id: "conv-demo-9",
    name: "Paulo Cesar Gomes",
    phone: "+55 92 98844-6600",
    region: "Coroado",
    avatar: "PG",
    subject: "Elogio",
    inbound: "Queria agradecer porque depois do contato por aqui a poda da arvore saiu rapido. O retorno foi bem melhor dessa vez.",
    status: "CLOSED",
    queue: "resolved",
    riskScore: 7,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 125
  },
  {
    id: "conv-demo-10",
    name: "Luciana Prado",
    phone: "+55 92 99370-1199",
    region: "Flores",
    avatar: "LP",
    subject: "Fora da janela",
    inbound: "Estou retomando aquele assunto do protocolo de limpeza. Nao consegui responder ontem e preciso saber se houve atualizacao.",
    status: "OPEN",
    queue: "template-review",
    riskScore: 59,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: false,
    minutesAgo: 141
  },
  {
    id: "conv-demo-11",
    name: "Diego Ramos",
    phone: "+55 92 99277-1003",
    region: "Taruma",
    avatar: "DR",
    subject: "Transporte escolar",
    inbound: "O micro-onibus escolar passou antes do horario combinado e duas criancas ficaram no ponto sem aviso.",
    status: "HUMAN",
    queue: "human-escalation",
    riskScore: 79,
    sensitive: true,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 156,
    escalationReason: "Ocorrencia envolvendo criancas e transporte requer revisao humana."
  },
  {
    id: "conv-demo-12",
    name: "Tamires Rocha",
    phone: "+55 92 99400-0811",
    region: "Santa Etelvina",
    avatar: "TR",
    subject: "Iluminacao publica",
    inbound: "O poste da Travessa Esperanca acende e apaga a noite inteira. O problema volta toda semana.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 36,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 171
  },
  {
    id: "conv-demo-13",
    name: "Andreia Melo",
    phone: "+55 92 98113-0455",
    region: "Educandos",
    avatar: "AM",
    subject: "Unidade de saude",
    inbound: "Na farmacia da unidade disseram que o remedio so chega semana que vem e meu pai ja esta sem desde ontem.",
    status: "HUMAN",
    queue: "human-escalation",
    riskScore: 81,
    sensitive: true,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 188,
    escalationReason: "Impacto em saude e potencial de agravamento exigem acompanhamento humano."
  },
  {
    id: "conv-demo-14",
    name: "Roberto Teixeira",
    phone: "+55 92 98741-3000",
    region: "Centro",
    avatar: "RT",
    subject: "Informacao institucional",
    inbound: "Tem algum canal para acompanhar protocolo de tapa-buraco sem precisar ir pessoalmente?",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 19,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 204
  },
  {
    id: "conv-demo-15",
    name: "Priscila Santos",
    phone: "+55 92 98191-5510",
    region: "Lago Azul",
    avatar: "PS",
    subject: "Limpeza urbana",
    inbound: "O caminhhao da coleta nao passa na viela desde sexta e os sacos ja estao rasgados pelos animais.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 44,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 220
  },
  {
    id: "conv-demo-16",
    name: "Fabio Dantas",
    phone: "+55 92 99145-3344",
    region: "Adrianopolis",
    avatar: "FD",
    subject: "Reclamacao agressiva",
    inbound: "Isso e um absurdo. Ja abriram protocolo, prometeram retorno e ninguem resolve a situacao da rua alagada perto do condominio.",
    status: "HUMAN",
    queue: "compliance-review",
    riskScore: 67,
    sensitive: false,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 236,
    escalationReason: "Atrito alto e risco de desgaste exigem resposta humana com pacing."
  },
  {
    id: "conv-demo-17",
    name: "Michele Duarte",
    phone: "+55 92 98288-9011",
    region: "Dom Pedro",
    avatar: "MD",
    subject: "Buraco na rua",
    inbound: "Na rua lateral do colegio tem um afundamento no asfalto e os carros estao desviando para a contramao.",
    status: "OPEN",
    queue: "priority-routing",
    riskScore: 51,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 254
  },
  {
    id: "conv-demo-18",
    name: "Gilberto Souza",
    phone: "+55 92 99455-7741",
    region: "Mauazinho",
    avatar: "GS",
    subject: "Denuncia de iluminacao",
    inbound: "Tem um ponto sem luz perto da parada e ontem teve tentativa de assalto. Os moradores estao com medo de atravessar ali.",
    status: "HUMAN",
    queue: "human-escalation",
    riskScore: 86,
    sensitive: true,
    humanPriority: true,
    metaWindowOpen: true,
    minutesAgo: 268,
    escalationReason: "Relato de seguranca publica e medo coletivo, com risco alto."
  },
  {
    id: "conv-demo-19",
    name: "Fernanda Pires",
    phone: "+55 92 98321-6602",
    region: "Ponta Negra",
    avatar: "FP",
    subject: "Agradecimento institucional",
    inbound: "Obrigada pelo retorno sobre o agendamento. A equipe foi educada e resolveu minha duvida sem enrolacao.",
    status: "CLOSED",
    queue: "resolved",
    riskScore: 6,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 281
  },
  {
    id: "conv-demo-20",
    name: "Mateus Araujo",
    phone: "+55 92 99190-3007",
    region: "Colonia Terra Nova",
    avatar: "MA",
    subject: "Transporte",
    inbound: "O onibus da linha do Terra Nova esta saindo antes do horario das 6h40 e muita gente esta chegando atrasada no trabalho.",
    status: "OPEN",
    queue: "incoming-message",
    riskScore: 33,
    sensitive: false,
    humanPriority: false,
    metaWindowOpen: true,
    minutesAgo: 299
  }
];

const liveInboundPool = [
  "Boa noite, a rua esta no escuro desde domingo e a parada de onibus fica bem nesse trecho.",
  "A coleta nao passou hoje de novo e ja tem lixo espalhado na calcada inteira.",
  "Preciso saber se o atendimento da unidade vai funcionar amanha cedo porque minha consulta foi remarcada.",
  "Tem um buraco abrindo no cruzamento e os carros estao freando em cima da faixa.",
  "Quero denunciar um atendimento muito agressivo, mas peço discricao no meu nome."
];

const liveNames = [
  ["Helena Castro", "HC", "Parque das Garcas"],
  ["Ramon Vieira", "RV", "Nova Cidade"],
  ["Cintia Braga", "CB", "Aleixo"],
  ["Edson Matos", "EM", "Santo Agostinho"],
  ["Juliana Lobo", "JL", "Cachoeirinha"]
] as const;

function buildConversation(seed: ScenarioSeed, index: number): DemoConversation {
  const inboundAt = isoMinutesAgo(seed.minutesAgo);
  const intent = simulateIntentClassification(seed.inbound);
  const risk = simulateRiskAnalysis(seed.inbound);
  const ai = simulateAIReply(seed.inbound);
  const aiAt = plusMinutes(inboundAt, 4);
  const timeline = buildTimeline(aiAt, seed.metaWindowOpen);

  const messages: DemoMessage[] = [
    {
      id: `${seed.id}-m1`,
      direction: "INBOUND",
      content: seed.inbound,
      source: "WHATSAPP",
      complianceStatus: seed.sensitive ? "ESCALATED" : "APPROVED",
      createdAt: inboundAt,
      queuedAt: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failureReason: null
    },
    {
      id: `${seed.id}-m2`,
      direction: "OUTBOUND",
      content: seed.humanReply ?? ai.reply,
      source: seed.humanReply ? "HUMAN" : seed.metaWindowOpen ? "AI" : "TEMPLATE",
      complianceStatus: seed.humanReply ? "ESCALATED" : seed.metaWindowOpen ? "APPROVED" : "PACED",
      createdAt: aiAt,
      queuedAt: timeline.queuedAt,
      sentAt: timeline.sentAt,
      deliveredAt: timeline.deliveredAt,
      readAt: timeline.readAt,
      failureReason: null
    }
  ];

  if (seed.followup) {
    messages.push({
      id: `${seed.id}-m3`,
      direction: "INBOUND",
      content: seed.followup,
      source: "WHATSAPP",
      complianceStatus: "APPROVED",
      createdAt: plusMinutes(aiAt, 7),
      queuedAt: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failureReason: null
    });
  }

  const demands: DemoDemand[] = seed.demandTitle
    ? [
        {
          id: `${seed.id}-d1`,
          title: seed.demandTitle,
          description: seed.demandDescription ?? seed.inbound,
          category: {
            id: `${seed.id}-cat1`,
            name: seed.demandCategory ?? seed.subject,
            color: "#38bdf8"
          },
          status: seed.status === "CLOSED" ? "RESOLVED" : seed.status === "HUMAN" ? "IN_PROGRESS" : "NEW",
          priority: seed.demandPriority ?? "MEDIUM"
        }
      ]
    : [];

  const lastMessage = messages[messages.length - 1];

  return {
    id: seed.id,
    citizen: {
      id: `${seed.id}-citizen`,
      name: seed.name,
      phone: seed.phone,
      region: seed.region,
      avatar: seed.avatar
    },
    status: seed.status,
    currentQueue: seed.queue,
    metaWindowOpen: seed.metaWindowOpen,
    conversationWindowExpiresAt: seed.metaWindowOpen ? plusMinutes(inboundAt, 1320) : isoMinutesAgo(90),
    aiPaused: seed.status === "HUMAN",
    humanTakeoverActive: seed.status === "HUMAN",
    sensitive: seed.sensitive,
    humanPriority: seed.humanPriority,
    riskScore: seed.riskScore,
    spamRisk: seed.riskScore >= 80 ? "HIGH" : seed.riskScore >= 55 ? "MEDIUM" : "LOW",
    operationalScore: Math.max(100 - seed.riskScore, 8),
    lastAIAction: seed.status === "HUMAN" ? "ESCALATE" : seed.metaWindowOpen ? risk.decision : "USE_TEMPLATE",
    lastComplianceCheckAt: plusMinutes(lastMessage.createdAt, 1),
    intent: intent.label,
    intentLabel: intent.summary,
    decisionReason: risk.reason,
    escalationReason: seed.escalationReason ?? null,
    aiDecision: seed.status === "HUMAN" ? "Conversa escalada para humano" : ai.reply,
    aiConfidence: ai.confidence,
    timeline,
    unreadCount: seed.status === "OPEN" ? 1 + (index % 3) : 0,
    messages: messages.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    demands
  };
}

function buildComplianceLogs(): DemoComplianceLog[] {
  const base = [
    {
      actionTaken: "Delay humano aplicado",
      reason: "Mensagem com tom sensivel aguardando pacing antes do envio.",
      riskScore: 68,
      spamRisk: "MEDIUM",
      conversationId: "conv-demo-8"
    },
    {
      actionTaken: "Resposta automatica bloqueada",
      reason: "Denuncia com potencial reputacional e necessidade de validacao humana.",
      riskScore: 91,
      spamRisk: "HIGH",
      conversationId: "conv-demo-6"
    },
    {
      actionTaken: "Conversa escalada para humano",
      reason: "Relato urgente envolvendo saude e idosa em espera prolongada.",
      riskScore: 82,
      spamRisk: "HIGH",
      conversationId: "conv-demo-3"
    },
    {
      actionTaken: "Template sugerido fora da janela",
      reason: "Conversa retomada apos expiracao da janela de 24h da Meta.",
      riskScore: 62,
      spamRisk: "MEDIUM",
      conversationId: "conv-demo-10"
    },
    {
      actionTaken: "Supervisao humana mantida",
      reason: "Caso com transporte escolar e criancas aguardando definicao.",
      riskScore: 79,
      spamRisk: "HIGH",
      conversationId: "conv-demo-11"
    }
  ];

  return base.map((entry, index) => ({
    id: `compliance-demo-${index + 1}`,
    ...entry,
    createdAt: isoMinutesAgo(12 + index * 11)
  }));
}

function buildAiActions(conversations: DemoConversation[]): DemoAIAction[] {
  return conversations.slice(0, 8).map((conversation, index) => ({
    id: `ai-action-demo-${index + 1}`,
    conversationId: conversation.id,
    actionType: conversation.lastAIAction ?? "RESPOND",
    decision:
      conversation.lastAIAction === "ESCALATE"
        ? "Escalar para supervisor"
        : conversation.lastAIAction === "USE_TEMPLATE"
          ? "Aplicar template aprovado"
          : "Responder com assistencia",
    confidence: conversation.aiConfidence,
    reason: conversation.decisionReason,
    createdAt: isoMinutesAgo(8 + index * 6)
  }));
}

function buildActivity(conversations: DemoConversation[]): DemoActivityEvent[] {
  return [
    {
      id: "activity-demo-1",
      type: "message",
      title: "Nova mensagem recebida",
      detail: `${conversations[0]?.citizen.name} atualizou o ponto de referencia da rua sem iluminacao.`,
      createdAt: isoMinutesAgo(5),
      conversationId: conversations[0]?.id ?? null
    },
    {
      id: "activity-demo-2",
      type: "ai",
      title: "IA classificou a intencao",
      detail: "Solicitacao marcada como infraestrutura viaria com risco operacional moderado.",
      createdAt: isoMinutesAgo(7),
      conversationId: conversations[1]?.id ?? null
    },
    {
      id: "activity-demo-3",
      type: "human",
      title: "Takeover humano iniciado",
      detail: "Assessoria assumiu conversa sensivel relacionada a unidade de saude.",
      createdAt: isoMinutesAgo(11),
      conversationId: conversations[2]?.id ?? null
    },
    {
      id: "activity-demo-4",
      type: "status",
      title: "Status WhatsApp atualizado",
      detail: "Mensagem institucional marcada como lida pelo cidadao.",
      createdAt: isoMinutesAgo(13),
      conversationId: conversations[6]?.id ?? null
    },
    {
      id: "activity-demo-5",
      type: "compliance",
      title: "Compliance bloqueou automacao",
      detail: "Conversa de denuncia ficou restrita a supervisao humana.",
      createdAt: isoMinutesAgo(16),
      conversationId: conversations[5]?.id ?? null
    }
  ];
}

function withCounters(data: Omit<DemoData, "counters">): DemoData {
  const waitingMessages = data.conversations.filter((conversation) =>
    conversation.messages.some(
      (message) => message.direction === "OUTBOUND" && message.queuedAt && !message.readAt
    )
  ).length;
  const approvedTemplates = data.templates.filter((template) => template.approved).length;
  const humanQueue = data.conversations.filter((conversation) => conversation.status === "HUMAN").length;
  const openConversations = data.conversations.filter((conversation) => conversation.status === "OPEN").length;
  const pausedConversations = data.conversations.filter((conversation) => conversation.aiPaused).length;
  const averageRisk = Math.round(
    data.conversations.reduce((total, item) => total + item.riskScore, 0) / data.conversations.length
  );
  const activeTakeovers = data.conversations.filter((conversation) => conversation.humanTakeoverActive).length;

  return {
    ...data,
    counters: {
      waitingMessages,
      approvedTemplates,
      humanQueue,
      openConversations,
      pausedConversations,
      averageRisk,
      activeTakeovers,
      whatsappStatus: "Operando em modo demonstracao"
    }
  };
}

function buildBaseDemoData(): DemoData {
  const conversations = scenarioSeeds.map(buildConversation).sort(
    (a, b) => +new Date(b.messages[b.messages.length - 1]?.createdAt ?? 0) - +new Date(a.messages[a.messages.length - 1]?.createdAt ?? 0)
  );

  const data: Omit<DemoData, "counters"> = {
    mandate: {
      id: "demo-mandate",
      name: "Gabinete Conectado Demo",
      politicianName: "Vereadora Helena Costa",
      city: "Manaus",
      state: "AM",
      whatsappNumber: "+55 92 99100-2020",
      aiPrompt:
        "Atue como central operacional do gabinete. Seja objetiva, acolhedora, nao prometa execucao e escale casos sensiveis ou urgentes.",
      createdAt: new Date("2026-04-01T09:00:00.000Z").toISOString()
    },
    currentUser: {
      id: "demo-user",
      name: "Marina Vieira",
      email: "demo@gabineteconectado.local",
      role: "ADMIN",
      createdAt: new Date("2026-04-03T14:30:00.000Z").toISOString()
    },
    conversations,
    templates: templateSeeds,
    complianceLogs: buildComplianceLogs(),
    aiActions: buildAiActions(conversations),
    activity: buildActivity(conversations),
    infrastructure: {
      whatsapp: "operacional",
      redis: "simulado",
      queues: "simulado",
      openAi: "simulado",
      webhook: "simulado",
      reason: "Ambiente demonstrativo com eventos em tempo real sem depender de Meta, Redis ou OpenAI."
    },
    simulation: {
      tick: 0,
      running: false,
      lastEventAt: new Date().toISOString()
    }
  };

  return withCounters(data);
}

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function getDemoData() {
  return buildBaseDemoData();
}

export function getDemoAuthUser() {
  const data = buildBaseDemoData();

  return {
    id: data.currentUser.id,
    name: data.currentUser.name,
    email: data.currentUser.email,
    role: data.currentUser.role,
    mandateId: data.mandate.id,
    createdAt: new Date(data.currentUser.createdAt),
    mandate: {
      ...data.mandate,
      createdAt: new Date(data.mandate.createdAt)
    }
  };
}

export function simulateRealtimeEvents(current: DemoData): DemoData {
  const next = structuredClone(current) as DemoData;
  const tick = next.simulation.tick + 1;
  const now = new Date(Date.now() + tick * 1000).toISOString();
  const conversationIndex = tick % next.conversations.length;
  const target = next.conversations[conversationIndex];

  const liveMessage =
    liveInboundPool[tick % liveInboundPool.length] ?? "Nova interacao recebida para triagem operacional.";
  const livePerson = liveNames[tick % liveNames.length];

  let updatedConversation = target;
  let activityTitle = "Nova mensagem recebida";
  let activityDetail = `${target.citizen.name} enviou nova atualizacao para a central.`;
  let complianceAction: DemoComplianceLog | null = null;
  let aiAction: DemoAIAction | null = null;

  if (tick % 4 === 0) {
    const newConversationId = `conv-live-${tick}`;
    const intent = simulateIntentClassification(liveMessage);
    const risk = simulateRiskAnalysis(liveMessage);
    const ai = simulateAIReply(liveMessage);
    const createdAt = now;
    const timeline = buildTimeline(plusMinutes(createdAt, 2), risk.score < 70);

    updatedConversation = {
      id: newConversationId,
      citizen: {
        id: `citizen-live-${tick}`,
        name: livePerson[0],
        phone: `+55 92 99${String(200000 + tick).slice(-6)}-${String(1000 + tick).slice(-4)}`,
        region: livePerson[2],
        avatar: livePerson[1]
      },
      status: risk.requiresHuman ? "HUMAN" : "OPEN",
      currentQueue: risk.requiresHuman ? "human-escalation" : "incoming-message",
      metaWindowOpen: true,
      conversationWindowExpiresAt: plusMinutes(createdAt, 1440),
      aiPaused: risk.requiresHuman,
      humanTakeoverActive: risk.requiresHuman,
      sensitive: risk.score >= 80,
      humanPriority: risk.requiresHuman,
      riskScore: risk.score,
      spamRisk: risk.score >= 80 ? "HIGH" : risk.score >= 55 ? "MEDIUM" : "LOW",
      operationalScore: Math.max(100 - risk.score, 8),
      lastAIAction: risk.decision,
      lastComplianceCheckAt: createdAt,
      intent: intent.label,
      intentLabel: intent.summary,
      decisionReason: risk.reason,
      escalationReason: risk.requiresHuman ? risk.reason : null,
      aiDecision: ai.reply,
      aiConfidence: ai.confidence,
      timeline,
      unreadCount: 1,
      demands: [],
      messages: [
        {
          id: `${newConversationId}-m1`,
          direction: "INBOUND",
          content: liveMessage,
          source: "WHATSAPP",
          complianceStatus: risk.requiresHuman ? "ESCALATED" : "APPROVED",
          createdAt,
          queuedAt: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failureReason: null
        }
      ]
    };

    next.conversations = [updatedConversation, ...next.conversations.slice(0, 19)];
    activityTitle = "Nova conversa entrou na operacao";
    activityDetail = `${updatedConversation.citizen.name} iniciou contato sobre ${intent.summary.toLowerCase()}`;

    complianceAction = {
      id: `compliance-live-${tick}`,
      actionTaken: risk.requiresHuman ? "Conversa escalada para humano" : "Triagem automatica aprovada",
      reason: risk.reason,
      riskScore: risk.score,
      spamRisk: updatedConversation.spamRisk,
      createdAt: now,
      conversationId: updatedConversation.id
    };
  } else {
    const intent = simulateIntentClassification(liveMessage);
    const risk = simulateRiskAnalysis(liveMessage);
    const ai = simulateAIReply(liveMessage);

    const inboundMessage: DemoMessage = {
      id: `${target.id}-live-in-${tick}`,
      direction: "INBOUND",
      content: liveMessage,
      source: "WHATSAPP",
      complianceStatus: risk.requiresHuman ? "ESCALATED" : "APPROVED",
      createdAt: now,
      queuedAt: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failureReason: null
    };

    const outboundTime = plusMinutes(now, 2);
    const timeline = buildTimeline(outboundTime, !risk.requiresHuman);
    const outboundMessage: DemoMessage = {
      id: `${target.id}-live-out-${tick}`,
      direction: "OUTBOUND",
      content: risk.requiresHuman
        ? "Recebemos sua atualizacao. O caso permanece com supervisao humana para retorno mais cuidadoso."
        : ai.reply,
      source: risk.requiresHuman ? "HUMAN" : target.metaWindowOpen ? "AI" : "TEMPLATE",
      complianceStatus: risk.requiresHuman ? "ESCALATED" : target.metaWindowOpen ? "APPROVED" : "PACED",
      createdAt: outboundTime,
      queuedAt: timeline.queuedAt,
      sentAt: timeline.sentAt,
      deliveredAt: timeline.deliveredAt,
      readAt: tick % 2 === 0 ? timeline.readAt : null,
      failureReason: null
    };

    updatedConversation = {
      ...target,
      status: risk.requiresHuman ? "HUMAN" : "OPEN",
      currentQueue: risk.requiresHuman ? "human-escalation" : "outgoing-message",
      aiPaused: risk.requiresHuman,
      humanTakeoverActive: risk.requiresHuman,
      sensitive: target.sensitive || risk.score >= 80,
      humanPriority: target.humanPriority || risk.requiresHuman,
      riskScore: Math.max(target.riskScore, risk.score),
      spamRisk: risk.score >= 80 ? "HIGH" : risk.score >= 55 ? "MEDIUM" : "LOW",
      operationalScore: Math.max(100 - Math.max(target.riskScore, risk.score), 8),
      lastAIAction: risk.decision,
      lastComplianceCheckAt: now,
      intent: intent.label,
      intentLabel: intent.summary,
      decisionReason: risk.reason,
      escalationReason: risk.requiresHuman ? risk.reason : target.escalationReason,
      aiDecision: outboundMessage.content,
      aiConfidence: ai.confidence,
      unreadCount: risk.requiresHuman ? 0 : 1,
      messages: [...target.messages, inboundMessage, outboundMessage]
    };

    next.conversations = next.conversations
      .map((conversation) => (conversation.id === target.id ? updatedConversation : conversation))
      .sort(
        (a, b) =>
          +new Date(b.messages[b.messages.length - 1]?.createdAt ?? 0) -
          +new Date(a.messages[a.messages.length - 1]?.createdAt ?? 0)
      );

    activityTitle = risk.requiresHuman ? "Conversa movida para fila humana" : "IA respondeu automaticamente";
    activityDetail = risk.requiresHuman
      ? `${target.citizen.name} foi redirecionado para supervisao humana por risco ${risk.score}.`
      : `Resposta assistida enviada para ${target.citizen.name} com score ${Math.round(ai.confidence * 100)}%.`;

    complianceAction = {
      id: `compliance-live-${tick}`,
      actionTaken: risk.requiresHuman ? "Delay humano aplicado" : "Resposta automatica aprovada",
      reason: risk.reason,
      riskScore: risk.score,
      spamRisk: updatedConversation.spamRisk,
      createdAt: now,
      conversationId: updatedConversation.id
    };

    aiAction = {
      id: `ai-live-${tick}`,
      conversationId: updatedConversation.id,
      actionType: risk.decision,
      decision: risk.requiresHuman ? "Escalar para supervisor" : "Responder com IA assistiva",
      confidence: ai.confidence,
      reason: `${intent.summary} ${risk.reason}`,
      createdAt: now
    };
  }

  const liveActivityType: DemoActivityEvent["type"] =
    tick % 4 === 0 ? "message" : aiAction ? "ai" : "status";

  next.activity = [
    {
      id: `activity-live-${tick}`,
      type: liveActivityType,
      title: activityTitle,
      detail: activityDetail,
      createdAt: now,
      conversationId: updatedConversation.id
    },
    ...next.activity
  ].slice(0, 12);

  if (complianceAction) {
    next.complianceLogs = [complianceAction, ...next.complianceLogs].slice(0, 10);
  }

  if (aiAction) {
    next.aiActions = [aiAction, ...next.aiActions].slice(0, 10);
  }

  next.simulation = {
    tick,
    running: true,
    lastEventAt: now
  };

  return withCounters(next);
}
