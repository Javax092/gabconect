"use client";

import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Megaphone,
  Pause,
  Play,
  RefreshCw
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
  birthdayMonthDay?: string | null;
  tags: string[];
  groups: string[];
  priorities: string[];
  locations: string[];
  interests: string[];
  contactTypes: string[];
  selectedContactIds?: string[];
};

type AudienceFilterKey =
  | "tags"
  | "groups"
  | "priorities"
  | "locations"
  | "interests"
  | "contactTypes";

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
  initialPreflightCampaignId?: string | null;
  initialSelectedContactIds?: string[];
  deliveryMode: "REAL" | "SIMULACAO";
  initialSettings: {
    defaultDailyLimit: number;
    defaultDelaySeconds: number;
    maxConsecutiveFailures: number;
  };
};

type AudiencePreviewRecipient = {
  contactId: string;
  name: string;
  phone: string;
  code: string;
  tags: string[];
  birthday: string | null;
  optInStatus: string;
  inclusionReason: string;
  renderedPreview: string;
  importedAt: string;
  isEligible: boolean;
  alreadyQueued: boolean;
  selectionState: string;
};

type AudiencePreviewResponse = {
  totalElegiveis: number;
  totalInvalidos: number;
  totalBloqueados?: number;
  totalOptOut: number;
  totalSemTelefone: number;
  totalSemOptIn: number;
  totalEncontrados?: number;
  totalJaConfirmados?: number;
  totalSelecionados?: number;
  totalMatched?: number;
  blockedBy?: Array<{
    reason: string;
    count: number;
  }>;
  recipients: AudiencePreviewRecipient[];
  page: number;
  limit: number;
  totalPages: number;
};

type SelectionFilters = {
  query: string;
  optInFilter: "ALL" | "OPT_IN" | "SEM_OPT_IN" | "OPT_OUT";
  contactStatus: "ALL" | "ACTIVE" | "UNSUBSCRIBED" | "BLOCKED" | "INVALID";
  birthdayFilter: "ALL" | "WITH_BIRTHDAY" | "TODAY";
  sortBy: "name" | "code" | "importedAt";
  sortOrder: "asc" | "desc";
};

const AUDIENCE_SECTIONS: Array<{
  key: AudienceFilterKey;
  label: string;
}> = [
  { key: "tags", label: "Tags" },
  { key: "groups", label: "Grupos" },
  { key: "priorities", label: "Prioridade" },
  { key: "locations", label: "Localizacao" },
  { key: "interests", label: "Interesse" },
  { key: "contactTypes", label: "Tipo de contato" }
];

const ONBOARDING_STEPS = [
  {
    title: "1. Escolha o template",
    description:
      "Selecione um template oficial aprovado. Esse é o modelo validado pela Meta que será usado no envio."
  },
  {
    title: "2. Selecione os destinatários",
    description:
      "Busque contatos, aplique filtros e monte a lista manualmente. O sistema mostra quem pode seguir para revisão."
  },
  {
    title: "3. Revise a audiência",
    description:
      "Confira selecionados, encontrados, elegíveis e bloqueios críticos antes de criar a campanha."
  },
  {
    title: "4. Confirme o envio",
    description:
      "Valide a operação, revise o resumo operacional e autorize a entrada da campanha na fila supervisionada."
  },
  {
    title: "5. Acompanhe a operação",
    description:
      "Monitore status, timeline e eventos de processamento em tempo real até enviados, falhas e itens ignorados."
  }
] as const;

const HOW_DELIVERY_WORKS = [
  "Os destinatários passam por revisão de elegibilidade antes de entrar na operação.",
  "Somente contatos elegíveis são colocados na fila operacional.",
  "O worker processa os envios gradualmente, sem disparo instantâneo.",
  "O delay humano distribui as mensagens em cadência segura para proteger a operação.",
  "O compliance aplica bloqueios e salvaguardas automaticamente quando necessário.",
  "A timeline operacional registra eventos em tempo real para acompanhamento."
] as const;

const FIRST_CAMPAIGN_STEPS = [
  "Crie a campanha com nome, template oficial e parâmetros operacionais.",
  "Selecione manualmente os contatos que devem participar deste envio.",
  "Revise a audiência e confirme quem está elegível, bloqueado ou sem opt-in.",
  "Confirme o envio para colocar a campanha na fila supervisionada.",
  "Acompanhe a operação em tempo real na central operacional.",
  "Ao final, verifique enviados, simulados, falhas e itens ignorados."
] as const;

const REFRESH_INTERVAL_MS = 20000;

export function CampaignsManager({
  initialCampaigns,
  templateOptions,
  availableTags,
  audienceOptions,
  initialEligibleCount,
  initialPreflightCampaignId,
  initialSelectedContactIds = [],
  deliveryMode,
  initialSettings
}: CampaignsManagerProps) {
  const router = useRouter();
  const initialAudience: AudienceConfig = {
    birthdayMonthDay: null,
    tags: [],
    groups: [],
    priorities: [],
    locations: [],
    interests: [],
    contactTypes: [],
    selectedContactIds: initialSelectedContactIds
  };
  const emptySelectionFilters: SelectionFilters = {
    query: "",
    optInFilter: "ALL",
    contactStatus: "ALL",
    birthdayFilter: "ALL",
    sortBy: "name",
    sortOrder: "asc"
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
  const [audience, setAudience] = useState<AudienceConfig>(initialAudience);
  const [eligibleCount, setEligibleCount] = useState(initialEligibleCount);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [pending, setPending] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightActionLoading, setPreflightActionLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [preflightCampaignName, setPreflightCampaignName] = useState<string | null>(null);
  const [preflightTemplateName, setPreflightTemplateName] = useState<string | null>(null);
  const [preflightSimulation, setPreflightSimulation] = useState<SimulationResponse["simulation"] | null>(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [campaignAudiencePreview, setCampaignAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [campaignAudiencePreviewLoading, setCampaignAudiencePreviewLoading] = useState(false);
  const [campaignAudiencePreviewPage, setCampaignAudiencePreviewPage] = useState(1);
  const [draftAudiencePreview, setDraftAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [draftAudiencePreviewLoading, setDraftAudiencePreviewLoading] = useState(false);
  const [selectedAudiencePreview, setSelectedAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [selectedAudiencePreviewLoading, setSelectedAudiencePreviewLoading] = useState(false);
  const [selectionFilters, setSelectionFilters] = useState<SelectionFilters>(emptySelectionFilters);
  const [draftAudiencePreviewPage, setDraftAudiencePreviewPage] = useState(1);
  const [bootstrappedPreflight, setBootstrappedPreflight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const selectedContactIds = useMemo(
    () => audience.selectedContactIds ?? [],
    [audience.selectedContactIds]
  );

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
    const template = templateOptions.find((item) => item.id === form.templateId);

    if (!template) {
      setDraftAudiencePreview(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("templateId", template.id);
    params.set("page", String(draftAudiencePreviewPage));
    params.set("limit", "10");
    params.set("sortBy", selectionFilters.sortBy);
    params.set("sortOrder", selectionFilters.sortOrder);
    params.set("query", selectionFilters.query);
    params.set("optInFilter", selectionFilters.optInFilter);
    params.set("contactStatus", selectionFilters.contactStatus);
    params.set("birthdayFilter", selectionFilters.birthdayFilter);
    params.set(
      "audienceFilter",
      JSON.stringify({
        birthdayMonthDay: null,
        tags: [],
        groups: [],
        priorities: [],
        locations: [],
        interests: [],
        contactTypes: []
      })
    );

    setDraftAudiencePreviewLoading(true);
    fetch(`/api/campaigns/audience-preview?${params.toString()}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const data = (await response.json()) as AudiencePreviewResponse;
        if (response.ok) {
          setDraftAudiencePreview(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setDraftAudiencePreviewLoading(false);
      });

    return () => controller.abort();
  }, [
    audience.birthdayMonthDay,
    audience.contactTypes,
    audience.groups,
    audience.interests,
    audience.locations,
    audience.priorities,
    audience.tags,
    draftAudiencePreviewPage,
    form.templateId,
    selectionFilters,
    templateOptions
  ]);

  useEffect(() => {
    const template = templateOptions.find((item) => item.id === form.templateId);

    if (!template || selectedContactIds.length === 0) {
      setSelectedAudiencePreview(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("templateId", template.id);
    params.set("page", "1");
    params.set("limit", "100");
    params.set("sortBy", "name");
    params.set("sortOrder", "asc");
    params.set("selectedOnly", "true");
    for (const contactId of selectedContactIds) {
      params.append("selectedContactIds", contactId);
    }
    params.set(
      "audienceFilter",
      JSON.stringify({
        birthdayMonthDay: audience.birthdayMonthDay,
        tags: audience.tags,
        groups: audience.groups,
        priorities: audience.priorities,
        locations: audience.locations,
        interests: audience.interests,
        contactTypes: audience.contactTypes
      })
    );

    setSelectedAudiencePreviewLoading(true);
    fetch(`/api/campaigns/audience-preview?${params.toString()}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const data = (await response.json()) as AudiencePreviewResponse;
        if (response.ok) {
          setSelectedAudiencePreview(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setSelectedAudiencePreviewLoading(false);
      });

    return () => controller.abort();
  }, [
    audience.birthdayMonthDay,
    audience.contactTypes,
    audience.groups,
    audience.interests,
    audience.locations,
    audience.priorities,
    audience.tags,
    form.templateId,
    selectedContactIds,
    templateOptions
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshCampaigns({ silent: true }).catch(() => undefined);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setDraftAudiencePreviewPage(1);
  }, [form.templateId, selectionFilters, audience.tags, audience.groups, audience.priorities, audience.locations, audience.interests, audience.contactTypes, audience.birthdayMonthDay]);

  useEffect(() => {
    if (!initialPreflightCampaignId || bootstrappedPreflight) {
      return;
    }

    const campaign = campaigns.find((item) => item.id === initialPreflightCampaignId);
    if (!campaign) {
      return;
    }

    setBootstrappedPreflight(true);
    openPreflight(campaign.id, campaign.name, campaign.template.name).catch(() => undefined);
  }, [bootstrappedPreflight, initialPreflightCampaignId, campaigns]);

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

  function toggleAudienceValue(section: AudienceFilterKey, value: string) {
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

  function updateSelectionFilter<Key extends keyof SelectionFilters>(
    key: Key,
    value: SelectionFilters[Key]
  ) {
    setSelectionFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function toggleRecipientSelection(contactId: string) {
    setAudience((current) => {
      const currentIds = current.selectedContactIds ?? [];
      const nextIds = currentIds.includes(contactId)
        ? currentIds.filter((item) => item !== contactId)
        : [...currentIds, contactId];

      return {
        ...current,
        selectedContactIds: nextIds
      };
    });
  }

  function selectDraftPageRecipients() {
    const draftRecipients = draftAudiencePreview?.recipients ?? [];

    if (draftRecipients.length === 0) {
      return;
    }

    setAudience((current) => {
      const currentIds = new Set(current.selectedContactIds ?? []);
      for (const recipient of draftRecipients) {
        currentIds.add(recipient.contactId);
      }

      return {
        ...current,
        selectedContactIds: [...currentIds]
      };
    });
  }

  function clearSelectedRecipients() {
    setAudience((current) => ({
      ...current,
      selectedContactIds: []
    }));
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
          selectedContactIds: audience.selectedContactIds ?? [],
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
      setAudience({
        ...initialAudience,
        selectedContactIds: []
      });
      setSelectionFilters(emptySelectionFilters);
      setDraftAudiencePreviewPage(1);
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

  async function runBirthdayTestCampaign() {
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const createResponse = await fetch("/api/campaigns/test-birthday", {
        method: "POST"
      });
      const createData = (await createResponse.json()) as {
        campaignId?: string;
        message?: string;
      };

      if (!createResponse.ok || !createData.campaignId) {
        setError(getApiErrorMessage(createData, "Nao foi possivel criar a campanha de aniversario."));
        return;
      }

      const startResponse = await fetch(`/api/campaigns/${createData.campaignId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          confirmedAudience: true
        })
      });
      const startData = (await startResponse.json()) as { message?: string };

      if (!startResponse.ok) {
        setError(getApiErrorMessage(startData, "Nao foi possivel iniciar o teste de aniversario."));
        return;
      }

      await refreshCampaigns({ silent: true });
      setFeedback(startData.message ?? "Teste de aniversario enfileirado.");
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function loadCampaignAudiencePreview(campaignId: string, page = 1) {
    setCampaignAudiencePreviewLoading(true);

    try {
      const response = await fetch(
        `/api/campaigns/audience-preview?campaignId=${campaignId}&page=${page}&limit=8&sortBy=name&sortOrder=asc`
      );
      const data = (await response.json()) as AudiencePreviewResponse;

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Nao foi possivel revisar os destinatarios."));
        return;
      }

      setCampaignAudiencePreview(data);
      setCampaignAudiencePreviewPage(page);
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setCampaignAudiencePreviewLoading(false);
    }
  }

  async function openPreflight(campaignId: string, campaignName: string, templateName?: string) {
    setPreflightOpen(true);
    setPreflightLoading(true);
    setCampaignAudiencePreviewLoading(true);
    setPreflightSimulation(null);
    setCampaignAudiencePreview(null);
    setCampaignAudiencePreviewPage(1);
    setSelectedCampaignId(campaignId);
    setPreflightCampaignName(campaignName);
    setPreflightTemplateName(templateName ?? null);
    setPreviewConfirmed(false);
    setError(null);
    setFeedback(null);

    try {
      const [preflightResponse, previewResponse] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/preflight`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({})
        }),
        fetch(`/api/campaigns/audience-preview?campaignId=${campaignId}&page=1&limit=8&sortBy=name&sortOrder=asc`)
      ]);
      const preflightData = (await preflightResponse.json()) as SimulationResponse;
      const previewData = (await previewResponse.json()) as AudiencePreviewResponse;

      if (!preflightResponse.ok || !preflightData.simulation) {
        setError(getApiErrorMessage(preflightData, "Nao foi possivel gerar a analise pre-envio."));
        return;
      }

      if (!previewResponse.ok) {
        setError(getApiErrorMessage(previewData, "Nao foi possivel revisar os destinatarios."));
        return;
      }

      setPreflightSimulation(preflightData.simulation);
      setCampaignAudiencePreview(previewData);
      setCampaignAudiencePreviewPage(previewData.page);
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPreflightLoading(false);
      setCampaignAudiencePreviewLoading(false);
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
    if (!selectedCampaignId || !previewConfirmed) {
      return;
    }

    setPreflightActionLoading(true);

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          confirmedAudience: true
        })
      });
      const data = (await response.json()) as { message?: string; redirectTo?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Nao foi possivel iniciar a campanha."));
        return;
      }

      setFeedback(data.message ?? "Campanha iniciada com plano recomendado.");
      setPreflightOpen(false);
      await refreshCampaigns({ silent: true });
      if (data.redirectTo) {
        router.push(data.redirectTo as Route);
      }
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPreflightActionLoading(false);
    }
  }

  function handleClosePreflight() {
    setPreflightOpen(false);
    if (typeof window !== "undefined" && window.location.search.includes("preflightCampaignId")) {
      router.replace("/admin/campaigns");
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
                fluxo supervisionado
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                atualizado {formatTime(lastUpdated)}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white lg:text-[2rem]">
                  Crie, valide e acompanhe campanhas com clareza operacional.
                </h2>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                  Uma campanha organiza um envio oficial de WhatsApp a partir de um template aprovado.
                  Depois do início, os contatos elegíveis entram em uma fila supervisionada, o worker
                  processa os envios gradualmente, o delay humano preserva a cadência e a timeline mostra
                  cada etapa da operação.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {ONBOARDING_STEPS.map((step) => (
                  <article
                    key={step.title}
                    className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <TopMetric label="Cadência atual" value={String(campaignMetrics.avgThroughput)} />
              <TopMetric label="Em fila agora" value={String(campaignMetrics.queueTotal)} />
              <TopMetric label="Entrega segura" value={`${campaignMetrics.safeDeliveryRate}%`} />
              <TopMetric label="Campanhas ativas" value={String(campaignMetrics.activeOperations)} />
              <TopMetric label="Revisão humana" value={String(campaignMetrics.reviewRequired)} />
            </div>

            <form onSubmit={handleCreate} className="grid gap-4">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Criar campanha</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Escolha um template oficial, selecione os contatos manualmente e configure a
                      operação. O envio real só começa depois da validação final.
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-slate-400">
                    <p>
                      <span className="font-medium text-slate-200">Template oficial:</span> mensagem aprovada para envio institucional no WhatsApp.
                    </p>
                    <p>
                      <span className="font-medium text-slate-200">Opt-in:</span> autorização do contato para receber mensagens deste canal.
                    </p>
                    <p>
                      <span className="font-medium text-slate-200">Elegível x bloqueado:</span> elegíveis podem entrar na fila; bloqueados, opt-out e inválidos ficam fora da operação.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nome da campanha"
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
                    Escolha o template oficial
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
                  placeholder="Limite operacional por dia"
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
                  placeholder="Intervalo base entre mensagens"
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
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {section.key === "tags"
                            ? "Use tags para reunir públicos com o mesmo contexto operacional."
                            : section.key === "groups"
                              ? "Grupos ajudam a separar bases por frente de atuação ou origem."
                              : section.key === "priorities"
                                ? "Prioridade organiza quem deve receber atenção primeiro."
                                : section.key === "locations"
                                  ? "Localização restringe o envio por território ou unidade."
                                  : section.key === "interests"
                                    ? "Interesses refinam o público conforme tema ou pauta."
                                    : "Tipo de contato diferencia perfis e canais cadastrados."}
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
                    Público elegível
                  </p>
                  <p className="mt-3 text-4xl font-semibold text-white">{eligibleCount}</p>
                  <div className="mt-4 space-y-2 text-sm text-cyan-50/85">
                    <p>somente contatos com opt-in válido e status ativo podem seguir</p>
                    <p>a cadência operacional é ajustada automaticamente para proteger o número</p>
                    <p>o failsafe pausa a operação após {initialSettings.maxConsecutiveFailures} falhas consecutivas</p>
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
                    disabled={
                      pending ||
                      templateOptions.length === 0 ||
                      (audience.selectedContactIds?.length ?? 0) === 0
                    }
                  >
                    <Megaphone className="h-4 w-4" />
                    Criar operação
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={runBirthdayTestCampaign}
                    disabled={pending || templateOptions.length === 0}
                  >
                    Executar envio de teste
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
                  Operação em tempo real
                </p>
                <p className="mt-1 text-sm text-slate-300">fila, cadência, proteção, revisão e eventos de envio</p>
              </div>
              <RefreshCw className="h-4 w-4 text-cyan-300" />
            </div>
            <div className="mt-3 space-y-2">
              {liveEvents.length === 0 ? (
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
                  Nenhuma campanha em execução no momento.
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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <article className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-sm font-semibold text-white">Como funciona o envio</p>
            <p className="mt-1 text-sm text-slate-400">
              Entenda o que acontece entre a validação e o acompanhamento da campanha.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {HOW_DELIVERY_WORKS.map((item, index) => (
              <article
                key={item}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                  Etapa {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-sm font-semibold text-white">Primeira campanha</p>
            <p className="mt-1 text-sm text-slate-400">
              Sequência recomendada para o primeiro envio operacional.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {FIRST_CAMPAIGN_STEPS.map((item, index) => (
              <div
                key={item}
                className="flex gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-4"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-xs font-semibold text-cyan-100">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Campanhas em operação</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              estado atual, fila, entrega, cadência, risco e ações disponíveis
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
                  <th className="px-3 py-2 font-medium">Entrega</th>
                  <th className="px-3 py-2 font-medium">Cadência</th>
                  <th className="px-3 py-2 font-medium">Delay humano</th>
                  <th className="px-3 py-2 font-medium">Risco</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
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
                              todos os elegíveis
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
                        <p>{campaign.stats.PENDING} aguardando processamento</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.stats.SENT} enviados • {campaign.stats.FAILED} falhas
                        </p>
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="taxa de entrega segura"
                          value={`${campaign.operationState?.deliveryRate ?? 0}%`}
                        />
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="mensagens por janela"
                          value={`${campaign.operationState?.activeThroughput ?? 0}/${campaign.operationState?.safeThroughput ?? 0}`}
                        />
                      </td>
                      <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                        <DataCell
                          label="intervalo aplicado"
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
                            onClick={() => openPreflight(campaign.id, campaign.name, campaign.template.name)}
                            disabled={pending}
                          >
                            <Play className="h-4 w-4" />
                            Revisar envio
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="justify-start gap-2 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                            onClick={() => triggerAction(campaign.id, "send-next")}
                            disabled={pending || campaign.status !== "RUNNING"}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Acompanhar operação
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className="justify-start gap-2"
                            onClick={() => triggerAction(campaign.id, "pause")}
                            disabled={pending}
                          >
                            <Pause className="h-4 w-4" />
                            Pausar operação
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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <article className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Selecionar destinatários</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                busca, filtros, elegibilidade e preview individual
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Use os filtros para montar a audiência manualmente. O preview mostra quem está
                elegível, quem será bloqueado e como a mensagem será renderizada para cada contato.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Selecionados {audience.selectedContactIds?.length ?? 0}</span>
              <span>Elegíveis {draftAudiencePreview?.totalElegiveis ?? 0}</span>
              <span>Bloqueados {(draftAudiencePreview?.totalBloqueados ?? 0) + (draftAudiencePreview?.totalInvalidos ?? 0)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input
              value={selectionFilters.query}
              onChange={(event) => updateSelectionFilter("query", event.target.value)}
              placeholder="Buscar nome, telefone ou código"
              className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 xl:col-span-2"
            />
            <select
              value={selectionFilters.optInFilter}
              onChange={(event) => updateSelectionFilter("optInFilter", event.target.value as SelectionFilters["optInFilter"])}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
            >
              <option value="ALL" className="text-slate-950">Opt-in: todos</option>
              <option value="OPT_IN" className="text-slate-950">Opt-in</option>
              <option value="SEM_OPT_IN" className="text-slate-950">Sem opt-in</option>
              <option value="OPT_OUT" className="text-slate-950">Opt-out</option>
            </select>
            <select
              value={selectionFilters.contactStatus}
              onChange={(event) => updateSelectionFilter("contactStatus", event.target.value as SelectionFilters["contactStatus"])}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
            >
              <option value="ALL" className="text-slate-950">Status: todos</option>
              <option value="ACTIVE" className="text-slate-950">Ativos</option>
              <option value="UNSUBSCRIBED" className="text-slate-950">Opt-out</option>
              <option value="BLOCKED" className="text-slate-950">Bloqueados</option>
              <option value="INVALID" className="text-slate-950">Sem telefone</option>
            </select>
            <select
              value={selectionFilters.birthdayFilter}
              onChange={(event) => updateSelectionFilter("birthdayFilter", event.target.value as SelectionFilters["birthdayFilter"])}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
            >
              <option value="ALL" className="text-slate-950">Aniversário: todos</option>
              <option value="WITH_BIRTHDAY" className="text-slate-950">Com aniversário</option>
              <option value="TODAY" className="text-slate-950">Aniversário hoje</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectionFilters.sortBy}
                onChange={(event) => updateSelectionFilter("sortBy", event.target.value as SelectionFilters["sortBy"])}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
              >
                <option value="name" className="text-slate-950">Nome</option>
                <option value="code" className="text-slate-950">Código</option>
                <option value="importedAt" className="text-slate-950">Importação</option>
              </select>
              <select
                value={selectionFilters.sortOrder}
                onChange={(event) => updateSelectionFilter("sortOrder", event.target.value as SelectionFilters["sortOrder"])}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
              >
                <option value="asc" className="text-slate-950">Asc</option>
                <option value="desc" className="text-slate-950">Desc</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              onClick={selectDraftPageRecipients}
              disabled={draftAudiencePreviewLoading || !draftAudiencePreview || draftAudiencePreview.recipients.length === 0}
            >
              Selecionar desta página
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              onClick={clearSelectedRecipients}
              disabled={(audience.selectedContactIds?.length ?? 0) === 0}
            >
              Limpar seleção
            </Button>
          </div>

          <div className="rounded-[18px] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-sm text-cyan-50/85">
            Destinatários selecionados manualmente não dependem dos filtros da campanha.
          </div>

          {draftAudiencePreviewLoading ? (
            <div className="py-8 text-sm text-slate-400">Carregando audiência prevista...</div>
          ) : !form.templateId ? (
            <div className="py-8 text-sm text-slate-400">Selecione um template oficial para liberar o preview individual.</div>
          ) : !draftAudiencePreview || draftAudiencePreview.recipients.length === 0 ? (
            <div className="py-8 text-sm text-slate-400">Nenhum contato encontrado no filtro atual.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-2 font-medium">Sel.</th>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Telefone</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Tags</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                    <th className="px-3 py-2 font-medium">Preview individual</th>
                  </tr>
                </thead>
                <tbody>
                  {draftAudiencePreview.recipients.map((recipient) => {
                    const selected = audience.selectedContactIds?.includes(recipient.contactId) ?? false;

                    return (
                      <tr key={recipient.contactId} className="align-top">
                        <td className="rounded-l-2xl border-y border-l border-white/8 bg-white/[0.03] px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRecipientSelection(recipient.contactId)}
                            className="h-4 w-4 rounded border-white/20 bg-slate-950"
                          />
                        </td>
                        <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-white">
                          <p>{recipient.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(recipient.importedAt)}
                          </p>
                        </td>
                        <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                          {recipient.phone || "—"}
                        </td>
                        <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 font-mono text-xs tracking-[0.18em] text-slate-300">
                          {recipient.code}
                        </td>
                        <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                          {recipient.tags.join(", ") || "—"}
                        </td>
                        <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3">
                          <SelectionStateBadge state={recipient.selectionState} />
                        </td>
                        <td className="rounded-r-2xl border-y border-r border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                          {recipient.renderedPreview}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Página {draftAudiencePreview.page} de {draftAudiencePreview.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={() => setDraftAudiencePreviewPage((current) => Math.max(1, current - 1))}
                    disabled={draftAudiencePreviewPage <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    onClick={() =>
                      setDraftAudiencePreviewPage((current) =>
                        Math.min(draftAudiencePreview.totalPages, current + 1)
                      )
                    }
                    disabled={draftAudiencePreviewPage >= draftAudiencePreview.totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-white">Destinatários selecionados</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                revisão final antes de criar a operação
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Revise a audiência final antes de validar a operação. Aqui você confirma quem
                realmente seguirá para a etapa de confirmação de envio.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Total {selectedAudiencePreview?.totalSelecionados ?? audience.selectedContactIds?.length ?? 0}</span>
              <span>Encontrados {selectedAudiencePreview?.totalEncontrados ?? 0}</span>
              <span>Elegíveis {selectedAudiencePreview?.totalElegiveis ?? 0}</span>
              <span>Telefone inválido {selectedAudiencePreview?.totalInvalidos ?? 0}</span>
              <span>Opt-out {selectedAudiencePreview?.totalOptOut ?? 0}</span>
              <span>Enfileirados {selectedAudiencePreview?.totalJaConfirmados ?? 0}</span>
            </div>
          </div>

          {selectedAudiencePreviewLoading ? (
            <div className="py-8 text-sm text-slate-400">Carregando destinatários selecionados...</div>
          ) : (audience.selectedContactIds?.length ?? 0) === 0 ? (
            <div className="py-8 text-sm text-slate-400">Nenhum destinatário selecionado.</div>
          ) : !selectedAudiencePreview ? (
            <div className="py-8 text-sm text-slate-400">Selecione um template para gerar o preview individual.</div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
                {selectedAudiencePreview.recipients.map((recipient) => (
                  <article
                    key={recipient.contactId}
                    className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{recipient.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {recipient.phone || "—"} • {recipient.code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <SelectionStateBadge state={recipient.selectionState} />
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-slate-300 hover:bg-white/5 hover:text-white"
                          onClick={() => toggleRecipientSelection(recipient.contactId)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                      Preview individual
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {recipient.renderedPreview}
                    </p>
                  </article>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Destinatários selecionados manualmente não dependem dos filtros da campanha; apenas telefone válido, opt-out e bloqueio explícito podem impedir a fila.
              </p>
            </div>
          )}
        </article>
      </section>

      <PreflightCheckModal
        open={preflightOpen}
        loading={preflightLoading}
        actionLoading={preflightActionLoading}
        simulation={preflightSimulation}
        audiencePreview={campaignAudiencePreview}
        audienceLoading={campaignAudiencePreviewLoading}
        campaignName={preflightCampaignName}
        templateName={preflightTemplateName}
        modeLabel={deliveryMode}
        confirmed={previewConfirmed}
        onClose={handleClosePreflight}
        onStart={startWithRecommendedPlan}
        onReview={submitHumanReview}
        onConfirmChange={setPreviewConfirmed}
        onPageChange={(page) => {
          if (!selectedCampaignId) {
            return;
          }

          loadCampaignAudiencePreview(selectedCampaignId, page).catch(() => undefined);
        }}
        currentPage={campaignAudiencePreviewPage}
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
      ...campaign.audienceConfig.contactTypes,
      ...(campaign.audienceConfig.birthdayMonthDay
        ? [`aniversario ${campaign.audienceConfig.birthdayMonthDay}`]
        : [])
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

function SelectionStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ELEGIVEL: {
      label: "Elegível",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
    },
    BLOQUEADO: {
      label: "Bloqueado",
      className: "border-rose-400/20 bg-rose-400/10 text-rose-200"
    },
    SEM_OPT_IN: {
      label: "Sem opt-in",
      className: "border-amber-400/20 bg-amber-400/10 text-amber-200"
    },
    SEM_TELEFONE: {
      label: "Sem telefone",
      className: "border-slate-400/20 bg-slate-400/10 text-slate-200"
    },
    OPT_OUT: {
      label: "Opt-out",
      className: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200"
    },
    JA_ENFILEIRADO: {
      label: "Já enfileirado",
      className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
    }
  };

  const resolved = map[state] ?? {
    label: state,
    className: "border-white/10 bg-white/[0.04] text-white"
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${resolved.className}`}>
      {resolved.label}
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
