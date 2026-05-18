"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Megaphone,
  Pause,
  Play,
  RefreshCw,
  Shield
} from "lucide-react";

import { PreflightCheckModal } from "@/components/campaigns/preflight-check-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";

type TemplateOption = {
  id: string;
  name: string;
  category: string;
  language: string;
  metaTemplateName: string;
  status: string;
};

type AudienceConfig = {
  tags: string[];
  groups: string[];
  priorities: string[];
  locations: string[];
  interests: string[];
  contactTypes: string[];
};

type CampaignItem = {
  id: string;
  name: string;
  templateId: string;
  segmentTags: string[];
  audienceConfig: AudienceConfig | null;
  audience?: string[];
  status: string;
  dailyLimit: number;
  delaySeconds: number;
  scheduledAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  template: TemplateOption;
  operationState: {
    pipelineStage?: string;
    riskScore: number;
    spamProbability: number;
    deliveryRate: number;
    queuePressure: number;
    activeThroughput: number;
    safeThroughput: number;
    currentDelayMin: number;
    currentDelayMax: number;
    failsafeTriggered: boolean;
    humanReviewNeeded: boolean;
    recommendedAction: string | null;
    cooldownMinutes?: number | null;
    lastEvaluatedAt?: string | null;
  } | null;
  safetySimulation: {
    riskLevel: string;
    safetyScore: number;
    recommendedDailyLimit: number;
    recommendedBatchSize: number;
    recommendedDelayMinSeconds: number;
    recommendedDelayMaxSeconds: number;
    requiresHumanReview: boolean;
    canStartNow: boolean;
    estimatedCompletionTime: string | null;
    estimatedReputationImpact: string | null;
    createdAt: string;
  } | null;
  stats: {
    PENDING: number;
    SENT: number;
    FAILED: number;
    SKIPPED: number;
    UNSUBSCRIBED: number;
    total: number;
  };
};

type SimulationResponse = {
  simulation: {
    riskLevel: string;
    safetyScore: number;
    recommendedDailyLimit: number;
    recommendedBatchSize: number;
    recommendedDelayMinSeconds: number;
    recommendedDelayMaxSeconds: number;
    recommendedStartTime: string | null;
    requiresHumanReview: boolean;
    canStartNow: boolean;
    estimatedCompletionTime: string | null;
    estimatedReputationImpact: string | null;
    warnings: string[];
    recommendations: string[];
    blockingReasons: string[];
    profile: {
      reputationScore: number;
      trustLevel: string;
      qualityRating: string;
    };
  };
  message?: string;
};

type CampaignsManagerProps = {
  initialCampaigns: CampaignItem[];
  templateOptions: TemplateOption[];
  availableTags: string[];
  audienceOptions: AudienceConfig;
  initialEligibleCount: number;
  initialSettings: {
    defaultDailyLimit: number;
    defaultDelaySeconds: number;
    maxConsecutiveFailures: number;
  };
};

const AUDIENCE_SECTIONS: Array<{
  key: keyof AudienceConfig;
  label: string;
}> = [
  { key: "tags", label: "Tags" },
  { key: "groups", label: "Grupos" },
  { key: "priorities", label: "Prioridade" },
  { key: "locations", label: "Localizacao" },
  { key: "interests", label: "Interesse" },
  { key: "contactTypes", label: "Tipo de contato" }
];

const REFRESH_INTERVAL_MS = 20000;

export function CampaignsManager({
  initialCampaigns,
  templateOptions,
  availableTags,
  audienceOptions,
  initialEligibleCount,
  initialSettings
}: CampaignsManagerProps) {
  const emptyAudience: AudienceConfig = {
    tags: [],
    groups: [],
    priorities: [],
    locations: [],
    interests: [],
    contactTypes: []
  };
  const emptyForm = {
    name: "",
    templateId: "",
    dailyLimit: String(initialSettings.defaultDailyLimit),
    delaySeconds: String(initialSettings.defaultDelaySeconds),
    scheduledAt: ""
  };

  const [campaigns, setCampaigns] = useState(initialCampaigns.map(normalizeCampaign));
  const [form, setForm] = useState(emptyForm);
  const [audience, setAudience] = useState<AudienceConfig>(emptyAudience);
  const [eligibleCount, setEligibleCount] = useState(initialEligibleCount);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [pending, setPending] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightActionLoading, setPreflightActionLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [preflightCampaignName, setPreflightCampaignName] = useState<string | null>(null);
  const [preflightSimulation, setPreflightSimulation] = useState<SimulationResponse["simulation"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    setCampaigns(initialCampaigns.map(normalizeCampaign));
  }, [initialCampaigns]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("eligibleCount", "true");

    for (const section of AUDIENCE_SECTIONS) {
      audience[section.key].forEach((value) => params.append(section.key, value));
    }

    fetch(`/api/campaigns?${params.toString()}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const data = (await response.json()) as { eligibleCount?: number };
        if (response.ok && typeof data.eligibleCount === "number") {
          setEligibleCount(data.eligibleCount);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [audience]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshCampaigns({ silent: true }).catch(() => undefined);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter((campaign) =>
        statusFilter === "ALL" ? true : campaign.status === statusFilter
      ),
    [campaigns, statusFilter]
  );

  const campaignMetrics = useMemo(() => {
    const activeOperations = campaigns.filter((campaign) =>
      ["RUNNING", "SCHEDULED", "DRAFT", "PAUSED"].includes(campaign.status)
    ).length;
    const queueTotal = campaigns.reduce((total, campaign) => total + campaign.stats.PENDING, 0);
    const reviewRequired = campaigns.filter(
      (campaign) =>
        campaign.operationState?.humanReviewNeeded ||
        campaign.safetySimulation?.requiresHumanReview
    ).length;
    const safeDeliveryRate =
      campaigns.length === 0
        ? 0
        : Math.round(
            campaigns.reduce(
              (total, campaign) => total + (campaign.operationState?.deliveryRate ?? 0),
              0
            ) / campaigns.length
          );
    const avgThroughput =
      campaigns.length === 0
        ? 0
        : Math.round(
            campaigns.reduce(
              (total, campaign) => total + (campaign.operationState?.activeThroughput ?? 0),
              0
            ) / campaigns.length
          );

    return {
      activeOperations,
      queueTotal,
      reviewRequired,
      safeDeliveryRate,
      avgThroughput
    };
  }, [campaigns]);

  const statusOptions = useMemo(() => {
    const values = [...new Set(campaigns.map((campaign) => campaign.status))];
    return ["ALL", ...values];
  }, [campaigns]);

  const liveEvents = useMemo(() => {
    return campaigns
      .flatMap((campaign) => {
        const state = campaign.operationState;
        const events = [];

        if (!state) {
          return [];
        }

        events.push({
          id: `${campaign.id}-throughput`,
          title: "throughput recalculated",
          detail: `${campaign.name} ${state.activeThroughput}/${state.safeThroughput}`,
          tone: "bg-cyan-300"
        });

        if (campaign.stats.PENDING > state.activeThroughput) {
          events.push({
            id: `${campaign.id}-batch`,
            title: "batch delayed",
            detail: `${campaign.stats.PENDING} contatos aguardando janela operacional`,
            tone: "bg-slate-300"
          });
        }

        if (state.failsafeTriggered) {
          events.push({
            id: `${campaign.id}-cooldown`,
            title: "cooldown applied",
            detail: `${campaign.name} protegido por failsafe`,
            tone: "bg-amber-300"
          });
        }

        if (state.humanReviewNeeded) {
          events.push({
            id: `${campaign.id}-review`,
            title: "human review required",
            detail: `${campaign.name} exige aprovacao operacional`,
            tone: "bg-rose-300"
          });
        }

        if (campaign.safetySimulation?.riskLevel === "LOW") {
          events.push({
            id: `${campaign.id}-warmup`,
            title: "warmup upgraded",
            detail: `${campaign.name} apta para ampliacao gradual`,
            tone: "bg-emerald-300"
          });
        }

        return events;
      })
      .slice(0, 10);
  }, [campaigns]);

  function toggleAudienceValue(section: keyof AudienceConfig, value: string) {
    setAudience((current) => {
      const values = current[section];
      const nextValues = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];

      return {
        ...current,
        [section]: nextValues
      };
    });
  }

  async function refreshCampaigns({ silent = false }: { silent?: boolean } = {}) {
    const response = await fetch("/api/campaigns", {
      cache: "no-store"
    });
    const data = (await response.json()) as { campaigns?: CampaignItem[] };

    if (!response.ok || !data.campaigns) {
      throw new Error(getApiErrorMessage(data, "Nao foi possivel atualizar as campanhas."));
    }

    setCampaigns(data.campaigns.map(normalizeCampaign));
    setLastUpdated(new Date());

    if (!silent) {
      setFeedback("Telemetria operacional atualizada.");
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          segmentTags: audience.tags,
          groups: audience.groups,
          priorities: audience.priorities,
          locations: audience.locations,
          interests: audience.interests,
          contactTypes: audience.contactTypes,
          dailyLimit: form.dailyLimit.trim() ? Number(form.dailyLimit) : undefined,
          delaySeconds: form.delaySeconds.trim() ? Number(form.delaySeconds) : undefined
        })
      });
      const data = (await response.json()) as {
        campaign?: CampaignItem;
        message?: string;
      };

      if (!response.ok || !data.campaign) {
        setError(getApiErrorMessage(data, "Nao foi possivel criar a campanha."));
        return;
      }

      setForm(emptyForm);
      setAudience(emptyAudience);
      setFeedback(data.message ?? "Campanha criada.");
      await refreshCampaigns({ silent: true });
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function triggerAction(campaignId: string, action: "start" | "pause" | "send-next") {
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/${action}`, {
        method: "POST"
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Nao foi possivel executar a acao."));
        return;
      }

      await refreshCampaigns({ silent: true });
      setFeedback(data.message ?? "Acao executada.");
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function openPreflight(campaignId: string, campaignName: string) {
    setPreflightOpen(true);
    setPreflightLoading(true);
    setPreflightSimulation(null);
    setSelectedCampaignId(campaignId);
    setPreflightCampaignName(campaignName);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/preflight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as SimulationResponse;

      if (!response.ok || !data.simulation) {
        setError(getApiErrorMessage(data, "Nao foi possivel gerar a analise pre-envio."));
        return;
      }

      setPreflightSimulation(data.simulation);
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPreflightLoading(false);
    }
  }

  async function submitHumanReview() {
    if (!selectedCampaignId) {
      return;
    }

    setPreflightActionLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/preflight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          submitForReview: true
        })
      });
      const data = (await response.json()) as SimulationResponse;

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Nao foi possivel encaminhar para revisao humana."));
        return;
      }

      setFeedback(data.message ?? "Campanha encaminhada para revisao humana.");
      setPreflightOpen(false);
      await refreshCampaigns({ silent: true });
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPreflightActionLoading(false);
    }
  }

  async function startWithRecommendedPlan() {
    if (!selectedCampaignId) {
      return;
    }

    setPreflightActionLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/start`, {
        method: "POST"
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Nao foi possivel iniciar a campanha."));
        return;
      }

      setFeedback(data.message ?? "Campanha iniciada com plano recomendado.");
      setPreflightOpen(false);
      await refreshCampaigns({ silent: true });
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPreflightActionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="ops-grid relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(3,10,20,0.98)_0%,_rgba(6,17,31,0.98)_100%)] p-5 shadow-[0_28px_90px_rgba(2,6,23,0.34)]">
        <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(330px,0.82fr)]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                <span className="signal-dot h-2 w-2 rounded-full bg-cyan-300" />
                orchestration
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                atualizado {formatTime(lastUpdated)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <TopMetric label="Throughput atual" value={String(campaignMetrics.avgThroughput)} />
              <TopMetric label="Queue pressure" value={String(campaignMetrics.queueTotal)} />
              <TopMetric label="Safe delivery rate" value={`${campaignMetrics.safeDeliveryRate}%`} />
              <TopMetric label="Operacoes ativas" value={String(campaignMetrics.activeOperations)} />
              <TopMetric label="Human review" value={String(campaignMetrics.reviewRequired)} />
            </div>

            <form onSubmit={handleCreate} className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Campanha"
                  className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500"
                />
                <select
                  value={form.templateId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, templateId: event.target.value }))
                  }
                  className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                >
                  <option value="" className="text-slate-950">
                    Template aprovado
                  </option>
                  {templateOptions.map((template) => (
                    <option key={template.id} value={template.id} className="text-slate-950">
                      {template.name} • {template.language}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={form.dailyLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dailyLimit: event.target.value }))
                  }
                  placeholder="Limite diario"
                  className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500"
                />
                <Input
                  type="number"
                  min={25}
                  max={3600}
                  value={form.delaySeconds}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, delaySeconds: event.target.value }))
                  }
                  placeholder="Delay base"
                  className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {AUDIENCE_SECTIONS.map((section) => {
                    const options = audienceOptions[section.key];
                    const fallback = section.key === "tags" ? availableTags : [];
                    const values = options.length > 0 ? options : fallback;

                    return (
                      <div
                        key={section.key}
                        className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {section.label}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {values.length === 0 ? (
                            <span className="rounded-full border border-white/8 bg-black/10 px-3 py-1.5 text-xs text-slate-500">
                              sem dados
                            </span>
                          ) : (
                            values.map((value) => {
                              const selected = audience[section.key].includes(value);

                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => toggleAudienceValue(section.key, value)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                    selected
                                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                                      : "border-white/8 bg-white/[0.03] text-slate-300"
                                  }`}
                                >
                                  {value}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-[20px] border border-cyan-400/15 bg-cyan-400/[0.08] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                    Publico elegivel
                  </p>
                  <p className="mt-3 text-4xl font-semibold text-white">{eligibleCount}</p>
                  <div className="mt-4 space-y-2 text-sm text-cyan-50/85">
                    <p>somente opt-in valido e status ativo</p>
                    <p>throughput adaptativo e distribuicao responsavel</p>
                    <p>failsafe apos {initialSettings.maxConsecutiveFailures} falhas consecutivas</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                  className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500"
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    className="flex-1 gap-2"
                    disabled={pending || templateOptions.length === 0}
                  >
                    <Megaphone className="h-4 w-4" />
                    Criar operacao
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={() => refreshCampaigns()}
                    disabled={pending}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>
            </form>

            {(error || feedback) && (
              <div className="grid gap-2">
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
                {feedback ? <p className="text-sm text-emerald-300">{feedback}</p> : null}
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#040b16]/90 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Event stream
                </p>
                <p className="mt-1 text-sm text-slate-300">fila, pacing, cooldown, revisao</p>
              </div>
              <RefreshCw className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-3 space-y-2">
              {liveEvents.length === 0 ? (
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
                  Nenhuma operacao ativa no momento.
                </div>
              ) : (
                liveEvents.map((event) => (
                  <article
                    key={event.id}
                    className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${event.tone}`} />
                      <p className="text-sm font-medium text-white">{event.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{event.detail}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Fila operacional de campanhas</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              estado atual, risco, throughput, reputacao, filas, acoes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                  statusFilter === status
                    ? "border-cyan-300 bg-cyan-300 text-slate-950"
                    : "border-white/8 bg-white/[0.03] text-slate-400"
                }`}
              >
                {status === "ALL" ? "Todas" : status}
              </button>
            ))}
          </div>
        </div>

        {visibleCampaigns.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Nenhuma campanha no filtro atual.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fila</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Throughput</th>
                  <th className="px-3 py-2 font-medium">Delay</th>
                  <th className="px-3 py-2 font-medium">Risco</th>
                  <th className="px-3 py-2 font-medium">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => {
                  const audienceSummary = getAudienceSummary(campaign);

                  return (
                    <tr key={campaign.id} className="align-top">
                      <td className="rounded-l-2xl border-y border-l border-white/8 bg-white/[0.03] px-3 py-3">
                        <p className="font-medium text-white">{campaign.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.template.name} • {campaign.template.language}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {audienceSummary.length === 0 ? (
                            <span className="rounded-full border border-white/8 px-2 py-1 text-[11px] text-slate-500">
                              todos os elegiveis
                            </span>
                          ) : (
                            audienceSummary.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-white/8 px-2 py-1 text-[11px] text-slate-400"
                              >
                                {tag}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <StatePill label={campaign.operationState?.pipelineStage ?? campaign.status} />
                        <p className="mt-2 text-xs text-slate-500">
                          {formatDateTime(campaign.updatedAt)}
                        </p>
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                        <p>{campaign.stats.PENDING} pendentes</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.stats.SENT} enviados • {campaign.stats.FAILED} falhas
                        </p>
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="safe delivery rate"
                          value={`${campaign.operationState?.deliveryRate ?? 0}%`}
                        />
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="adaptive throughput"
                          value={`${campaign.operationState?.activeThroughput ?? 0}/${campaign.operationState?.safeThroughput ?? 0}`}
                        />
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="adaptive delays"
                          value={`${campaign.operationState?.currentDelayMin ?? 0}s-${campaign.operationState?.currentDelayMax ?? campaign.delaySeconds}s`}
                        />
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <RiskBadge value={campaign.operationState?.riskScore ?? 0} />
                        {campaign.operationState?.recommendedAction ? (
                          <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">
                            {campaign.operationState.recommendedAction}
                          </p>
                        ) : null}
                      </td>
                      <td className="rounded-r-2xl border-y border-r border-white/8 bg-white/[0.03] px-3 py-3">
                        <div className="grid gap-2">
                          <Button
                            type="button"
                            className="justify-start gap-2"
                            onClick={() => openPreflight(campaign.id, campaign.name)}
                            disabled={pending}
                          >
                            <Play className="h-4 w-4" />
                            Analise pre-envio
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="justify-start gap-2 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            onClick={() => triggerAction(campaign.id, "send-next")}
                            disabled={pending || campaign.status !== "RUNNING"}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Processar lote
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="justify-start gap-2 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            onClick={() => triggerAction(campaign.id, "start")}
                            disabled={pending}
                          >
                            <Shield className="h-4 w-4" />
                            Iniciar
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className="justify-start gap-2"
                            onClick={() => triggerAction(campaign.id, "pause")}
                            disabled={pending}
                          >
                            <Pause className="h-4 w-4" />
                            Pausa segura
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PreflightCheckModal
        open={preflightOpen}
        loading={preflightLoading}
        actionLoading={preflightActionLoading}
        simulation={preflightSimulation}
        campaignName={preflightCampaignName}
        onClose={() => setPreflightOpen(false)}
        onStart={startWithRecommendedPlan}
        onReview={submitHumanReview}
      />
    </div>
  );
}

function normalizeCampaign(campaign: CampaignItem): CampaignItem {
  return {
    ...campaign,
    audience: campaign.audience ?? getAudienceSummary(campaign)
  };
}

function getAudienceSummary(campaign: CampaignItem) {
  if (campaign.audience && campaign.audience.length > 0) {
    return campaign.audience;
  }

  if (campaign.audienceConfig) {
    return [
      ...campaign.audienceConfig.tags,
      ...campaign.audienceConfig.groups,
      ...campaign.audienceConfig.priorities,
      ...campaign.audienceConfig.locations,
      ...campaign.audienceConfig.interests,
      ...campaign.audienceConfig.contactTypes
    ];
  }

  return campaign.segmentTags;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </article>
  );
}

function StatePill({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const tone =
    normalized.includes("risk")
      ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
      : normalized.includes("paused") || normalized.includes("throttled")
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : normalized.includes("sending") || normalized.includes("running")
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {label}
    </span>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function RiskBadge({ value }: { value: number }) {
  const tone =
    value >= 75
      ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
      : value >= 55
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {value}%
    </span>
  );
}
