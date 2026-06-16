import assert from "node:assert/strict";
import test from "node:test";

import {
  CampaignMode,
  CampaignRecipientStatus,
  CampaignStatus,
  ContactStatus,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { suppressContact } from "@/lib/consent";
import { prisma } from "@/lib/prisma";
import { runSendGate } from "@/lib/send-gate";
import { isPermanentMetaError } from "@/lib/whatsapp";

process.env.WHATSAPP_MASS_CAMPAIGN_ENABLED = "true";
process.env.WHATSAPP_DRY_RUN = "true";
process.env.MAX_SENDS_PER_DAY = "500";
process.env.SKIP_AUDIENCE_VALIDATION = "true";

const now = new Date(2026, 5, 13, 10, 0, 0);

async function createScenario(input?: {
  campaignStatus?: CampaignStatus;
  contactStatus?: ContactStatus;
  optIn?: boolean;
  templateStatus?: WhatsAppTemplateStatus;
  dailyLimit?: number;
  recipientStatus?: CampaignRecipientStatus;
}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const mandate = await prisma.mandate.create({
    data: {
      name: `Teste Send Gate ${suffix}`,
      politicianName: "Teste",
      city: "Manaus",
      state: "AM",
      whatsappNumber: `559299${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
      aiPrompt: "Prompt de teste com conteúdo suficiente para validação."
    }
  });
  const contact = await prisma.contact.create({
    data: {
      mandateId: mandate.id,
      name: "Contato Teste",
      phone: `559298${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
      source: "test",
      optIn: input?.optIn ?? true,
      optInAt: input?.optIn === false ? null : now,
      tags: [],
      status: input?.contactStatus ?? ContactStatus.ACTIVE
    }
  });
  const template = await prisma.whatsAppTemplate.create({
    data: {
      mandateId: mandate.id,
      name: "Template Teste",
      category: WhatsAppTemplateCategory.MARKETING,
      language: "pt_BR",
      body: "Mensagem de teste aprovada.",
      metaTemplateName: `template_teste_${suffix.replace(/[^a-zA-Z0-9]/g, "_")}`,
      status: input?.templateStatus ?? WhatsAppTemplateStatus.APPROVED
    }
  });
  const campaign = await prisma.campaign.create({
    data: {
      mandateId: mandate.id,
      name: "Campanha Teste",
      templateId: template.id,
      segmentTags: [],
      campaignMode: CampaignMode.TEST,
      status: input?.campaignStatus ?? CampaignStatus.RUNNING,
      dailyLimit: input?.dailyLimit ?? 50,
      delaySeconds: 25
    }
  });
  const recipient = await prisma.campaignRecipient.create({
    data: {
      campaignId: campaign.id,
      contactId: contact.id,
      status: input?.recipientStatus ?? CampaignRecipientStatus.QUEUED,
      queuedAt: now
    }
  });

  return { mandate, contact, template, campaign, recipient };
}

async function cleanup(mandateId: string) {
  await prisma.mandate.delete({
    where: {
      id: mandateId
    }
  });
}

test("send gate permite opt-out de campanha quando bypass de audiência está ativo", async () => {
  const scenario = await createScenario();

  try {
    await suppressContact({
      mandateId: scenario.mandate.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      reason: "Teste de suppression list.",
      source: "TEST"
    });

    const result = await runSendGate({
      mandateId: scenario.mandate.id,
      campaignId: scenario.campaign.id,
      campaignRecipientId: scenario.recipient.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      templateId: scenario.template.id,
      templateName: scenario.template.metaTemplateName,
      kind: "CAMPAIGN",
      dryRun: true,
      now
    });

    assert.equal(result.allowed, true);
  } finally {
    await cleanup(scenario.mandate.id);
  }
});

test("send gate volta a bloquear opt-out de campanha quando bypass de audiência é desativado", async () => {
  const previous = process.env.SKIP_AUDIENCE_VALIDATION;
  process.env.SKIP_AUDIENCE_VALIDATION = "false";
  const scenario = await createScenario();

  try {
    await suppressContact({
      mandateId: scenario.mandate.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      reason: "Teste de suppression list.",
      source: "TEST"
    });

    const result = await runSendGate({
      mandateId: scenario.mandate.id,
      campaignId: scenario.campaign.id,
      campaignRecipientId: scenario.recipient.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      templateId: scenario.template.id,
      templateName: scenario.template.metaTemplateName,
      kind: "CAMPAIGN",
      dryRun: true,
      now
    });

    assert.equal(result.allowed, false);
    assert.equal(result.allowed ? "" : result.status, "OPT_OUT");
  } finally {
    process.env.SKIP_AUDIENCE_VALIDATION = previous;
    await cleanup(scenario.mandate.id);
  }
});

test("send gate bloqueia campanha pausada antes do job rodar", async () => {
  const scenario = await createScenario({
    campaignStatus: CampaignStatus.PAUSED
  });

  try {
    const result = await runSendGate({
      mandateId: scenario.mandate.id,
      campaignId: scenario.campaign.id,
      campaignRecipientId: scenario.recipient.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      templateId: scenario.template.id,
      templateName: scenario.template.metaTemplateName,
      kind: "CAMPAIGN",
      dryRun: true,
      now
    });

    assert.equal(result.allowed, false);
    assert.equal(result.allowed ? "" : result.status, "CANCELLED");
  } finally {
    await cleanup(scenario.mandate.id);
  }
});

test("classifica erro permanente da Meta", () => {
  assert.equal(isPermanentMetaError({ status: 400, code: 132001 }), true);
  assert.equal(isPermanentMetaError({ status: 400, code: 100 }), true);
});

test("classifica erro temporário da Meta", () => {
  assert.equal(isPermanentMetaError({ status: 500, code: 2 }), false);
  assert.equal(isPermanentMetaError({ status: 429, code: 4 }), false);
});

test("send gate bloqueia limite diário da campanha", async () => {
  const scenario = await createScenario({
    dailyLimit: 1
  });

  try {
    const sentContact = await prisma.contact.create({
      data: {
        mandateId: scenario.mandate.id,
        name: "Contato Ja Enviado",
        phone: `559297${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
        source: "test",
        optIn: true,
        optInAt: now,
        tags: [],
        status: ContactStatus.ACTIVE
      }
    });

    await prisma.campaignRecipient.create({
      data: {
        campaignId: scenario.campaign.id,
        contactId: sentContact.id,
        status: CampaignRecipientStatus.SENT,
        sentAt: now
      }
    });

    const result = await runSendGate({
      mandateId: scenario.mandate.id,
      campaignId: scenario.campaign.id,
      campaignRecipientId: scenario.recipient.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      templateId: scenario.template.id,
      templateName: scenario.template.metaTemplateName,
      kind: "CAMPAIGN",
      dryRun: true,
      now
    });

    assert.equal(result.allowed, false);
    assert.equal(result.allowed ? "" : result.status, "RATE_LIMITED");
  } finally {
    await cleanup(scenario.mandate.id);
  }
});

test("send gate bloqueia template não aprovado", async () => {
  const scenario = await createScenario({
    templateStatus: WhatsAppTemplateStatus.PENDING
  });

  try {
    const result = await runSendGate({
      mandateId: scenario.mandate.id,
      campaignId: scenario.campaign.id,
      campaignRecipientId: scenario.recipient.id,
      contactId: scenario.contact.id,
      phone: scenario.contact.phone,
      templateId: scenario.template.id,
      templateName: scenario.template.metaTemplateName,
      kind: "CAMPAIGN",
      dryRun: true,
      now
    });

    assert.equal(result.allowed, false);
    assert.equal(result.allowed ? "" : result.status, "BLOCKED");
  } finally {
    await cleanup(scenario.mandate.id);
  }
});
