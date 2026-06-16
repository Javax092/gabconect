"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, MessageSquareText, ShieldAlert } from "lucide-react";

import { DashboardDeferredSkeleton } from "@/components/admin/dashboard-deferred-skeleton";
import type { AdminDashboardDeferredData } from "@/lib/admin-dashboard";

type ReadinessData = {
  mode: "SIMULACAO" | "REAL";
  queueHealth: {
    redis: string;
    queues: string;
  };
  outgoingWorkerReady: boolean;
  latestInboundMessage: { createdAt: string } | null;
  latestDelivery: { createdAt: string } | null;
  envChecklist: Array<{
    key: string;
    label: string;
    status: string;
  }>;
};

type DashboardPayload = AdminDashboardDeferredData & {
  readiness: ReadinessData;
};

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function DashboardDeferredBlocks() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/admin/dashboard", {
          credentials: "same-origin",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error("Dashboard request failed.");
        }

        const payload = (await response.json()) as { success: boolean; dashboard: DashboardPayload };

        if (active && payload.success) {
          setData(payload.dashboard);
        }
      } catch {
        if (active) {
          setError(true);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-soft">
        Não foi possível carregar esta informação agora.
      </div>
    );
  }

  if (!data) {
    return <DashboardDeferredSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Conversas recentes</p>
              <p className="mt-1 text-sm text-slate-500">Estado do atendimento, fila atual e risco percebido.</p>
            </div>
            <Link href="/admin/conversations" className="text-sm font-medium text-brand-700">
              Abrir central
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {data.recentConversations.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Nenhuma conversa encontrada para este mandato ainda.
              </p>
            ) : (
              data.recentConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/admin/conversations/${conversation.id}`}
                  className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-brand-200 hover:bg-white"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-950">{conversation.citizenName}</p>
                    <Badge>{conversation.status === "HUMAN" ? "Humano ativo" : "IA ativa"}</Badge>
                    {conversation.humanPriority ? <Badge tone="amber">Pendência humana</Badge> : null}
                    {conversation.riskScore >= 60 ? <Badge tone="rose">Risco elevado</Badge> : null}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                    {conversation.latestMessage ?? "Sem histórico recente."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Fila: {conversation.currentQueue}</span>
                    <span>Última mensagem: {formatDateTime(conversation.lastMessageAt)}</span>
                    <span>Janela Meta: {conversation.metaWindowOpen ? "aberta" : "encerrada"}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-brand-700" />
              <h2 className="text-lg font-semibold text-slate-950">Status operacional</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Modo atual: {data.readiness.mode === "SIMULACAO" ? "Modo simulação" : "Envio real"}</p>
              <p>Redis: {data.readiness.queueHealth.redis}</p>
              <p>Filas: {data.readiness.queueHealth.queues}</p>
              <p>Outgoing worker: {data.readiness.outgoingWorkerReady ? "online" : "sem heartbeat recente"}</p>
              <p>Último webhook: {formatDateTime(data.readiness.latestInboundMessage?.createdAt ?? null)}</p>
              <p>Último envio: {formatDateTime(data.readiness.latestDelivery?.createdAt ?? null)}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-slate-950">Campanhas ativas</h2>
            <div className="mt-4 space-y-3">
              {data.activeCampaigns.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhuma campanha ativa no momento.</p>
              ) : (
                data.activeCampaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-950">{campaign.name}</p>
                      <span className="text-xs text-slate-500">{campaign.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{campaign.templateName}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Fila: {campaign.pipelineStage ?? "sem estado"} • Risco {campaign.riskScore}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-slate-950">Compliance e riscos</h2>
          </div>
          <div className="mt-4 space-y-3">
            {data.recentCompliance.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                Nenhum alerta recente de compliance para este mandato.
              </p>
            ) : (
              data.recentCompliance.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-950">{entry.actionTaken}</p>
                    <span className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{entry.reason}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <MessageSquareText className="h-5 w-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-slate-950">Checklist de prontidão</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.readiness.envChecklist.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-medium text-slate-950">{item.label}</p>
                <p className="mt-1 text-sm text-slate-600">{item.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "rose" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}
