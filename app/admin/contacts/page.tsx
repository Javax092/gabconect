import { Database } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { ContactsManager } from "@/components/contacts/contacts-manager";
import { requireUser } from "@/lib/auth";
import { isValidPhone } from "@/lib/contacts";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function ContactsPage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Contatos"
          title="Base operacional de contatos"
          description="Disponível apenas fora do modo demonstração, com contatos reais e revisão de opt-in."
          icon={<Database className="h-5 w-5" />}
        />
      </div>
    );
  }

  const user = await requireUser();
  const contacts = await prisma.contact.findMany({
    where: {
      mandateId: user.mandateId
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contatos"
        title="Base operacional de contatos"
        description="Cadastre, importe e revise destinatários antes de criar uma operação de WhatsApp. Seleção manual continua tendo prioridade sobre filtros automáticos."
        icon={<Database className="h-5 w-5" />}
      />

      <ContactsManager
        initialContacts={contacts.map((contact) => ({
          ...contact,
          code: contact.id.slice(-8).toUpperCase(),
          invalidPhone: !isValidPhone(contact.phone),
          birthday: contact.birthday?.toISOString() ?? null,
          lastInteractionAt: contact.lastInteractionAt?.toISOString() ?? null,
          optInAt: contact.optInAt?.toISOString() ?? null,
          createdAt: contact.createdAt.toISOString(),
          updatedAt: contact.updatedAt.toISOString()
        }))}
      />
    </div>
  );
}
