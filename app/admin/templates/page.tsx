import { Stamp } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { DemoTemplatesPage } from "@/components/demo/demo-pages";
import { TemplatesManager } from "@/components/templates/templates-manager";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function TemplatesPage() {
  if (isDemoMode()) {
    return <DemoTemplatesPage />;
  }

  const user = await requireUser();

  const templates = await prisma.messageTemplate.findMany({
    where: {
      mandateId: user.mandateId
    },
    orderBy: [{ approved: "desc" }, { updatedAt: "desc" }]
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Templates"
        title="Templates oficiais"
        description="Mensagens aprovadas para uso seguro fora da janela de 24h ou em fluxos supervisionados."
        icon={<Stamp className="h-5 w-5" />}
      />

      <TemplatesManager
        initialTemplates={templates.map((template) => ({
          ...template,
          updatedAt: template.updatedAt.toISOString()
        }))}
      />
    </div>
  );
}
