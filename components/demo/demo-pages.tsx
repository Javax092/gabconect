"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Copy,
  MessageCircleMore,
  MessageSquareText,
  Phone,
  PlayCircle,
  Radar,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldUser,
  Sparkles,
  Stamp,
  UserCheck,
  UserRound
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoState } from "@/components/demo/demo-provider";
import { type DemoConversation, type DemoMessage, type DemoTemplate } from "@/lib/demo";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) {
    return "pendente";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short"
  }).format(new Date(value));
}

function statusLabel(status: DemoConversation["status"]) {
  if (status === "HUMAN") return "Aguardando humano";
  if (status === "CLOSED") return "Finalizada";
  return "IA ativa";
}

function actionLabel(action: DemoConversation["lastAIAction"]) {
  if (action === "ESCALATE") return "Escalada humana";
  if (action === "WAIT_HUMAN") return "Aguardar humano";
  if (action === "USE_TEMPLATE") return "Template aprovado";
  if (action === "BLOCK") return "Bloqueio preventivo";
  return "Resposta assistiva";
}

function sourceLabel(source: DemoMessage["source"]) {
  if (source === "WHATSAPP") return "Cidadao";
  if (source === "AI") return "IA";
  if (source === "HUMAN") return "Assessor";
  return "Template";
}

function sourceIcon(source: DemoMessage["source"]) {
  if (source === "WHATSAPP") return <Phone className="h-3.5 w-3.5" />;
  if (source === "AI") return <Bot className="h-3.5 w-3.5" />;
  if (source === "HUMAN") return <UserRound className="h-3.5 w-3.5" />;
  return <ShieldCheck className="h-3.5 w-3.5" />;
}

function toneForRisk(score: number) {
  if (score >= 80) return "rose";
  if (score >= 55) return "amber";
  return "cyan";
}

function clone<T>(value: T) {
  return structuredClone(value);
}

function DemoPill({
  children,
  tone = "default"
}: {
  children: ReactNode;
  tone?: "default" | "amber" | "rose" | "emerald";
}) {
  const className =
    tone === "amber"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : tone === "rose"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
        : tone === "emerald"
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function AvatarChip({ avatar, name, region }: { avatar: string; name: string; region: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_#0f172a_0%,_#155e75_100%)] text-sm font-semibold text-white shadow-soft">
        {avatar}
      </div>
      <div>
        <p className="font-semibold text-white">{name}</p>
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{region}</p>
      </div>
    </div>
  );
}

function DemoMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-400">{detail}</p> : null}
    </article>
  );
}

function MessageStatusTrack({ message }: { message: DemoMessage }) {
  if (message.direction !== "OUTBOUND") {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-400">
      <span>queued {formatTime(message.queuedAt)}</span>
      <span>sent {message.sentAt ? "✔" : "..."}</span>
      <span>delivered {message.deliveredAt ? "✔" : "..."}</span>
      <span>read {message.readAt ? "✔" : "..."}</span>
    </div>
  );
}

export function DemoDashboardPage() {
  const { data } = useDemoState();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[34px] border border-cyan-400/15 bg-[linear-gradient(135deg,_rgba(3,7,18,0.95)_0%,_rgba(8,15,29,0.96)_40%,_rgba(8,47,73,0.92)_100%)] p-7 shadow-[0_24px_70px_rgba(3,7,18,0.45)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              Infraestrutura segura de atendimento inteligente para WhatsApp
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Operacao viva para apresentacao comercial.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Filas, mensagens, IA, compliance e takeover humano aparecem em tempo real, sem depender de Meta, Redis, webhook ou OpenAI.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <HeroPill label="Fila humana" value={String(data.counters.humanQueue)} />
            <HeroPill label="Takeovers ativos" value={String(data.counters.activeTakeovers)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DemoMetric label="Mensagens na fila" value={String(data.counters.waitingMessages)} detail="Eventos sob simulacao ao vivo" />
        <DemoMetric label="Conversas abertas" value={String(data.counters.openConversations)} detail="IA ativa na triagem" />
        <DemoMetric label="IA pausada" value={String(data.counters.pausedConversations)} detail="Casos sensiveis ou urgentes" />
        <DemoMetric label="Risco medio" value={String(data.counters.averageRisk)} detail="Score operacional em tempo real" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Fila operacional</p>
              <p className="mt-1 text-sm text-slate-400">Conversas reais de demonstracao com contexto, risco, fila e janela Meta.</p>
            </div>
            <Link href="/admin/conversations" className="text-sm font-medium text-cyan-300">
              Abrir central
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {data.conversations.slice(0, 8).map((conversation) => (
              <Link
                key={conversation.id}
                href={`/admin/conversations/${conversation.id}`}
                className="block rounded-[24px] border border-white/10 bg-slate-950/55 px-4 py-4 transition hover:border-cyan-400/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <AvatarChip
                    avatar={conversation.citizen.avatar}
                    name={conversation.citizen.name}
                    region={conversation.citizen.region}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <DemoPill>{statusLabel(conversation.status)}</DemoPill>
                    {!conversation.metaWindowOpen ? <DemoPill tone="amber">Janela expirada</DemoPill> : null}
                    {conversation.sensitive ? <DemoPill tone="rose">Sensivel</DemoPill> : null}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                  {conversation.messages[conversation.messages.length - 1]?.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>Fila: {conversation.currentQueue}</span>
                  <span>Risco: {conversation.riskScore}</span>
                  <span>IA: {actionLabel(conversation.lastAIAction)}</span>
                  <span>Ultimo evento: {formatDateTime(conversation.messages[conversation.messages.length - 1]?.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-white">Compliance demo</h2>
            </div>
            <div className="mt-4 space-y-3">
              {data.complianceLogs.slice(0, 5).map((entry) => (
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
            <h2 className="text-lg font-semibold text-white">Infraestrutura simulada</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>Status WhatsApp: {data.counters.whatsappStatus}</p>
              <p>Status Redis: {data.infrastructure.redis}</p>
              <p>Status Queue: {data.infrastructure.queues}</p>
              <p>Status OpenAI: {data.infrastructure.openAi}</p>
              <p>Templates aprovados: {data.counters.approvedTemplates}</p>
              <p className="text-slate-400">{data.infrastructure.reason}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Ultimas acoes da IA</h2>
            <div className="mt-4 space-y-3">
              {data.aiActions.slice(0, 4).map((entry) => (
                <div key={entry.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{actionLabel(entry.actionType)}</p>
                    <span className="text-xs text-slate-400">{Math.round(entry.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{entry.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5">
            <p className="text-sm font-semibold text-emerald-100">Fluxo de demonstracao</p>
            <p className="mt-3 text-sm leading-7 text-emerald-50/90">
              Mensagem chega → IA classifica → compliance analisa → delay humano ou resposta assistida → status sent/delivered/read → takeover humano quando necessario.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DemoConversationsPage() {
  const { data } = useDemoState();
  const waitingHuman = data.conversations.filter((conversation) => conversation.status === "HUMAN").length;
  const triage = data.conversations.filter((conversation) => conversation.status === "OPEN").length;
  const closed = data.conversations.filter((conversation) => conversation.status === "CLOSED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacao"
        title="Central de conversas demo"
        description="Fila viva com mensagens, status Meta, risco, classificacao de intencao e supervisao humana."
        icon={<MessageSquareText className="h-5 w-5" />}
        aside={
          <div className="grid gap-3 sm:grid-cols-3">
            <CounterCard label="Total" value={String(data.conversations.length)} />
            <CounterCard label="Aguardando humano" value={String(waitingHuman)} tone="alert" />
            <CounterCard label="Finalizadas" value={String(closed)} />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard title="Em triagem" value={String(triage)} description="Respostas assistidas com classificacao e pacing." />
        <InsightCard title="Fila humana" value={String(waitingHuman)} description="Casos sensiveis, urgentes ou com risco reputacional." tone="alert" />
        <InsightCard title="Operacao ao vivo" value="24h" description="Mensagens, status e indicadores atualizam sem webhook real." />
      </div>

      <SectionCard className="bg-slate-950/35 backdrop-blur">
        <div className="space-y-4">
          {data.conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/admin/conversations/${conversation.id}`}
              className="block rounded-[28px] border border-white/10 bg-[#09111f] p-5 transition hover:border-cyan-400/30"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <AvatarChip
                      avatar={conversation.citizen.avatar}
                      name={conversation.citizen.name}
                      region={conversation.citizen.region}
                    />
                    <DemoPill>{statusLabel(conversation.status)}</DemoPill>
                    <DemoPill tone={toneForRisk(conversation.riskScore) as "default" | "amber" | "rose"}>
                      Risco {conversation.riskScore}
                    </DemoPill>
                    {conversation.aiPaused ? <DemoPill tone="amber">IA pausada</DemoPill> : null}
                    {!conversation.metaWindowOpen ? <DemoPill tone="amber">Fora da janela</DemoPill> : null}
                    {conversation.sensitive ? <DemoPill tone="rose">Sensivel</DemoPill> : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {conversation.citizen.phone}
                    </span>
                    <span>Fila: {conversation.currentQueue}</span>
                    <span>IA: {actionLabel(conversation.lastAIAction)}</span>
                    <span>Intencao: {conversation.intent.replaceAll("_", " ")}</span>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                    {conversation.messages[conversation.messages.length - 1]?.content}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 lg:items-end">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200">
                    {conversation.humanTakeoverActive ? "Assessor ativo" : "IA em acompanhamento"}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
                    Abrir historico
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function DemoConversationDetailPage({ conversationId }: { conversationId: string }) {
  const { data, updateData } = useDemoState();
  const conversation = data.conversations.find((item) => item.id === conversationId);
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!conversation) {
    return (
      <SectionCard className="bg-slate-950/35 text-white">
        <p>Conversa demo nao encontrada.</p>
      </SectionCard>
    );
  }

  const activeConversation = conversation;

  function updateConversation(nextConversation: DemoConversation) {
    updateData((current) => {
      const next = clone(current);
      next.conversations = next.conversations.map((item) =>
        item.id === conversationId ? nextConversation : item
      );
      return next;
    });
  }

  function sendHumanReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reply.trim()) {
      return;
    }

    const createdAt = new Date().toISOString();
    const message: DemoMessage = {
      id: `${activeConversation.id}-manual-${Date.now()}`,
      direction: "OUTBOUND",
      content: reply.trim(),
      source: "HUMAN",
      complianceStatus: "APPROVED",
      createdAt,
      queuedAt: createdAt,
      sentAt: createdAt,
      deliveredAt: new Date(Date.now() + 60_000).toISOString(),
      readAt: null,
      failureReason: null
    };

    updateConversation({
      ...activeConversation,
      status: "HUMAN",
      aiPaused: true,
      humanTakeoverActive: true,
      currentQueue: "human-escalation",
      messages: [...activeConversation.messages, message]
    });
    setReply("");
    setFeedback("Resposta humana registrada na simulacao.");
  }

  function setStatus(status: DemoConversation["status"]) {
    updateConversation({
      ...activeConversation,
      status,
      aiPaused: status !== "OPEN",
      humanTakeoverActive: status === "HUMAN",
      currentQueue: status === "CLOSED" ? "resolved" : status === "HUMAN" ? "human-escalation" : "incoming-message"
    });
    setFeedback(`Status alterado para ${statusLabel(status).toLowerCase()}.`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/admin/conversations" className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
          <ArrowLeft className="h-4 w-4" />
          Voltar para conversas
        </Link>
        <PageHeader
          eyebrow="Conversa demo"
          title={conversation.citizen.name}
          description={`Ultima interacao em ${formatDateTime(conversation.messages[conversation.messages.length - 1]?.createdAt)} com trilha completa de decisao, compliance e status Meta.`}
          icon={<MessageCircleMore className="h-5 w-5" />}
          aside={
            <div className="space-y-3">
              <DemoPill>{statusLabel(conversation.status)}</DemoPill>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">
                Risco operacional {conversation.riskScore}
              </div>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <SectionCard className="bg-slate-50">
          <div className="flex items-center gap-3 border-b border-slate-200 px-1 pb-4">
            <MessageCircleMore className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-950">Historico da conversa</h2>
          </div>

          <div className="mt-4 space-y-4">
            {conversation.messages.map((message) => {
              const inbound = message.direction === "INBOUND";

              return (
                <div key={message.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[88%] rounded-[24px] px-4 py-3 shadow-sm ${
                      inbound ? "bg-white text-ink" : "border border-brand-100 bg-brand-500 text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                      {sourceIcon(message.source)}
                      <span>{sourceLabel(message.source)}</span>
                      <span>•</span>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6">{message.content}</p>
                    <MessageStatusTrack message={message} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <aside className="space-y-6">
          <form onSubmit={sendHumanReply} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
            <h3 className="text-lg font-semibold text-ink">Responder pela equipe</h3>
            <p className="mt-1 text-sm text-slate-500">Envio local do modo demo, com rastreio de sent, delivered e read.</p>
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={5}
              placeholder="Digite uma resposta institucional..."
              className="mt-4 flex w-full rounded-[24px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
            <div className="mt-4 flex justify-end">
              <Button type="submit" className="gap-2">
                <Send className="h-4 w-4" />
                Enviar resposta demo
              </Button>
            </div>
          </form>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
            <h3 className="text-lg font-semibold text-ink">Acoes da conversa</h3>
            <div className="mt-4 flex flex-col gap-3">
              <Button variant={conversation.status === "HUMAN" ? "primary" : "secondary"} className="w-full gap-2" onClick={() => setStatus("HUMAN")}>
                <UserCheck className="h-4 w-4" />
                Assumir conversa
              </Button>
              <Button variant={conversation.status === "OPEN" ? "primary" : "secondary"} className="w-full gap-2" onClick={() => setStatus("OPEN")}>
                <Bot className="h-4 w-4" />
                Reativar IA
              </Button>
              <Button variant={conversation.status === "CLOSED" ? "primary" : "secondary"} className="w-full gap-2" onClick={() => setStatus("CLOSED")}>
                <CheckCircle2 className="h-4 w-4" />
                Encerrar conversa
              </Button>
            </div>
            {feedback ? (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {feedback}
              </p>
            ) : null}
          </div>

          <SectionCard className="bg-slate-950 text-white">
            <h3 className="text-lg font-semibold">Leitura operacional da IA</h3>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/75">
              <p>Intencao: {conversation.intent.replaceAll("_", " ")}</p>
              <p>Score de risco: {conversation.riskScore}</p>
              <p>Motivo da decisao: {conversation.decisionReason}</p>
              <p>Decisao da IA: {actionLabel(conversation.lastAIAction)}</p>
              <p>Confianca: {Math.round(conversation.aiConfidence * 100)}%</p>
            </div>
          </SectionCard>

          <SectionCard>
            <h3 className="text-lg font-semibold text-slate-950">Contexto relacionado</h3>
            {conversation.demands.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-600">Esta conversa ainda nao gerou demanda formal.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {conversation.demands.map((demand) => (
                  <article key={demand.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-medium text-ink">{demand.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        {demand.category.name}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700">
                        Prioridade {demand.priority}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{demand.description}</p>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}

export function DemoHumanQueuePage() {
  const { data, updateData } = useDemoState();
  const conversations = data.conversations.filter((conversation) => conversation.status === "HUMAN");

  function reassign(conversationId: string, status: DemoConversation["status"]) {
    updateData((current) => {
      const next = clone(current);
      next.conversations = next.conversations.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              status,
              aiPaused: status !== "OPEN",
              humanTakeoverActive: status === "HUMAN",
              currentQueue: status === "OPEN" ? "incoming-message" : status === "CLOSED" ? "resolved" : "human-escalation"
            }
          : item
      );
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <ShieldUser className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">Fila humana demo</p>
            <p className="mt-1 text-sm text-slate-400">Casos sensiveis, urgentes, fora da janela e com atrito alto em acompanhamento humano.</p>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {conversations.map((conversation) => (
          <article key={conversation.id} className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-5 transition hover:border-amber-300/40">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-white">{conversation.citizen.name}</p>
              <DemoPill tone="amber">Humano ativo</DemoPill>
              {conversation.sensitive ? <DemoPill tone="rose">Sensivel</DemoPill> : null}
              <DemoPill tone={toneForRisk(conversation.riskScore) as "default" | "amber" | "rose"}>
                Risco {conversation.riskScore}
              </DemoPill>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
              {conversation.messages[conversation.messages.length - 1]?.content}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              <span>Fila: {conversation.currentQueue}</span>
              <span>Motivo: {conversation.escalationReason ?? "Escalacao operacional"}</span>
              <span>Ultima mensagem: {formatDateTime(conversation.messages[conversation.messages.length - 1]?.createdAt)}</span>
              <Link href={`/admin/conversations/${conversation.id}`} className="font-medium text-cyan-300">
                Abrir conversa
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => reassign(conversation.id, "OPEN")}>
                Reativar IA
              </Button>
              <Button type="button" variant="success" onClick={() => reassign(conversation.id, "CLOSED")}>
                Marcar como resolvida
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function DemoTemplatesPage() {
  const { data, updateData } = useDemoState();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [form, setForm] = useState<DemoTemplate | null>(null);
  const templates = data.templates;

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const categoryOk = categoryFilter ? template.category.toLowerCase().includes(categoryFilter.toLowerCase()) : true;
        const languageOk = languageFilter ? template.language.toLowerCase().includes(languageFilter.toLowerCase()) : true;
        return categoryOk && languageOk;
      }),
    [categoryFilter, languageFilter, templates]
  );

  function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    updateData((current) => {
      const next = clone(current);
      next.templates = next.templates.map((item) =>
        item.id === form.id ? { ...form, updatedAt: new Date().toISOString() } : item
      );
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <Stamp className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">Templates oficiais demo</p>
            <p className="mt-1 text-sm text-slate-400">Modelos aprovados para retomada fora da janela, follow-up institucional e atualizacao de protocolo.</p>
          </div>
        </div>
      </section>

      {form ? (
        <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <Input value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })} />
              <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              <Input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} />
            </div>
            <textarea
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              rows={5}
              className="flex w-full rounded-[20px] border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
            />
            <div className="flex gap-3">
              <Button type="submit">Salvar demo</Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="Filtrar por categoria" />
        <Input value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} placeholder="Filtrar por idioma" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredTemplates.map((template) => (
          <article key={template.id} className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-white">{template.name}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {template.category} • {template.language}
                </p>
              </div>
              <DemoPill tone="emerald">Aprovado</DemoPill>
            </div>
            <p className="mt-4 rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-4 text-sm leading-6 text-slate-300">
              {template.content}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span>Template ID: {template.templateId}</span>
              <span>Atualizado: {formatDateTime(template.updatedAt)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setForm(template)}>
                Editar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="gap-2"
                onClick={() => navigator.clipboard.writeText(template.content)}
              >
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function DemoWhatsAppPage() {
  const { data } = useDemoState();
  const outboundMessages = data.conversations.flatMap((conversation) =>
    conversation.messages
      .filter((message) => message.direction === "OUTBOUND")
      .map((message) => ({ conversation, message }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <PlayCircle className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-semibold text-white">Painel WhatsApp demo</p>
            <p className="mt-1 text-sm text-slate-400">Status sent, delivered e read simulados com trilha temporal e sem dependencia da Meta.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DemoMetric label="Webhook" value="Simulado" />
        <DemoMetric label="Filas" value={String(data.counters.waitingMessages)} />
        <DemoMetric label="Templates aprovados" value={String(data.counters.approvedTemplates)} />
        <DemoMetric label="Risco operacional" value={String(data.counters.averageRisk)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Fluxo de entrega</h2>
          <div className="mt-4 space-y-3">
            {outboundMessages.slice(0, 10).map(({ conversation, message }) => (
              <div key={message.id} className="rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-white">{conversation.citizen.name}</p>
                  <DemoPill tone="emerald">{message.source === "TEMPLATE" ? "template" : "envio ativo"}</DemoPill>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{message.content}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>queuedAt {formatTime(message.queuedAt)}</span>
                  <span>sentAt {formatTime(message.sentAt)}</span>
                  <span>deliveredAt {message.deliveredAt ? `✔ ${formatTime(message.deliveredAt)}` : "..."}</span>
                  <span>readAt {message.readAt ? `✔ ${formatTime(message.readAt)}` : "..."}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Guardrails ativos</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-amber-50/90">
            <p>Anti flood ativo com pacing e delays simulados.</p>
            <p>Janela da Meta monitorada a cada evento de resposta.</p>
            <p>Templates sugeridos automaticamente fora da janela de 24h.</p>
            <p>Supervisao humana sobe quando o score de risco aumenta.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function DemoIntegrationPage() {
  const { data } = useDemoState();
  const checklist = [
    "Numero institucional configurado",
    "Webhook de demonstracao ativo",
    "Fila de mensagens simulada",
    "Status da Meta emulando sent, delivered e read",
    "Camada de compliance habilitada",
    "Escalacao humana pronta para takeover"
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integracoes"
        title="WhatsApp oficial em modo demonstracao"
        description="Tela comercial pronta para mostrar arquitetura, seguranca e governanca sem expor credenciais reais."
        icon={<ShieldCheck className="h-5 w-5" />}
        aside={<div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">Integracao simulada e operacional</div>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <SectionCard>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Status da integracao" value="Simulada com fidelidade operacional" />
            <InfoCard title="Numero configurado" value={data.mandate.whatsappNumber} />
            <InfoCard title="Webhook" value="https://demo.local/api/webhooks/whatsapp" compact />
            <InfoCard title="Phone Number ID" value="dem••••020" />
          </div>
        </SectionCard>

        <SectionCard className="bg-slate-950 text-white">
          <h2 className="text-lg font-semibold">Boas praticas para demo</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/75">
            <p>Nenhum token real e necessario.</p>
            <p>Nenhuma chamada para Meta e executada.</p>
            <p>Toda a atividade visual e gerada internamente com dados realistas.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <div className="grid gap-4 md:grid-cols-2">
          {checklist.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <span className="mt-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500" />
              <p className="text-sm leading-6 text-slate-600">{item}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function DemoAiPage() {
  const { data } = useDemoState();
  const example = data.conversations[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA assistiva demo"
        title="Motor de decisao supervisionado"
        description="Classificacao de intencao, score de risco, motivo da decisao e ultima resposta gerada ao vivo."
        icon={<Sparkles className="h-5 w-5" />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <ExampleCard title="Mensagem recebida" eyebrow="Entrada" icon={<MessageSquareText className="h-5 w-5" />} content={example.messages.find((item) => item.direction === "INBOUND")?.content ?? "Sem mensagem"} />
        <ExampleCard title="Classificacao e risco" eyebrow="Analise" icon={<Radar className="h-5 w-5" />} content={`Intencao: ${example.intent.replaceAll("_", " ")}\nScore de risco: ${example.riskScore}\nConfianca: ${Math.round(example.aiConfidence * 100)}%\nMotivo: ${example.decisionReason}`} preformatted />
        <ExampleCard title="Decisao da IA" eyebrow="Saida" icon={<Bot className="h-5 w-5" />} content={example.aiDecision} />
      </div>

      <SectionCard className="bg-[linear-gradient(180deg,_#fff7ed_0%,_#ffffff_100%)]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Seguranca operacional</h2>
            <div className="mt-4 space-y-2 text-sm leading-7 text-slate-600">
              <p>Anti flood ativo.</p>
              <p>Janela Meta considerada antes de respostas automaticas.</p>
              <p>Casos sensiveis ou urgentes sobem para humano.</p>
              <p>Templates entram em cena quando a janela expira.</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function DemoSettingsPage() {
  const { data } = useDemoState();

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">Configuracoes operacionais demo</p>
            <p className="mt-1 text-sm text-slate-400">Identidade visual, numero oficial e orientacao da IA em modo somente demonstracao.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard>
          <h2 className="text-lg font-semibold text-slate-950">Mandato demonstrativo</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>Nome da operacao: {data.mandate.name}</p>
            <p>Responsavel: {data.mandate.politicianName}</p>
            <p>Cidade: {data.mandate.city}/{data.mandate.state}</p>
            <p>WhatsApp oficial: {data.mandate.whatsappNumber}</p>
          </div>
        </SectionCard>

        <SectionCard className="bg-slate-950 text-white">
          <h2 className="text-lg font-semibold">Prompt operacional demo</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">{data.mandate.aiPrompt}</p>
        </SectionCard>
      </div>
    </div>
  );
}

export function DemoCategoriesPage() {
  const { data } = useDemoState();
  const categories = Array.from(
    new Map(
      data.conversations
        .flatMap((conversation) => conversation.demands)
        .map((demand) => [demand.category.name, demand.category])
    ).values()
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Classificacao"
        title="Categorias demo"
        description="Categorias operacionais derivadas das demandas demonstrativas em andamento."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const count = data.conversations
            .flatMap((conversation) => conversation.demands)
            .filter((demand) => demand.category.name === category.name).length;

          return (
            <SectionCard key={category.id}>
              <p className="text-lg font-semibold text-slate-950">{category.name}</p>
              <p className="mt-2 text-sm text-slate-600">{count} demandas associadas na simulacao.</p>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

export function DemoDemandsPage() {
  const { data } = useDemoState();
  const demands = data.conversations.flatMap((conversation) =>
    conversation.demands.map((demand) => ({ demand, conversation }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacao"
        title="Central de demandas demo"
        description="Demandas realistas derivadas das conversas, com prioridade, categoria e contexto do cidadao."
        icon={<ShieldCheck className="h-5 w-5" />}
        aside={<div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">{demands.length} demandas mapeadas</div>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {demands.map(({ demand, conversation }) => (
          <SectionCard key={demand.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-950">{demand.title}</p>
                <p className="mt-2 text-sm text-slate-500">
                  {conversation.citizen.name} • {demand.category.name}
                </p>
              </div>
              <DemoPill tone={demand.priority === "HIGH" ? "rose" : demand.priority === "MEDIUM" ? "amber" : "default"}>
                {demand.priority}
              </DemoPill>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{demand.description}</p>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

export function DemoDemandDetailPage({ demandId }: { demandId: string }) {
  const { data } = useDemoState();
  const record = data.conversations
    .flatMap((conversation) => conversation.demands.map((demand) => ({ conversation, demand })))
    .find((item) => item.demand.id === demandId);

  if (!record) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-600">Demanda demo nao encontrada.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/demands" className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
        <ArrowLeft className="h-4 w-4" />
        Voltar para demandas
      </Link>

      <PageHeader
        eyebrow="Demanda demo"
        title={record.demand.title}
        description={record.demand.description}
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <SectionCard>
          <h2 className="text-lg font-semibold text-slate-950">Contexto do cidadao</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>{record.conversation.citizen.name}</p>
            <p>{record.conversation.citizen.phone}</p>
            <p>Categoria: {record.demand.category.name}</p>
            <p>Prioridade: {record.demand.priority}</p>
          </div>
        </SectionCard>

        <SectionCard className="bg-slate-950 text-white">
          <h2 className="text-lg font-semibold">Conversa relacionada</h2>
          <p className="mt-4 text-sm leading-7 text-white/75">
            {record.conversation.messages[record.conversation.messages.length - 1]?.content}
          </p>
        </SectionCard>
      </div>
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
    <div className={`rounded-[22px] border px-5 py-4 text-sm font-medium ${tone === "alert" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
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
    <article className={`rounded-[28px] border p-5 shadow-soft ${tone === "alert" ? "border-amber-200 bg-amber-50/80" : "border-slate-200 bg-white"}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-4 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function InfoCard({
  title,
  value,
  compact = false
}: {
  title: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <article className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-3 text-slate-700">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className={`mt-4 font-semibold text-slate-950 ${compact ? "break-all text-sm" : "text-xl"}`}>{value}</p>
    </article>
  );
}

function ExampleCard({
  eyebrow,
  title,
  icon,
  content,
  preformatted = false
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  content: string;
  preformatted?: boolean;
}) {
  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
        </div>
      </div>
      {preformatted ? (
        <pre className="mt-5 whitespace-pre-wrap rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">{content}</pre>
      ) : (
        <p className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">{content}</p>
      )}
    </SectionCard>
  );
}
