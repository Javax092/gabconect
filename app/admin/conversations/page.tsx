import Link from "next/link";
import {
  ChevronRight,
  Clock3,
  MessageSquareText,
  Phone,
  ShieldAlert,
  UserCheck
} from "lucide-react";
import { AIActionType, ConversationStatus } from "@prisma/client";

import { DemoConversationsPage } from "@/components/demo/demo-pages";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function ConversationsPage() {
  if (isDemoMode()) {
    return <DemoConversationsPage />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      mandateId: user.mandateId
    },
    include: {
      citizen: true,
      messages: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: [{ status: "desc" }, { lastMessageAt: "desc" }]
  });

  const waitingHuman = conversations.filter(
    (conversation) => conversation.status === ConversationStatus.HUMAN
  ).length;
  const triage = conversations.filter((conversation) => conversation.status === ConversationStatus.OPEN).length;
  const closed = conversations.filter((conversation) => conversation.status === ConversationStatus.CLOSED).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Central de conversas"
        description="Fila operacional com contexto, risco, janela Meta e supervisão humana em cada conversa."
        icon={<MessageSquareText className="h-5 w-5" />}
        aside={
          <div className="grid gap-3 sm:grid-cols-3">
            <CounterCard label="Total" value={String(conversations.length)} />
            <CounterCard label="Aguardando humano" value={String(waitingHuman)} tone="alert" />
            <CounterCard label="Encerradas" value={String(closed)} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard
          title="Conversas em triagem"
          value={String(triage)}
          description="Fluxo ainda sob acompanhamento da IA assistiva."
        />
        <InsightCard
          title="Aguardando humano"
          value={String(waitingHuman)}
          description="Casos sensíveis, estratégicos ou com necessidade de assessor."
          tone="alert"
        />
        <InsightCard
          title="Histórico organizado"
          value="100%"
          description="Origem, status, fila e última decisão ficam disponíveis para a equipe."
        />
      </div>

      <SectionCard>
        <div className="flex items-center gap-3 border-b border-slate-200 px-1 pb-4">
          <MessageSquareText className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-950">Fila de atendimento</h2>
        </div>

        {conversations.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              title="Nenhuma conversa registrada"
              description="As novas interações do WhatsApp aparecerão aqui para triagem, acompanhamento e resposta do gabinete."
              icon={<MessageSquareText className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {conversations.map((conversation) => {
              const lastMessage = conversation.messages[0];
              const needsHuman = conversation.status === ConversationStatus.HUMAN;
              const lastActionLabel: Record<AIActionType, string> = {
                RESPOND: "Resposta assistiva",
                WAIT_HUMAN: "Aguardar humano",
                REQUEST_CONTEXT: "Pedir contexto",
                USE_TEMPLATE: "Template",
                ESCALATE: "Escalar",
                BLOCK: "Bloquear"
              };

              return (
                <Link
                  key={conversation.id}
                  href={`/admin/conversations/${conversation.id}`}
                  className={`block rounded-[28px] border p-5 transition hover:bg-white ${
                    needsHuman
                      ? "border-amber-200 bg-amber-50/80 hover:border-amber-300"
                      : "border-slate-200 bg-slate-50 hover:border-brand-200"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-base font-semibold text-slate-950">
                          {conversation.citizen.name}
                        </p>
                        <StatusBadge status={conversation.status} />
                        <RiskBadge label={conversation.aiPaused ? "IA pausada" : "IA ativa"} />
                        {!conversation.metaWindowOpen ? <RiskBadge label="Janela expirada" tone="amber" /> : null}
                        {conversation.sensitive ? <RiskBadge label="Sensível" tone="rose" /> : null}
                        {conversation.riskScore >= 60 ? <RiskBadge label="Alto risco" tone="amber" /> : null}
                        {needsHuman ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Prioridade para assessor
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {conversation.citizen.phone}
                        </span>
                        <span>Fila: {conversation.currentQueue}</span>
                        <span>
                          Última ação IA: {conversation.lastAIAction ? lastActionLabel[conversation.lastAIAction] : "Sem decisão"}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="h-4 w-4" />
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short"
                          }).format(conversation.lastMessageAt)}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        {lastMessage?.content ?? "Sem mensagens ainda."}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-3 lg:items-end">
                      <span className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                        <UserCheck className="h-4 w-4" />
                        {needsHuman ? "Assumir atendimento" : "Abrir conversa"}
                      </span>
                      <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
                        Ver histórico
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function RiskBadge({
  label,
  tone = "default"
}: {
  label: string;
  tone?: "default" | "amber" | "rose";
}) {
  const className =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-cyan-200 bg-cyan-50 text-cyan-700";

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function CounterCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className={`rounded-[22px] border px-5 py-4 text-sm font-medium ${
        tone === "alert"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  tone = "default"
}: {
  title: string;
  value: string;
  description: string;
  tone?: "default" | "alert";
}) {
  return (
    <article
      className={`rounded-[28px] border p-5 shadow-soft ${
        tone === "alert"
          ? "border-amber-200 bg-amber-50/80"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-4 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}
