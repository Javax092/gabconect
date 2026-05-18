"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Gauge,
  Radar,
  Shield,
  TimerReset,
  Waypoints
} from "lucide-react";

import { TrustRecoveryPanel } from "@/components/campaigns/trust-recovery-panel";

type InfrastructurePanelsProps = {
  profile: {
    reputationScore: number;
    spamRisk: number;
    deliveryHealth: number;
    qualityRating: string;
    trustLevel: string;
    stageLabel: string;
    trendDelta: number;
    activeThroughput: number;
    safeThroughput: number;
    humanizedDelayMin: number;
    humanizedDelayMax: number;
    blockRisk: number;
    queuePressure: number;
  };
  metrics: {
    deliveryRate: number;
    reputationScore: number;
    spamProbability: number;
    activeThroughput: number;
    safeThroughput: number;
    humanizedDelay: string;
    campaignHealth: number;
    safeContactsReached: number;
    blockRisk: number;
    queuePressure: number;
    trustLevel: string;
    qualityRating: string;
    trendDelta: number;
    safetyScoreAverage: number;
    blockedCampaigns: number;
    numbersInTrustRecovery: number;
    recommendedThroughput: number;
    riskTrend: string;
  };
  warmupRules: Array<{
    id: string;
    dayNumber: number;
    label: string;
    stageLabel: string;
    dailyLimit: number;
    throughputCap: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
    pauseOnRisk: number;
  }>;
  trustRecovery: {
    status: string;
    reason: string;
    recommendedLimit: number;
    cooldownUntil: Date | string | null;
    recoverySteps: string[];
  } | null;
  logs: Array<{
    id: string;
    levelLabel: string;
    title: string;
    message: string;
    recommendedAction: string | null;
    createdAt: Date | string;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    templateName: string;
    sentCount: number;
    failedCount: number;
    pendingCount: number;
    audience: string[];
    operationState: {
      pipelineLabel: string;
      riskScore: number;
      deliveryRate: number;
      activeThroughput: number;
      safeThroughput: number;
      currentDelayMin: number;
      currentDelayMax: number;
      recommendedAction: string | null;
      failsafeTriggered: boolean;
      humanReviewNeeded: boolean;
    } | null;
  }>;
};

type SnapshotState = InfrastructurePanelsProps;

type InfrastructureResponse = SnapshotState & {
  audienceOptions?: unknown;
};

const REFRESH_INTERVAL_MS = 20000;

export function CampaignInfrastructurePanels(initialSnapshot: InfrastructurePanelsProps) {
  const [snapshot, setSnapshot] = useState<SnapshotState>(initialSnapshot);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/campaigns/infrastructure", {
          cache: "no-store"
        });
        const data = (await response.json()) as InfrastructureResponse;

        if (!response.ok) {
          return;
        }

        setSnapshot({
          profile: data.profile,
          metrics: data.metrics,
          warmupRules: data.warmupRules,
          trustRecovery: data.trustRecovery,
          logs: data.logs,
          campaigns: data.campaigns
        });
        setLastUpdated(new Date());
      } catch {
        return;
      }
    };

    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const streamEvents = useMemo(() => buildOperationalEvents(snapshot), [snapshot]);
  const criticalCount = snapshot.campaigns.filter(
    (campaign) =>
      campaign.operationState?.humanReviewNeeded ||
      campaign.operationState?.failsafeTriggered
  ).length;
  const activeOperations = snapshot.campaigns.filter((campaign) =>
    ["RUNNING", "SCHEDULED", "DRAFT", "PAUSED"].includes(campaign.status)
  ).length;

  return (
    <div className="space-y-4">
      <section className="ops-grid relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(3,10,20,0.98)_0%,_rgba(6,17,31,0.98)_100%)] p-5 shadow-[0_28px_90px_rgba(2,6,23,0.34)]">
        <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                <span className="signal-dot h-2 w-2 rounded-full bg-cyan-300" />
                command center
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                atualizado {formatTime(lastUpdated)}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.5fr)]">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white lg:text-[2rem]">
                  Estado operacional, risco e throughput em uma única superfície.
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <TelemetryCell
                    label="Throughput atual"
                    value={String(snapshot.metrics.activeThroughput)}
                    hint={`limite seguro ${snapshot.metrics.safeThroughput}`}
                    tone="cyan"
                  />
                  <TelemetryCell
                    label="Queue pressure"
                    value={`${snapshot.metrics.queuePressure}%`}
                    hint={`${activeOperations} operacoes ativas`}
                    tone="white"
                  />
                  <TelemetryCell
                    label="Safe delivery rate"
                    value={`${snapshot.metrics.deliveryRate}%`}
                    hint={snapshot.metrics.qualityRating}
                    tone="emerald"
                  />
                  <TelemetryCell
                    label="Trust state"
                    value={snapshot.metrics.trustLevel}
                    hint={`${snapshot.metrics.trendDelta >= 0 ? "+" : ""}${snapshot.metrics.trendDelta} reputacao`}
                    tone="amber"
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="grid gap-3">
                  <CompactStat label="Reputation trend" value={snapshot.metrics.riskTrend} />
                  <CompactStat
                    label="Cooldown ativo"
                    value={
                      snapshot.trustRecovery?.status === "ACTIVE"
                        ? formatCooldown(snapshot.trustRecovery.cooldownUntil)
                        : "monitorado"
                    }
                  />
                  <CompactStat label="Human review" value={String(criticalCount)} />
                  <CompactStat
                    label="Adaptive delays"
                    value={`${snapshot.profile.humanizedDelayMin}s-${snapshot.profile.humanizedDelayMax}s`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#040b16]/90 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Event stream
                </p>
                <p className="mt-1 text-sm text-slate-300">orquestracao, risco, cooldown, revisao</p>
              </div>
              <Radar className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-3 space-y-2">
              {streamEvents.slice(0, 8).map((event) => (
                <article
                  key={event.id}
                  className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${event.tone}`} />
                      <p className="truncate text-sm font-medium text-white">{event.title}</p>
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {event.time}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{event.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Telemetria viva</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                prioridade: estado, risco, throughput, reputacao, filas
              </p>
            </div>
            <Link href="/admin/campaigns" className="text-sm font-medium text-cyan-300">
              operar campanhas
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricPanel
              icon={<Gauge className="h-4 w-4" />}
              label="Throughput"
              value={`${snapshot.metrics.activeThroughput}/${snapshot.metrics.safeThroughput}`}
              meta={`recomendado ${snapshot.metrics.recommendedThroughput}`}
            />
            <MetricPanel
              icon={<Waypoints className="h-4 w-4" />}
              label="Queue pressure"
              value={`${snapshot.metrics.queuePressure}%`}
              meta={`${activeOperations} operacoes`}
            />
            <MetricPanel
              icon={<Shield className="h-4 w-4" />}
              label="Delivery health"
              value={`${snapshot.profile.deliveryHealth}%`}
              meta={snapshot.profile.qualityRating}
            />
            <MetricPanel
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Block risk"
              value={`${snapshot.profile.blockRisk}%`}
              meta={`${snapshot.metrics.blockedCampaigns} bloqueios por risco`}
            />
            <MetricPanel
              icon={<TimerReset className="h-4 w-4" />}
              label="Adaptive delays"
              value={`${snapshot.profile.humanizedDelayMin}s-${snapshot.profile.humanizedDelayMax}s`}
              meta={snapshot.profile.stageLabel}
            />
            <MetricPanel
              icon={<Activity className="h-4 w-4" />}
              label="Safe delivery rate"
              value={`${snapshot.metrics.deliveryRate}%`}
              meta={`${snapshot.metrics.safeContactsReached} entregas seguras`}
            />
          </div>
        </div>

        <TrustRecoveryPanel
          trustRecovery={
            snapshot.trustRecovery
              ? {
                  ...snapshot.trustRecovery,
                  cooldownUntil:
                    snapshot.trustRecovery.cooldownUntil instanceof Date
                      ? snapshot.trustRecovery.cooldownUntil.toISOString()
                      : snapshot.trustRecovery.cooldownUntil ?? null
                }
              : null
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Operacoes ativas</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                pipeline, risco, filas, pacing, acao
              </p>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              {activeOperations} monitoradas
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Throughput</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Risco</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.campaigns.map((campaign) => (
                  <tr key={campaign.id} className="rounded-2xl bg-white/[0.03]">
                    <td className="rounded-l-2xl border-y border-l border-white/8 px-3 py-3">
                      <p className="font-medium text-white">{campaign.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{campaign.templateName}</p>
                    </td>
                    <td className="border-y border-white/8 px-3 py-3">
                      <StatePill label={campaign.operationState?.pipelineLabel ?? campaign.status} />
                    </td>
                    <td className="border-y border-white/8 px-3 py-3 text-slate-300">
                      {campaign.pendingCount} pendentes
                    </td>
                    <td className="border-y border-white/8 px-3 py-3 text-slate-300">
                      {campaign.operationState?.activeThroughput ?? 0}/
                      {campaign.operationState?.safeThroughput ?? 0}
                    </td>
                    <td className="border-y border-white/8 px-3 py-3 text-slate-300">
                      {campaign.operationState?.deliveryRate ?? 0}%
                    </td>
                    <td className="rounded-r-2xl border-y border-r border-white/8 px-3 py-3">
                      <RiskValue value={campaign.operationState?.riskScore ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Warmup matrix</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                limites operacionais por faixa
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-4 space-y-2">
            {snapshot.warmupRules.map((rule) => (
              <article
                key={rule.id}
                className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{rule.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{rule.stageLabel}</p>
                  </div>
                  <span className="text-sm font-semibold text-cyan-200">
                    {rule.dailyLimit}/dia
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <span>throughput {rule.throughputCap}</span>
                  <span>
                    delay {rule.minDelaySeconds}s-{rule.maxDelaySeconds}s
                  </span>
                  <span>pausa {rule.pauseOnRisk}%</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-sm font-semibold text-white">Operational log</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              sinais persistidos pelo engine
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            ultimas {snapshot.logs.length} entradas
          </span>
        </div>
        <div className="mt-4 grid gap-2 xl:grid-cols-2">
          {snapshot.logs.map((entry) => (
            <article
              key={entry.id}
              className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{entry.title}</p>
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {entry.levelLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{entry.message}</p>
              {entry.recommendedAction ? (
                <p className="mt-2 text-xs text-cyan-200">{entry.recommendedAction}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildOperationalEvents(snapshot: SnapshotState) {
  const campaignDerived = snapshot.campaigns.flatMap((campaign) => {
    const events = [];
    const state = campaign.operationState;

    if (!state) {
      return [];
    }

    events.push({
      id: `${campaign.id}-throughput`,
      time: "agora",
      title: "throughput recalculated",
      detail: `${campaign.name} ${state.activeThroughput}/${state.safeThroughput} com queue pressure ${snapshot.metrics.queuePressure}%`,
      tone: "bg-cyan-300"
    });

    if (state.failsafeTriggered) {
      events.push({
        id: `${campaign.id}-throttled`,
        time: "agora",
        title: "campaign throttled",
        detail: `${campaign.name} entrou em protecao por risco ${state.riskScore}%`,
        tone: "bg-amber-300"
      });
    }

    if (state.humanReviewNeeded) {
      events.push({
        id: `${campaign.id}-review`,
        time: "agora",
        title: "human review required",
        detail: `${campaign.name} exige verificacao operacional antes de retomar`,
        tone: "bg-rose-300"
      });
    }

    if (campaign.pendingCount > state.activeThroughput) {
      events.push({
        id: `${campaign.id}-queue`,
        time: "agora",
        title: "batch delayed",
        detail: `${campaign.pendingCount} contatos em fila com pacing adaptativo`,
        tone: "bg-slate-300"
      });
    }

    if (state.currentDelayMax > 60) {
      events.push({
        id: `${campaign.id}-cooldown`,
        time: "agora",
        title: "cooldown applied",
        detail: `${campaign.name} operando com janela ${state.currentDelayMin}s-${state.currentDelayMax}s`,
        tone: "bg-amber-200"
      });
    }

    return events;
  });

  const logDerived = snapshot.logs.map((entry) => ({
    id: entry.id,
    time: formatTime(entry.createdAt),
    title: normalizeEventTitle(entry.title),
    detail: entry.message,
    tone:
      entry.levelLabel === "Critico"
        ? "bg-rose-300"
        : entry.levelLabel === "Alerta"
          ? "bg-amber-300"
          : entry.levelLabel === "Estavel"
            ? "bg-emerald-300"
            : "bg-cyan-300"
  }));

  return [...campaignDerived, ...logDerived];
}

function normalizeEventTitle(title: string) {
  const lower = title.toLowerCase();

  if (lower.includes("warmup")) return "warmup upgraded";
  if (lower.includes("risco")) return "risk increased";
  if (lower.includes("delay")) return "adaptive delay recalibrated";
  if (lower.includes("recuper")) return "trust recovery activated";
  if (lower.includes("paus")) return "cooldown applied";

  return title.toLowerCase();
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCooldown(value: Date | string | null) {
  if (!value) {
    return "monitorado";
  }

  return formatTime(value);
}

function TelemetryCell({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: string;
  hint: string;
  tone: "cyan" | "emerald" | "amber" | "white";
}) {
  const toneClass =
    tone === "cyan"
      ? "border-cyan-400/15 bg-cyan-400/8"
      : tone === "emerald"
        ? "border-emerald-400/15 bg-emerald-400/8"
        : tone === "amber"
          ? "border-amber-400/15 bg-amber-400/8"
          : "border-white/10 bg-white/[0.04]";

  return (
    <article className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </article>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

function MetricPanel({
  icon,
  label,
  value,
  meta
}: {
  icon: ReactNode;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <article className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-cyan-300">
        {icon}
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{meta}</p>
    </article>
  );
}

function StatePill({ label }: { label: string }) {
  const lower = label.toLowerCase();
  const tone = lower.includes("risk") || lower.includes("review")
    ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
    : lower.includes("throttled") || lower.includes("paused")
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
      : lower.includes("sending")
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
        : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {label}
    </span>
  );
}

function RiskValue({ value }: { value: number }) {
  const tone =
    value >= 75
      ? "text-rose-200"
      : value >= 55
        ? "text-amber-200"
        : "text-emerald-200";

  return <span className={`text-sm font-semibold ${tone}`}>{value}%</span>;
}
