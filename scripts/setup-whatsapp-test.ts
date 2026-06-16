import { config } from "dotenv";
import { ContactStatus, WhatsAppTemplateCategory, WhatsAppTemplateStatus } from "@prisma/client";

import { prisma } from "../lib/prisma";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const DEFAULT_TEST_PHONE = "5592986352761";
const DEFAULT_ADMIN_EMAIL = "admin@gabinete.com";
const TEST_CONTACT_SOURCE = "WHATSAPP_TEST";
const TEMPLATE_NAME = "Teste WhatsApp";
const META_TEMPLATE_NAME = "hello_world";
const TEMPLATE_LANGUAGE = "en_US";
const TEMPLATE_BODY = "Hello World";

function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function requireValue(value: string | undefined, message: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

async function main() {
  process.env.WHATSAPP_DRY_RUN ??= "true";

  const phone = requireValue(
    normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT_PHONE || DEFAULT_TEST_PHONE),
    "WHATSAPP_TEST_RECIPIENT_PHONE inválido."
  );
  const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: adminEmail },
    select: {
      id: true,
      name: true,
      email: true,
      mandateId: true,
      mandate: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!user) {
    throw new Error(`Usuário admin não encontrado: ${adminEmail}.`);
  }

  if (!user.mandateId) {
    throw new Error(`Usuário admin ${user.email} não possui mandateId.`);
  }

  const contact = await prisma.contact.upsert({
    where: {
      mandateId_phone: {
        mandateId: user.mandateId,
        phone,
      },
    },
    update: {
      source: TEST_CONTACT_SOURCE,
      optIn: true,
      optInAt: new Date(),
      status: ContactStatus.ACTIVE,
      name: "Teste WhatsApp",
      tags: [],
    },
    create: {
      mandateId: user.mandateId,
      phone,
      name: "Teste WhatsApp",
      source: TEST_CONTACT_SOURCE,
      optIn: true,
      optInAt: new Date(),
      status: ContactStatus.ACTIVE,
      tags: [],
    },
  });

  const template = await prisma.whatsAppTemplate.upsert({
    where: {
      mandateId_metaTemplateName_language: {
        mandateId: user.mandateId,
        metaTemplateName: META_TEMPLATE_NAME,
        language: TEMPLATE_LANGUAGE,
      },
    },
    update: {
      name: TEMPLATE_NAME,
      status: WhatsAppTemplateStatus.APPROVED,
      category: WhatsAppTemplateCategory.UTILITY,
      body: TEMPLATE_BODY,
    },
    create: {
      mandateId: user.mandateId,
      name: TEMPLATE_NAME,
      metaTemplateName: META_TEMPLATE_NAME,
      language: TEMPLATE_LANGUAGE,
      status: WhatsAppTemplateStatus.APPROVED,
      category: WhatsAppTemplateCategory.UTILITY,
      body: TEMPLATE_BODY,
    },
  });

  console.log("Admin encontrado:", {
    id: user.id,
    email: user.email,
    mandateId: user.mandateId,
    mandate: user.mandate.name,
  });
  console.log("Contato criado/atualizado:", {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    optIn: contact.optIn,
    status: contact.status,
    source: contact.source,
  });
  console.log("Template criado/atualizado:", {
    id: template.id,
    name: template.name,
    metaTemplateName: template.metaTemplateName,
    language: template.language,
    status: template.status,
    category: template.category,
  });
  console.log("Dry-run seguro:", process.env.WHATSAPP_DRY_RUN !== "false");
  console.log("\nComando curl para testar:");
  console.log(`curl -s -X POST http://localhost:3000/api/whatsapp/test-send \\
  -H "Content-Type: application/json" \\
  -H "x-internal-test-token: ${process.env.INTERNAL_TEST_TOKEN || "flowtech_teste_local_2026"}" \\
  -d '{"confirmed":true}' | jq`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
