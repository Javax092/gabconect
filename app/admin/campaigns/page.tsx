import Link from "next/link";
import { Megaphone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { CampaignsManager } from "@/components/campaigns/campaigns-manager";
import { requireUser } from "@/lib/auth";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { isDemoMode } from "@/lib/demo";
import { countEligibleContacts } from "@/lib/whatsapp-campaigns";
import { prisma } from "@/lib/prisma";

export default async function CampaignsPage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Campanhas"
          title="Campanhas WhatsApp oficiais"
          description="Disponível apenas fora do modo demonstração, porque depende de templates aprovados, contatos opt-in e credenciais reais da Meta."
          icon={<Megaphone className="h-5 w-5" />}
        />
        <SectionCard>
          <p className="text-sm leading-7 text-slate-600">
            Saia do modo demo para cadastrar contatos com opt-in, templates oficiais e operar campanhas pela WhatsApp Business Platform.
          </p>
        </SectionCard>
      </div>
    );
  }

  const user = await requireUser();

  const [templates, campaigns, contacts, settings] = await Promise.all([
    prisma.whatsAppTemplate.findMany({
      where: {
        mandateId: user.mandateId,
        status: "APPROVED"
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    prisma.campaign.findMany({
      where: {
        mandateId: user.mandateId
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true
          }
        },
        recipients: {
          select: {
            status: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.contact.findMany({
      where: {
        mandateId: user.mandateId
      },
      select: {
        tags: true
      }
    }),
    getCampaignSettings(user.mandateId)
  ]);

  const availableTags = [...new Set(contacts.flatMap((contact) => contact.tags).filter(Boolean))].sort();
  const initialEligibleCount = await countEligibleContacts(user.mandateId, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas"
        title="Campanhas WhatsApp oficiais"
        description="Transmissões controladas com opt-in obrigatório, templates aprovados, pacing operacional e rastreabilidade completa de resposta e reputação."
        icon={<Megaphone className="h-5 w-5" />}
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              Somente WhatsApp Business Platform e templates aprovados.
            </div>
            <Link
              href="/admin/campaigns/settings"
              className={buttonVariants("secondary") + " w-full"}
            >
              Configurações de campanhas
            </Link>
          </div>
        }
      />

      <SectionCard className="bg-[linear-gradient(180deg,_#fff7ed_0%,_#ffffff_100%)]">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard title="Templates aprovados" value={templates.length} />
          <InfoCard title="Campanhas criadas" value={campaigns.length} />
          <InfoCard title="Contatos elegíveis hoje" value={initialEligibleCount} />
        </div>
        <div className="mt-5 space-y-2 text-sm leading-7 text-slate-600">
          <p>Campanhas não enviam mensagem livre. Todo envio usa template aprovado na Meta.</p>
          <p>Contatos com status `UNSUBSCRIBED`, `BLOCKED` ou `INVALID` ficam fora automaticamente.</p>
          <p>Respostas como `SAIR`, `PARAR`, `CANCELAR` e `STOP` geram descadastro imediato via webhook.</p>
        </div>
      </SectionCard>

      <CampaignsManager
        initialCampaigns={campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          templateId: campaign.templateId,
          segmentTags: campaign.segmentTags,
          status: campaign.status,
          dailyLimit: campaign.dailyLimit,
          delaySeconds: campaign.delaySeconds,
          scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
          sentCount: campaign.sentCount,
          failedCount: campaign.failedCount,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          template: {
            ...campaign.template
          },
          stats: {
            PENDING: campaign.recipients.filter((recipient) => recipient.status === "PENDING").length,
            SENT: campaign.recipients.filter((recipient) => recipient.status === "SENT").length,
            FAILED: campaign.recipients.filter((recipient) => recipient.status === "FAILED").length,
            SKIPPED: campaign.recipients.filter((recipient) => recipient.status === "SKIPPED").length,
            UNSUBSCRIBED: campaign.recipients.filter((recipient) => recipient.status === "UNSUBSCRIBED").length,
            total: campaign.recipients.length
          }
        }))}
        templateOptions={templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          language: template.language,
          metaTemplateName: template.metaTemplateName,
          status: template.status
        }))}
        availableTags={availableTags}
        initialEligibleCount={initialEligibleCount}
        initialSettings={{
          defaultDailyLimit: settings.defaultDailyLimit,
          defaultDelaySeconds: settings.defaultDelaySeconds,
          maxConsecutiveFailures: settings.maxConsecutiveFailures
        }}
      />
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}
