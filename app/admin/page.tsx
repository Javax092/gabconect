import dynamic from "next/dynamic";
import Link from "next/link";
import { BrainCircuit, Cake, Megaphone, PlugZap, ShieldAlert, Star, Users2, Waypoints } from "lucide-react";
import { CampaignStatus, WhatsAppMessageLogStatus } from "@prisma/client";

import { DashboardDeferredSkeleton } from "@/components/admin/dashboard-deferred-skeleton";
import { EmptyState } from "@/components/admin/empty-state";
import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { getCachedAdminDashboardOverview } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { getRelationshipHeatmap } from "@/lib/relationship-heatmap";

const DemoDashboardPage = dynamic(() =>
  import("@/components/demo/demo-pages").then((module) => module.DemoDashboardPage)
);

const DashboardDeferredBlocks = dynamic(
  () =>
    import("@/components/admin/dashboard-deferred-blocks").then(
      (module) => module.DashboardDeferredBlocks
    ),
  {
    loading: () => <DashboardDeferredSkeleton />
  }
);

export default async function AdminPage() {
  if (isDemoMode()) {
    return <DemoDashboardPage />;
  }

  const user = await requireUser();
  const [overview, contacts, activeCampaigns, sentMessages, awaitingCampaigns, heatmap] = await Promise.all([
    getCachedAdminDashboardOverview(user.mandateId),
    prisma.contact.findMany({
      where: { mandateId: user.mandateId },
      select: {
        id: true,
        name: true,
        birthday: true,
        influenceLevel: true,
        relationshipStatus: true,
        lastInteractionAt: true
      }
    }),
    prisma.campaign.count({
      where: {
        mandateId: user.mandateId,
        status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.RUNNING, CampaignStatus.PAUSED] }
      }
    }),
    prisma.whatsAppMessageLog.count({
      where: {
        mandateId: user.mandateId,
        status: {
          in: [
            WhatsAppMessageLogStatus.SENT,
            WhatsAppMessageLogStatus.DELIVERED,
            WhatsAppMessageLogStatus.READ,
            WhatsAppMessageLogStatus.SIMULATED_SENT
          ]
        }
      }
    }),
    prisma.campaign.findMany({
      where: {
        mandateId: user.mandateId,
        status: { in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.PAUSED] }
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true
      },
      orderBy: { updatedAt: "desc" },
      take: 3
    }),
    getRelationshipHeatmap(user.mandateId)
  ]);

  const totalContacts = contacts.length;
  const vipContacts = contacts.filter((contact) => contact.influenceLevel === "VIP").length;
  const relationshipPendings = contacts.filter(
    (contact) =>
      contact.relationshipStatus === "INACTIVE" &&
      (contact.influenceLevel === "VIP" || contact.influenceLevel === "HIGH")
  ).length;
  const criticalRegions = heatmap.filter((area) => area.heatScore >= 70).length;
  const today = new Date();
  const birthdays = contacts
    .filter(
      (contact) =>
        contact.birthday &&
        contact.birthday.getUTCDate() === today.getUTCDate() &&
        contact.birthday.getUTCMonth() === today.getUTCMonth()
    )
    .slice(0, 3);
  const highInfluenceContacts = contacts
    .filter((contact) => contact.influenceLevel === "VIP" || contact.influenceLevel === "HIGH")
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.14),_transparent_28%),linear-gradient(135deg,_#ffffff_0%,_#f7fbff_58%,_#edf6ff_100%)] p-7 shadow-soft ring-1 ring-white/70">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-700">
              GabineteConectado
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-slate-950">
              CRM político para operar relacionamento, campanhas e atendimento com controle.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Visão executiva do mandato: contatos estratégicos, regiões prioritárias, operação de WhatsApp e pendências humanas em uma única central.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/admin/campaigns" className={buttonVariants("primary")}>
                Criar campanha
              </Link>
              <Link href="/admin/campaigns/operations" className={buttonVariants("secondary")}>
                Acompanhar operação
              </Link>
              <Link href="/admin/whatsapp" className={buttonVariants("secondary")}>
                Revisar WhatsApp
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <HeroPill label="Modo atual" value={overview.mode === "SIMULACAO" ? "Modo simulação" : "Envio real"} />
            <HeroPill label="Worker outgoing" value={overview.outgoingWorkerReady ? "Online" : "Sem heartbeat"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Contatos cadastrados" value={totalContacts} icon={<Users2 className="h-5 w-5" />} tone="blue" />
        <MetricCard title="Campanhas ativas" value={activeCampaigns} icon={<Megaphone className="h-5 w-5" />} tone="teal" />
        <MetricCard title="Mensagens enviadas" value={sentMessages} icon={<PlugZap className="h-5 w-5" />} tone="teal" />
        <MetricCard title="Pendências" value={relationshipPendings} icon={<ShieldAlert className="h-5 w-5" />} tone="amber" />
        <MetricCard title="Regiões críticas" value={criticalRegions} icon={<Waypoints className="h-5 w-5" />} tone="rose" />
        <MetricCard title="Contatos VIP" value={vipContacts} icon={<Star className="h-5 w-5" />} tone="amber" />
      </section>

      <SectionCard
        title="Prioridades de hoje"
        description="Sinais práticos para o gabinete decidir onde agir primeiro."
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <PriorityPanel
            icon={<BrainCircuit className="h-5 w-5" />}
            title="Relacionamento estratégico"
            items={
              relationshipPendings > 0
                ? [`${relationshipPendings} lideranças ou VIPs estão inativos.`]
                : ["Nenhuma liderança crítica inativa identificada agora."]
            }
          />
          <PriorityPanel
            icon={<Cake className="h-5 w-5" />}
            title="Aniversariantes"
            items={
              birthdays.length > 0
                ? birthdays.map((contact) => contact.name)
                : ["Nenhum aniversariante encontrado para este mandato hoje."]
            }
          />
          <PriorityPanel
            icon={<Megaphone className="h-5 w-5" />}
            title="Campanhas aguardando ação"
            items={
              awaitingCampaigns.length > 0
                ? awaitingCampaigns.map((campaign) => `${campaign.name} · ${campaign.status}`)
                : ["Nenhuma campanha aguardando ação imediata."]
            }
          />
        </div>
        {highInfluenceContacts.length === 0 && totalContacts === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nenhum contato encontrado para este mandato ainda."
              description="Cadastre contatos e registre papéis comunitários para liberar priorização inteligente no painel."
            />
          </div>
        ) : null}
      </SectionCard>

      <DashboardDeferredBlocks />
    </div>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PriorityPanel({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3 text-brand-700">
        {icon}
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <p key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-600">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
