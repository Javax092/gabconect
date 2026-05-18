import Link from "next/link";
import { Megaphone, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { CampaignSettingsManager } from "@/components/campaigns/campaign-settings-manager";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function CampaignSettingsPage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Campanhas"
          title="Configurações de campanhas"
          description="Disponível apenas fora do modo demonstração, porque depende de templates oficiais e contatos reais com opt-in."
          icon={<Settings2 className="h-5 w-5" />}
        />
      </div>
    );
  }

  const user = await requireUser();
  const [settings, templates] = await Promise.all([
    getCampaignSettings(user.mandateId),
    prisma.whatsAppTemplate.findMany({
      where: {
        mandateId: user.mandateId
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas"
        title="Configuração inicial de campanhas"
        description="Cadastre templates oficiais e defina padrões seguros de pacing para novas campanhas sem alterar código nem credenciais."
        icon={<Megaphone className="h-5 w-5" />}
        aside={
          <Link href="/admin/campaigns" className={buttonVariants("secondary") + " w-full"}>
            Voltar para campanhas
          </Link>
        }
      />

      <CampaignSettingsManager
        initialSettings={{
          defaultDailyLimit: settings.defaultDailyLimit,
          defaultDelaySeconds: settings.defaultDelaySeconds,
          maxConsecutiveFailures: settings.maxConsecutiveFailures
        }}
        initialTemplates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          metaTemplateName: template.metaTemplateName,
          language: template.language,
          category: template.category,
          status: template.status,
          body: template.body,
          updatedAt: template.updatedAt.toISOString()
        }))}
      />
    </div>
  );
}
