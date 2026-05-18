import { Stamp } from "lucide-react";

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
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <Stamp className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">Templates oficiais</p>
            <p className="mt-1 text-sm text-slate-400">
              Mensagens aprovadas para uso seguro fora da janela de 24h ou em fluxos supervisionados.
            </p>
          </div>
        </div>
      </section>

      <TemplatesManager
        initialTemplates={templates.map((template) => ({
          ...template,
          updatedAt: template.updatedAt.toISOString()
        }))}
      />
    </div>
  );
}
