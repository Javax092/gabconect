import Link from "next/link";
import { AIActionType, ConversationStatus } from "@prisma/client";
import { Clock3, MessageSquareText, ShieldAlert, Waypoints } from "lucide-react";

import { DemoDashboardPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";
import { getQueueHealth } from "@/lib/queue";

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Sem janela ativa";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

const actionLabel: Record<AIActionType, string> = {
  RESPOND: "Resposta assistiva",
  WAIT_HUMAN: "Aguardar humano",
  REQUEST_CONTEXT: "Pedir contexto",
  USE_TEMPLATE: "Template aprovado",
  ESCALATE: "Escalação humana",
  BLOCK: "Bloqueio preventivo"
};

export default async function AdminPage() {
  if (isDemoMode()) {
    return <DemoDashboardPage />;
  }

  const user = await requireUser();

  console.info("[admin] usuario autenticado na dashboard", {
    userId: user.id,
    role: user.role,
    mandateId: user.mandateId
  });

  const [conversations, activeTakeovers, approvedTemplates, latestCompliance, queueHealth, queueCount, aiActions] = await Promise.all([
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
      take: 8
    }),
    prisma.humanTakeover.count({
      where: {
        mandateId: user.mandateId,
        active: true
      }
    }),
    prisma.messageTemplate.count({
      where: {
        mandateId: user.mandateId,
        approved: true
      }
    }),
    prisma.complianceLog.findMany({
      where: { mandateId: user.mandateId },
      orderBy: { createdAt: "desc" },
      take: 4
    }),
    getQueueHealth(),
    prisma.messageQueue.count({
      where: {
        mandateId: user.mandateId,
        status: "PENDING"
      }
    }),
    prisma.aIAction.findMany({
      where: {
        mandateId: user.mandateId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 4
    })
  ]);

  const humanQueue = conversations.filter((item) => item.status === ConversationStatus.HUMAN).length;
  const openConversations = conversations.filter((item) => item.status === ConversationStatus.OPEN).length;
  const pausedConversations = conversations.filter((item) => item.aiPaused).length;
  const avgRisk =
    conversations.length > 0
      ? Math.round(conversations.reduce((total, item) => total + item.riskScore, 0) / conversations.length)
      : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-cyan-400/15 bg-[linear-gradient(135deg,_rgba(8,15,29,0.96)_0%,_rgba(15,23,42,0.94)_60%,_rgba(14,116,144,0.28)_100%)] p-7 shadow-[0_24px_70px_rgba(3,7,18,0.45)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              Infraestrutura segura de atendimento inteligente para WhatsApp
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Conversas primeiro. Risco sob controle.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              WhatsApp é a interface. A inteligência acontece no backend. A IA apoia a triagem e
              o roteamento, enquanto a equipe mantém o controle das decisões sensíveis.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <HeroPill label="Fila humana" value={String(humanQueue)} />
            <HeroPill label="Takeovers ativos" value={String(activeTakeovers)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Mensagens na fila" value={String(queueCount)} icon={<MessageSquareText className="h-5 w-5" />} />
        <MetricCard label="Conversas abertas" value={String(openConversations)} icon={<MessageSquareText className="h-5 w-5" />} />
        <MetricCard label="IA pausada" value={String(pausedConversations)} icon={<ShieldAlert className="h-5 w-5" />} />
        <MetricCard label="Risco médio" value={String(avgRisk)} icon={<Waypoints className="h-5 w-5" />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Fila operacional</p>
              <p className="mt-1 text-sm text-slate-400">Conversas com contexto, risco e estado de supervisão.</p>
            </div>
            <Link href="/admin/conversations" className="text-sm font-medium text-cyan-300">
              Abrir central
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/admin/conversations/${conversation.id}`}
                className="block rounded-[24px] border border-white/10 bg-slate-950/55 px-4 py-4 transition hover:border-cyan-400/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{conversation.citizen.name}</p>
                  <Badge>{conversation.status === "HUMAN" ? "Humano ativo" : "IA ativa"}</Badge>
                  {!conversation.metaWindowOpen ? <Badge tone="amber">Janela expirada</Badge> : null}
                  {conversation.sensitive ? <Badge tone="rose">Sensível</Badge> : null}
                  {conversation.riskScore >= 60 ? <Badge tone="amber">Alto risco</Badge> : null}
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                  {conversation.messages[0]?.content ?? "Aguardando histórico inicial."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>Fila: {conversation.currentQueue}</span>
                  <span>Janela: {formatDateTime(conversation.conversationWindowExpiresAt)}</span>
                  <span>
                    Última ação IA: {conversation.lastAIAction ? actionLabel[conversation.lastAIAction] : "Sem decisão"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-white">Compliance recente</h2>
            </div>
            <div className="mt-4 space-y-3">
              {latestCompliance.map((entry) => (
                <div key={entry.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{entry.actionTaken}</p>
                    <span className="text-xs text-slate-400">Risco {Math.round(entry.riskScore)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Infraestrutura</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Status WhatsApp: webhook ativo</p>
              <p>Status Redis: {queueHealth.redis}</p>
              <p>Status Queue: {queueHealth.queues}</p>
              <p>Templates aprovados: {approvedTemplates}</p>
              <p className="text-slate-400">{queueHealth.reason}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Últimas ações da IA</h2>
            <div className="mt-4 space-y-3">
              {aiActions.map((entry) => (
                <div key={entry.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{actionLabel[entry.actionType]}</p>
                    <span className="text-xs text-slate-400">{Math.round(entry.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5">
            <p className="text-sm font-semibold text-emerald-100">Arquitetura operacional</p>
            <p className="mt-3 text-sm leading-7 text-emerald-50/90">
              WhatsApp Cloud API → Webhook → Queue Layer → Compliance Layer → Intent Detection →
              AI Decision Engine → Humanizer Layer → Human Escalation → WhatsApp Sender
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3 text-cyan-300">
        {icon}
        <p className="text-sm text-slate-300">{label}</p>
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
    </article>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "amber" | "rose" }) {
  const className =
    tone === "amber"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : tone === "rose"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
        : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}
