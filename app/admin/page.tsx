import Link from "next/link";
import { Clock3, MessageSquareText, PlugZap, ShieldAlert, Users2, Waypoints } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { DemoDashboardPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { bootstrapCampaignEvents, ensureCampaignInfrastructure, getInfrastructureSnapshot } from "@/lib/campaign-infrastructure";
import { isDemoMode } from "@/lib/demo";
import { getOperationalReadiness } from "@/lib/operational-readiness";
import { prisma } from "@/lib/prisma";

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(typeof value === "string" ? new Date(value) : value);
}

export default async function AdminPage() {
  if (isDemoMode()) {
    return <DemoDashboardPage />;
  }

  const user = await requireUser();
  await ensureCampaignInfrastructure(user.mandateId, user.mandate.whatsappNumber);
  await bootstrapCampaignEvents(user.mandateId);

  const [readiness, ops, recentConversations, recentCompliance, activeCampaigns, humanPendings] = await Promise.all([
    getOperationalReadiness(user.mandateId),
    getInfrastructureSnapshot(user.mandateId, user.mandate.whatsappNumber),
    prisma.conversation.findMany({
      where: { mandateId: user.mandateId },
      include: {
        citizen: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ humanPriority: "desc" }, { lastMessageAt: "desc" }],
      take: 6
    }),
    prisma.complianceLog.findMany({
      where: { mandateId: user.mandateId },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.campaign.findMany({
      where: {
        mandateId: user.mandateId,
        status: {
          in: ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"]
        }
      },
      include: {
        operationState: true,
        template: true
      },
      orderBy: { updatedAt: "desc" },
      take: 5
    }),
    prisma.conversation.count({
      where: {
        mandateId: user.mandateId,
        OR: [{ status: "HUMAN" }, { humanTakeoverActive: true }, { humanPriority: true }]
      }
    })
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-cyan-400/15 bg-[linear-gradient(135deg,_rgba(8,15,29,0.96)_0%,_rgba(15,23,42,0.94)_60%,_rgba(14,116,144,0.18)_100%)] p-7 shadow-[0_24px_70px_rgba(3,7,18,0.45)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              Central operacional
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Operação do WhatsApp pronta para revisão, fila e envio supervisionado.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Acompanhe status do canal, workers, campanhas ativas, conversas recentes,
              pendências humanas e sinais de compliance em uma única visão.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/admin/campaigns" className={buttonVariants("primary")}>
                Criar operação
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
            <HeroPill label="Modo atual" value={readiness.mode === "SIMULACAO" ? "Modo simulação" : "Envio real"} />
            <HeroPill label="Worker outgoing" value={readiness.outgoingWorkerReady ? "Online" : "Sem heartbeat"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Status WhatsApp" value={readiness.webhook.configured ? "Webhook pronto" : "Webhook pendente"} icon={<PlugZap className="h-5 w-5" />} />
        <MetricCard label="Fila de envio" value={String(readiness.queueSummary.queued)} icon={<Waypoints className="h-5 w-5" />} />
        <MetricCard label="Pendências humanas" value={String(humanPendings)} icon={<Users2 className="h-5 w-5" />} />
        <MetricCard label="Risco atual" value={`${ops.metrics.spamProbability}%`} icon={<ShieldAlert className="h-5 w-5" />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Conversas recentes</p>
              <p className="mt-1 text-sm text-slate-400">Estado do atendimento, fila atual e risco percebido.</p>
            </div>
            <Link href="/admin/conversations" className="text-sm font-medium text-cyan-300">
              Abrir central
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {recentConversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/admin/conversations/${conversation.id}`}
                className="block rounded-[24px] border border-white/10 bg-slate-950/55 px-4 py-4 transition hover:border-cyan-400/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{conversation.citizen.name}</p>
                  <Badge>{conversation.status === "HUMAN" ? "Humano ativo" : "IA ativa"}</Badge>
                  {conversation.humanPriority ? <Badge tone="amber">Pendência humana</Badge> : null}
                  {conversation.riskScore >= 60 ? <Badge tone="rose">Risco elevado</Badge> : null}
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                  {conversation.messages[0]?.content ?? "Sem histórico recente."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>Fila: {conversation.currentQueue}</span>
                  <span>Última mensagem: {formatDateTime(conversation.lastMessageAt)}</span>
                  <span>Janela Meta: {conversation.metaWindowOpen ? "aberta" : "encerrada"}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-white">Status operacional</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Modo atual: {readiness.mode === "SIMULACAO" ? "Modo simulação" : "Envio real"}</p>
              <p>Redis: {readiness.queueHealth.redis}</p>
              <p>Filas: {readiness.queueHealth.queues}</p>
              <p>Outgoing worker: {readiness.outgoingWorkerReady ? "online" : "sem heartbeat recente"}</p>
              <p>Último webhook: {formatDateTime(readiness.latestInboundMessage?.createdAt ?? null)}</p>
              <p>Último envio: {formatDateTime(readiness.latestDelivery?.createdAt ?? null)}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Campanhas ativas</h2>
            <div className="mt-4 space-y-3">
              {activeCampaigns.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma operação ativa no momento.</p>
              ) : (
                activeCampaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{campaign.name}</p>
                      <span className="text-xs text-slate-400">{campaign.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{campaign.template.name}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Fila: {campaign.operationState?.pipelineStage ?? "sem estado"} • Risco {campaign.operationState?.riskScore ?? 0}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold text-white">Compliance e riscos</h2>
          </div>
          <div className="mt-4 space-y-3">
            {recentCompliance.map((entry) => (
              <div key={entry.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{entry.actionTaken}</p>
                  <span className="text-xs text-slate-400">{formatDateTime(entry.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-3">
            <MessageSquareText className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold text-white">Checklist de prontidão</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {readiness.envChecklist.map((item) => (
              <div key={item.key} className="rounded-[20px] border border-white/10 bg-slate-950/55 px-4 py-4">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="mt-1 text-sm text-slate-400">{item.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3 text-cyan-300">{icon}</div>
      <p className="mt-3 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </article>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "rose" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : tone === "rose"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.05] text-slate-300";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}
