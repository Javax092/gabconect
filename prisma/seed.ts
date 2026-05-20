import {
  ConversationStatus,
  DemandPriority,
  DemandStatus,
  MessageDirection,
  MessageSource,
  Role,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { DEFAULT_MANDATE_CATEGORIES } from "../lib/categories";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

function parseBoolean(value: string | undefined) {
  return value === "true";
}

async function ensureMandateDefaults(mandateId: string) {
  await prisma.category.createMany({
    data: DEFAULT_MANDATE_CATEGORIES.map((category) => ({
      mandateId,
      name: category.name,
      color: category.color
    })),
    skipDuplicates: true
  });
}

async function ensureCampaignDefaults(mandateId: string) {
  await prisma.campaignSettings.upsert({
    where: {
      mandateId
    },
    update: {},
    create: {
      mandateId,
      defaultDailyLimit: 20,
      defaultDelaySeconds: 60,
      maxConsecutiveFailures: 3
    }
  });
}

async function seedCampaignData(mandateId: string) {
  const today = new Date();
  const contacts = [
    {
      name: "Marina Alves",
      phone: "+15550001001",
      birthday: new Date("1991-02-14T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: true,
      optInAt: new Date("2026-05-10T14:00:00.000Z"),
      status: "ACTIVE" as const,
      tags: ["lideranca", "bairro"]
    },
    {
      name: "Rafael Costa",
      phone: "+15550001002",
      birthday: new Date("1988-08-22T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: true,
      optInAt: new Date("2026-05-10T14:05:00.000Z"),
      status: "ACTIVE" as const,
      tags: ["evento", "bairro"]
    },
    {
      name: "Patricia Nogueira",
      phone: "+15550001003",
      birthday: new Date("1993-09-03T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: false,
      optInAt: null,
      status: "ACTIVE" as const,
      tags: ["teste"]
    },
    {
      name: "Bruno Martins",
      phone: "+15550001004",
      birthday: new Date("1990-01-09T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: true,
      optInAt: new Date("2026-05-11T09:15:00.000Z"),
      status: "ACTIVE" as const,
      tags: ["academia", "lideranca"]
    },
    {
      name: "Camila Freitas",
      phone: "+15550001005",
      birthday: new Date("1996-12-27T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: true,
      optInAt: new Date("2026-05-11T10:20:00.000Z"),
      status: "ACTIVE" as const,
      tags: ["bairro", "evento"]
    },
    {
      name: "Diego Santana",
      phone: "+15550001006",
      birthday: new Date("1987-06-18T00:00:00.000Z"),
      source: "SEED_DEMO",
      optIn: true,
      optInAt: new Date("2026-05-12T08:45:00.000Z"),
      status: "ACTIVE" as const,
      tags: ["teste", "academia"]
    },
    {
      name: "João Teste",
      phone: "5592999990001",
      birthday: today,
      source: "SEED_TEST",
      optIn: true,
      optInAt: today,
      status: "ACTIVE" as const,
      tags: ["aniversario", "teste-local"]
    }
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: {
        mandateId_phone: {
          mandateId,
        phone: contact.phone
        }
      },
      update: {
        name: contact.name,
        birthday: contact.birthday,
        source: contact.source,
        optIn: contact.optIn,
        optInAt: contact.optInAt,
        status: contact.status,
        tags: contact.tags
      },
      create: {
        mandateId,
        ...contact
      }
    });
  }

  const templates = [
    {
      name: "Feliz aniversario teste",
      metaTemplateName: "feliz_aniversario_teste",
      language: "pt_BR",
      category: WhatsAppTemplateCategory.MARKETING,
      status: WhatsAppTemplateStatus.APPROVED,
      body:
        "Olá, {{firstName}}, feliz aniversário! O gabinete deseja um ótimo dia e segue à disposição."
    },
    {
      name: "Campanha informativo",
      metaTemplateName: "campanha_informativo",
      language: "pt_BR",
      category: WhatsAppTemplateCategory.MARKETING,
      status: WhatsAppTemplateStatus.APPROVED,
      body:
        "Informativo institucional com envio restrito a contatos com opt-in e uso de template aprovado."
    },
    {
      name: "Convite para evento",
      metaTemplateName: "convite_evento",
      language: "pt_BR",
      category: WhatsAppTemplateCategory.MARKETING,
      status: WhatsAppTemplateStatus.APPROVED,
      body:
        "Convite institucional para evento do mandato, respeitando consentimento prévio e regras da Meta."
    },
    {
      name: "Lembrete de atendimento",
      metaTemplateName: "lembrete_atendimento",
      language: "pt_BR",
      category: WhatsAppTemplateCategory.UTILITY,
      status: WhatsAppTemplateStatus.APPROVED,
      body:
        "Lembrete de atendimento ou retorno institucional para contatos previamente autorizados."
    }
  ];

  for (const template of templates) {
    await prisma.whatsAppTemplate.upsert({
      where: {
        mandateId_metaTemplateName_language: {
          mandateId,
          metaTemplateName: template.metaTemplateName,
          language: template.language
        }
      },
      update: {
        name: template.name,
        category: template.category,
        status: template.status,
        body: template.body
      },
      create: {
        mandateId,
        ...template
      }
    });
  }

  const profile = await prisma.numberReputationProfile.upsert({
    where: {
      mandateId
    },
    update: {
      phoneNumber: "+15550009999",
      reputationScore: 74,
      spamRisk: 24,
      deliveryHealth: 89,
      qualityRating: "Estavel",
      trustLevel: "Supervisionado",
      safeThroughput: 26,
      activeThroughput: 18
    },
    create: {
      mandateId,
      phoneNumber: "+15550009999",
      reputationScore: 74,
      spamRisk: 24,
      deliveryHealth: 89,
      qualityRating: "Estavel",
      trustLevel: "Supervisionado",
      safeThroughput: 26,
      activeThroughput: 18
    }
  });

  const approvedTemplates = await prisma.whatsAppTemplate.findMany({
    where: {
      mandateId
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (approvedTemplates.length === 0) {
    return;
  }

  const existingCampaigns = await prisma.campaign.count({
    where: {
      mandateId
    }
  });

  if (existingCampaigns > 0) {
    return;
  }

  const [safeTemplate, mediumTemplate, utilityTemplate] = approvedTemplates;
  const safeCampaign = await prisma.campaign.create({
    data: {
      mandateId,
      name: "Campanha segura de relacionamento",
      templateId: safeTemplate.id,
      segmentTags: ["bairro"],
      status: "DRAFT",
      dailyLimit: 120,
      delaySeconds: 45,
      audienceConfig: {
        create: {
          tags: ["bairro"],
          groups: [],
          priorities: [],
          locations: [],
          interests: [],
          contactTypes: []
        }
      }
    }
  });
  const mediumCampaign = await prisma.campaign.create({
    data: {
      mandateId,
      name: "Campanha com risco medio",
      templateId: (mediumTemplate ?? safeTemplate).id,
      segmentTags: ["evento", "academia"],
      status: "PAUSED",
      dailyLimit: 140,
      delaySeconds: 60,
      audienceConfig: {
        create: {
          tags: ["evento"],
          groups: [],
          priorities: [],
          locations: [],
          interests: ["academia"],
          contactTypes: []
        }
      }
    }
  });
  const criticalCampaign = await prisma.campaign.create({
    data: {
      mandateId,
      name: "Campanha bloqueada por risco critico",
      templateId: (utilityTemplate ?? safeTemplate).id,
      segmentTags: ["teste"],
      status: "PAUSED",
      dailyLimit: 220,
      delaySeconds: 30,
      audienceConfig: {
        create: {
          tags: ["teste"],
          groups: [],
          priorities: [],
          locations: [],
          interests: [],
          contactTypes: []
        }
      }
    }
  });

  await prisma.campaignSafetySimulation.createMany({
    data: [
      {
        campaignId: safeCampaign.id,
        riskLevel: "LOW",
        safetyScore: 86,
        recommendedDailyLimit: 110,
        recommendedBatchSize: 24,
        recommendedDelayMinSeconds: 25,
        recommendedDelayMaxSeconds: 60,
        requiresHumanReview: false,
        canStartNow: true,
        estimatedCompletionTime: "Hoje, em cerca de 2h",
        estimatedReputationImpact: "Impacto controlado dentro da faixa segura",
        warnings: ["Warmup respeitado e publico com opt-in consistente."],
        recommendations: ["Manter o plano seguro recomendado."],
        blockingReasons: []
      },
      {
        campaignId: mediumCampaign.id,
        riskLevel: "MEDIUM",
        safetyScore: 67,
        recommendedDailyLimit: 80,
        recommendedBatchSize: 18,
        recommendedDelayMinSeconds: 45,
        recommendedDelayMaxSeconds: 110,
        requiresHumanReview: false,
        canStartNow: true,
        estimatedCompletionTime: "2 dias operacionais estimados",
        estimatedReputationImpact: "Leve pressao reputacional esperada",
        warnings: ["Volume acima da media recente do numero."],
        recommendations: ["Distribuir em 4 lotes com pausa entre janelas."],
        blockingReasons: []
      },
      {
        campaignId: criticalCampaign.id,
        riskLevel: "CRITICAL",
        safetyScore: 34,
        recommendedDailyLimit: 30,
        recommendedBatchSize: 8,
        recommendedDelayMinSeconds: 180,
        recommendedDelayMaxSeconds: 320,
        requiresHumanReview: true,
        canStartNow: false,
        estimatedCompletionTime: "6 dias operacionais estimados",
        estimatedReputationImpact: "Queda material de reputacao se o plano for ignorado",
        warnings: ["Falhas recentes acima da faixa segura."],
        recommendations: ["Reduzir audiencia e revisar template antes de retomar."],
        blockingReasons: ["Numero em modo de recuperacao de confianca."]
      }
    ]
  });

  await prisma.trustRecoveryState.create({
    data: {
      profileId: profile.id,
      mandateId,
      status: "ACTIVE",
      reason: "Seed demo com numero em trust recovery para apresentacao comercial.",
      recommendedLimit: 40,
      cooldownUntil: new Date("2026-05-19T15:00:00.000Z"),
      recoverySteps: [
        "Usar campanhas menores com opt-in recente.",
        "Aumentar delays e pausas entre lotes.",
        "Priorizar templates com melhor saude."
      ]
    }
  });
}

async function seedSampleData(mandateId: string) {
  const existingMessages = await prisma.message.count({
    where: {
      conversation: {
        mandateId
      }
    }
  });

  if (existingMessages > 0) {
    return;
  }

  const categories = await prisma.category.findMany({
    where: {
      mandateId
    }
  });

  const saude = categories.find((category) => category.name === "Saúde");
  const infraestrutura = categories.find((category) => category.name === "Infraestrutura");
  const assistencia = categories.find((category) => category.name === "Assistência social");

  if (!saude || !infraestrutura || !assistencia) {
    throw new Error("Categorias padrão não foram provisionadas corretamente.");
  }

  const [citizenA, citizenB, citizenC] = await Promise.all([
    prisma.citizen.create({
      data: {
        name: "João Pereira",
        phone: "+5592988881111",
        mandateId
      }
    }),
    prisma.citizen.create({
      data: {
        name: "Ana Souza",
        phone: "+5592988882222",
        mandateId
      }
    }),
    prisma.citizen.create({
      data: {
        name: "Carlos Lima",
        phone: "+5592988883333",
        mandateId
      }
    })
  ]);

  const [conversationA, conversationB, conversationC] = await Promise.all([
    prisma.conversation.create({
      data: {
        citizenId: citizenA.id,
        mandateId,
        status: ConversationStatus.OPEN,
        lastMessageAt: new Date("2026-05-15T14:30:00.000Z")
      }
    }),
    prisma.conversation.create({
      data: {
        citizenId: citizenB.id,
        mandateId,
        status: ConversationStatus.HUMAN,
        lastMessageAt: new Date("2026-05-15T16:00:00.000Z")
      }
    }),
    prisma.conversation.create({
      data: {
        citizenId: citizenC.id,
        mandateId,
        status: ConversationStatus.CLOSED,
        lastMessageAt: new Date("2026-05-14T11:10:00.000Z")
      }
    })
  ]);

  await prisma.message.createMany({
    data: [
      {
        conversationId: conversationA.id,
        externalMessageId: "wamid.seed.1",
        direction: MessageDirection.INBOUND,
        source: MessageSource.WHATSAPP,
        content: "Bom dia, o posto do bairro está sem vacina infantil desde semana passada.",
        createdAt: new Date("2026-05-15T14:20:00.000Z")
      },
      {
        conversationId: conversationA.id,
        externalMessageId: "wamid.seed.2",
        direction: MessageDirection.OUTBOUND,
        source: MessageSource.AI,
        content: "Recebemos sua mensagem e vamos registrar a demanda para acompanhamento.",
        createdAt: new Date("2026-05-15T14:21:00.000Z")
      },
      {
        conversationId: conversationB.id,
        externalMessageId: "wamid.seed.3",
        direction: MessageDirection.INBOUND,
        source: MessageSource.WHATSAPP,
        content: "A rua está com muitos buracos e o acesso de ônibus ficou ruim.",
        createdAt: new Date("2026-05-15T15:48:00.000Z")
      },
      {
        conversationId: conversationB.id,
        externalMessageId: "wamid.seed.4",
        direction: MessageDirection.OUTBOUND,
        source: MessageSource.HUMAN,
        content: "Encaminhamos sua solicitação para a equipe de infraestrutura.",
        createdAt: new Date("2026-05-15T16:00:00.000Z")
      },
      {
        conversationId: conversationC.id,
        externalMessageId: "wamid.seed.5",
        direction: MessageDirection.INBOUND,
        source: MessageSource.WHATSAPP,
        content: "Preciso de orientação sobre atualização do CadÚnico.",
        createdAt: new Date("2026-05-14T10:55:00.000Z")
      }
    ],
    skipDuplicates: true
  });

  await prisma.demand.createMany({
    data: [
      {
        mandateId,
        citizenId: citizenA.id,
        conversationId: conversationA.id,
        categoryId: saude.id,
        title: "Falta de vacina infantil em posto de saúde",
        description:
          "Cidadão relata ausência de vacina infantil no posto do bairro há mais de uma semana.",
        status: DemandStatus.NEW,
        priority: DemandPriority.HIGH,
        createdAt: new Date("2026-05-15T14:25:00.000Z"),
        updatedAt: new Date("2026-05-15T14:25:00.000Z")
      },
      {
        mandateId,
        citizenId: citizenB.id,
        conversationId: conversationB.id,
        categoryId: infraestrutura.id,
        title: "Buracos em via com circulação de ônibus",
        description:
          "Moradora solicita recuperação asfáltica em rua com fluxo de transporte coletivo.",
        status: DemandStatus.IN_PROGRESS,
        priority: DemandPriority.MEDIUM,
        createdAt: new Date("2026-05-15T15:55:00.000Z"),
        updatedAt: new Date("2026-05-16T09:00:00.000Z")
      },
      {
        mandateId,
        citizenId: citizenC.id,
        conversationId: conversationC.id,
        categoryId: assistencia.id,
        title: "Orientação para atualização do CadÚnico",
        description:
          "Pedido de informação sobre documentação e local de atendimento para atualização cadastral.",
        status: DemandStatus.RESOLVED,
        priority: DemandPriority.LOW,
        createdAt: new Date("2026-05-14T11:05:00.000Z"),
        updatedAt: new Date("2026-05-14T13:20:00.000Z")
      }
    ]
  });
}

async function main() {
  const mandateId = "seed-mandate-gabinete-conectado";
  const email = "admin@gabinete.com";
  const password = "admin123";
  const name = "Administrador Gabinete";
  const mandateName = "Gabinete Conectado";
  const politicianName = "Vereador Demo";
  const city = "Manaus";
  const state = "AM";
  const whatsappNumber = process.env.SEED_WHATSAPP_NUMBER ?? "+5500000000000";
  const aiPrompt =
    process.env.SEED_AI_PROMPT ??
    "Você é a assistente institucional do gabinete. Responda com clareza, acolhimento e objetividade. Identifique demandas públicas e resuma os pontos acionáveis.";
  const includeSampleData = parseBoolean(process.env.SEED_INCLUDE_SAMPLE_DATA);

  const passwordHash = await hashPassword(password);
  const mandate = await prisma.mandate.upsert({
    where: {
      id: mandateId
    },
    update: {
      name: mandateName,
      politicianName,
      city,
      state,
      whatsappNumber,
      aiPrompt
    },
    create: {
      id: mandateId,
      name: mandateName,
      politicianName,
      city,
      state,
      whatsappNumber,
      aiPrompt
    }
  });

  await prisma.user.upsert({
    where: {
      email
    },
    update: {
      name,
      passwordHash,
      role: Role.ADMIN,
      mandateId: mandate.id
    },
    create: {
      name,
      email,
      passwordHash,
      role: Role.ADMIN,
      mandateId: mandate.id
    }
  });

  await ensureMandateDefaults(mandate.id);
  await ensureCampaignDefaults(mandate.id);
  await seedCampaignData(mandate.id);

  if (includeSampleData) {
    await seedSampleData(mandate.id);
  }

  console.log("===================================");
  console.log("ADMIN CRIADO");
  console.log(`Email: ${email}`);
  console.log(`Senha: ${password}`);
  console.log("===================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
