"use client";

import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Eye,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  XCircle
} from "lucide-react";

import { PreflightCheckModal } from "@/components/campaigns/preflight-check-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getApiErrorMessage } from "@/lib/utils";

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
    PROCESSING: number;
    QUEUED: number;
    SENT: number;
    FAILED: number;
    SKIPPED: number;
    UNSUBSCRIBED: number;
    CANCELLED: number;
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

const WIZARD_STEPS = ["Template", "Audiência", "Revisão", "Confirmar envio"] as const;

const DETAIL_TABS = ["Resumo", "Resultados", "Timeline", "Audiência"] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

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
  const [activeWizardStep, setActiveWizardStep] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTab>("Resumo");
  const [selectedDetailCampaignId, setSelectedDetailCampaignId] = useState<string | null>(
    initialCampaigns[0]?.id ?? null
  );
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
  const selectedContactIds = useMemo(
    () => audience.selectedContactIds ?? [],
    [audience.selectedContactIds]
  );

  useEffect(() => {
    setCampaigns(initialCampaigns.map(normalizeCampaign));
  }, [initialCampaigns]);

  useEffect(() => {
    if (campaigns.length === 0) {
      setSelectedDetailCampaignId(null);
      return;
    }

    if (!selectedDetailCampaignId || !campaigns.some((campaign) => campaign.id === selectedDetailCampaignId)) {
      setSelectedDetailCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedDetailCampaignId]);

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

  const statusOptions = useMemo(() => {
    return ["ALL", "RUNNING", "DRAFT", "SCHEDULED", "PAUSED", "COMPLETED"];
  }, [campaigns]);

  const selectedDetailCampaign =
    campaigns.find((campaign) => campaign.id === selectedDetailCampaignId) ?? campaigns[0] ?? null;

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
    if (!silent) {
      setFeedback("Campanhas atualizadas.");
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
      setActiveWizardStep(0);
      setFeedback(data.message ?? "Campanha criada.");
      await refreshCampaigns({ silent: true });
    } catch {
      setError("Falha de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function triggerAction(campaignId: string, action: "start" | "pause" | "cancel" | "send-next") {
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
    <div className="space-y-6">
      {(error || feedback) && (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}
        >
          {error ?? feedback}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft ring-1 ring-white/70">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Campanhas</h2>
            <p className="mt-1 text-sm text-slate-500">Status, público, entrega e ações principais.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  statusFilter === status
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                {status === "ALL" ? "Todas" : getStatusLabel(status)}
              </button>
            ))}
            <Button type="button" variant="secondary" className="h-9 rounded-full px-3" onClick={() => refreshCampaigns()} disabled={pending}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {visibleCampaigns.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Nenhuma campanha no filtro atual.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-3">Campanha</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Público</th>
                  <th className="px-3 py-3">Enviadas</th>
                  <th className="px-3 py-3">Falhas</th>
                  <th className="px-3 py-3">Entrega</th>
                  <th className="px-3 py-3">Criada em</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => {
                  const audienceSummary = getAudienceSummary(campaign);
                  const deliveryRate = getDeliveryRate(campaign);

                  return (
                    <tr
                      key={campaign.id}
                      className={cn(
                        "border-b border-slate-100 align-middle transition hover:bg-slate-50/80",
                        selectedDetailCampaign?.id === campaign.id && "bg-slate-50"
                      )}
                    >
                      <td className="px-3 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailCampaignId(campaign.id)}
                          className="text-left"
                        >
                          <span className="font-semibold text-slate-950">{campaign.name}</span>
                        </button>
                        <p className="mt-1 text-xs text-slate-500">
                          {campaign.template.name} • {campaign.template.language}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        <span>{campaign.stats.total || campaign.sentCount + campaign.failedCount}</span>
                        <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">
                          {audienceSummary.length > 0 ? audienceSummary.slice(0, 3).join(", ") : "Todos os elegíveis"}
                        </p>
                      </td>
                      <td className="px-3 py-4 font-medium text-slate-950">
                        {campaign.stats.SENT || campaign.sentCount}
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {campaign.stats.FAILED || campaign.failedCount}
                      </td>
                      <td className="px-3 py-4 text-slate-700">{deliveryRate}%</td>
                      <td className="px-3 py-4 text-slate-500">{formatDateTime(campaign.createdAt)}</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 rounded-xl px-3"
                            onClick={() => setSelectedDetailCampaignId(campaign.id)}
                            disabled={pending}
                          >
                            <Eye className="h-4 w-4" />
                            Ver
                          </Button>
                          <Button
                            type="button"
                            className="h-9 rounded-xl px-3"
                            onClick={() => openPreflight(campaign.id, campaign.name, campaign.template.name)}
                            disabled={pending || ["RUNNING", "COMPLETED", "CANCELLED"].includes(campaign.status)}
                          >
                            <Play className="h-4 w-4" />
                            Iniciar
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 rounded-xl px-3"
                            onClick={() => triggerAction(campaign.id, "pause")}
                            disabled={pending || campaign.status !== "RUNNING"}
                          >
                            <Pause className="h-4 w-4" />
                            Pausar
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className="h-9 rounded-xl px-3"
                            onClick={() => triggerAction(campaign.id, "cancel")}
                            disabled={pending || ["COMPLETED", "CANCELLED"].includes(campaign.status)}
                          >
                            <XCircle className="h-4 w-4" />
                            Cancelar
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

      {selectedDetailCampaign ? (
        <CampaignDetail
          campaign={selectedDetailCampaign}
          activeTab={detailTab}
          onTabChange={setDetailTab}
        />
      ) : null}

      <section id="nova-campanha" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft ring-1 ring-white/70">
        <form onSubmit={handleCreate} className="space-y-6">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Nova Campanha</h2>
              <p className="mt-1 text-sm text-slate-500">Wizard em 4 etapas para criar e revisar o envio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {WIZARD_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveWizardStep(index)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    activeWizardStep === index
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {index + 1}. {step}
                </button>
              ))}
            </div>
          </div>

          {activeWizardStep === 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Nome da campanha">
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex: Prestação de contas - Junho"
                />
              </Field>
              <Field label="Template">
                <select
                  value={form.templateId}
                  onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                >
                  <option value="">Selecione um template</option>
                  {templateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} - {template.language}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data de envio">
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Limite diário">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={form.dailyLimit}
                    onChange={(event) => setForm((current) => ({ ...current, dailyLimit: event.target.value }))}
                  />
                </Field>
                <Field label="Intervalo">
                  <Input
                    type="number"
                    min={25}
                    max={3600}
                    value={form.delaySeconds}
                    onChange={(event) => setForm((current) => ({ ...current, delaySeconds: event.target.value }))}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {activeWizardStep === 1 ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {AUDIENCE_SECTIONS.map((section) => {
                  const options = audienceOptions[section.key];
                  const fallback = section.key === "tags" ? availableTags : [];
                  const values = options.length > 0 ? options : fallback;

                  return (
                    <div key={section.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-950">{section.label}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {values.length === 0 ? (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
                            Sem dados
                          </span>
                        ) : (
                          values.map((value) => {
                            const selected = audience[section.key].includes(value);

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => toggleAudienceValue(section.key, value)}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                                  selected
                                    ? "border-brand-600 bg-brand-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                )}
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

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="relative xl:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={selectionFilters.query}
                      onChange={(event) => updateSelectionFilter("query", event.target.value)}
                      placeholder="Buscar contato"
                      className="pl-9"
                    />
                  </div>
                  <select
                    value={selectionFilters.optInFilter}
                    onChange={(event) => updateSelectionFilter("optInFilter", event.target.value as SelectionFilters["optInFilter"])}
                    className="h-12 rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none"
                  >
                    <option value="ALL">Opt-in: todos</option>
                    <option value="OPT_IN">Opt-in</option>
                    <option value="SEM_OPT_IN">Sem opt-in</option>
                    <option value="OPT_OUT">Opt-out</option>
                  </select>
                  <select
                    value={selectionFilters.contactStatus}
                    onChange={(event) => updateSelectionFilter("contactStatus", event.target.value as SelectionFilters["contactStatus"])}
                    className="h-12 rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none"
                  >
                    <option value="ALL">Status: todos</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="UNSUBSCRIBED">Opt-out</option>
                    <option value="BLOCKED">Bloqueados</option>
                    <option value="INVALID">Sem telefone</option>
                  </select>
                  <select
                    value={selectionFilters.birthdayFilter}
                    onChange={(event) => updateSelectionFilter("birthdayFilter", event.target.value as SelectionFilters["birthdayFilter"])}
                    className="h-12 rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none"
                  >
                    <option value="ALL">Aniversário: todos</option>
                    <option value="WITH_BIRTHDAY">Com aniversário</option>
                    <option value="TODAY">Aniversário hoje</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 flex-1"
                      onClick={selectDraftPageRecipients}
                      disabled={draftAudiencePreviewLoading || !draftAudiencePreview || draftAudiencePreview.recipients.length === 0}
                    >
                      Selecionar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-12"
                      onClick={clearSelectedRecipients}
                      disabled={(audience.selectedContactIds?.length ?? 0) === 0}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>

                <AudiencePreviewTable
                  loading={draftAudiencePreviewLoading}
                  templateSelected={Boolean(form.templateId)}
                  preview={draftAudiencePreview}
                  selectedIds={audience.selectedContactIds ?? []}
                  onToggle={toggleRecipientSelection}
                  page={draftAudiencePreviewPage}
                  onPageChange={setDraftAudiencePreviewPage}
                />
              </div>
            </div>
          ) : null}

          {activeWizardStep === 2 ? (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-950">Resumo</p>
                <div className="mt-4 grid gap-3 text-sm">
                  <ReviewLine label="Template" value={templateOptions.find((item) => item.id === form.templateId)?.name ?? "Não selecionado"} />
                  <ReviewLine label="Selecionados" value={String(audience.selectedContactIds?.length ?? 0)} />
                  <ReviewLine label="Elegíveis" value={String(selectedAudiencePreview?.totalElegiveis ?? 0)} />
                  <ReviewLine label="Data" value={form.scheduledAt ? formatDateTime(form.scheduledAt) : "Envio manual"} />
                </div>
              </div>
              <SelectedAudienceList
                loading={selectedAudiencePreviewLoading}
                preview={selectedAudiencePreview}
                selectedCount={audience.selectedContactIds?.length ?? 0}
                onRemove={toggleRecipientSelection}
              />
            </div>
          ) : null}

          {activeWizardStep === 3 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="grid gap-4 md:grid-cols-4">
                <SummaryMetric label="Template" value={templateOptions.find((item) => item.id === form.templateId)?.name ?? "-"} />
                <SummaryMetric label="Audiência" value={`${audience.selectedContactIds?.length ?? 0} contatos`} />
                <SummaryMetric label="Elegíveis" value={String(selectedAudiencePreview?.totalElegiveis ?? 0)} />
                <SummaryMetric label="Modo" value={deliveryMode} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={pending || templateOptions.length === 0 || (audience.selectedContactIds?.length ?? 0) === 0}
                >
                  <Send className="h-4 w-4" />
                  Criar campanha
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={runBirthdayTestCampaign}
                  disabled={pending || templateOptions.length === 0}
                >
                  Envio de teste
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-100 pt-5">
            <Button
              type="button"
              variant="secondary"
              disabled={activeWizardStep === 0}
              onClick={() => setActiveWizardStep((step) => Math.max(0, step - 1))}
            >
              Voltar
            </Button>
            {activeWizardStep < WIZARD_STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={() => setActiveWizardStep((step) => Math.min(WIZARD_STEPS.length - 1, step + 1))}
              >
                Continuar
              </Button>
            ) : null}
          </div>
        </form>
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

function getDeliveryRate(campaign: CampaignItem) {
  const sent = campaign.stats.SENT || campaign.sentCount;
  const failed = campaign.stats.FAILED || campaign.failedCount;
  const total = sent + failed;

  return total > 0 ? Math.round((sent / total) * 100) : 0;
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "Em revisão",
    RUNNING: "Ativa",
    SCHEDULED: "Agendada",
    PAUSED: "Pausada",
    COMPLETED: "Concluída",
    FAILED: "Pausada",
    CANCELLED: "Pausada"
  };

  return map[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  const label = getStatusLabel(status);
  const tone = {
    Ativa: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "Em revisão": "border-amber-200 bg-amber-50 text-amber-700",
    Agendada: "border-blue-200 bg-blue-50 text-blue-700",
    Pausada: "border-rose-200 bg-rose-50 text-rose-700",
    Concluída: "border-slate-200 bg-slate-100 text-slate-700"
  }[label] ?? "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tone)}>
      {label}
    </span>
  );
}

function SelectionStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ELEGIVEL: {
      label: "Elegível",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    },
    BLOQUEADO: {
      label: "Bloqueado",
      className: "border-rose-200 bg-rose-50 text-rose-700"
    },
    SEM_OPT_IN: {
      label: "Sem opt-in",
      className: "border-amber-200 bg-amber-50 text-amber-700"
    },
    SEM_TELEFONE: {
      label: "Sem telefone",
      className: "border-slate-200 bg-slate-100 text-slate-700"
    },
    OPT_OUT: {
      label: "Opt-out",
      className: "border-rose-200 bg-rose-50 text-rose-700"
    },
    JA_ENFILEIRADO: {
      label: "Já enfileirado",
      className: "border-blue-200 bg-blue-50 text-blue-700"
    }
  };

  const resolved = map[state] ?? {
    label: state,
    className: "border-slate-200 bg-slate-100 text-slate-700"
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${resolved.className}`}>
      {resolved.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-950">{value}</span>
    </div>
  );
}

function CampaignDetail({
  campaign,
  activeTab,
  onTabChange
}: {
  campaign: CampaignItem;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}) {
  const audienceSummary = getAudienceSummary(campaign);
  const deliveryRate = getDeliveryRate(campaign);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft ring-1 ring-white/70">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">{campaign.name}</h2>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{campaign.template.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                activeTab === tab
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Resumo" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <SummaryMetric label="Status" value={getStatusLabel(campaign.status)} />
          <SummaryMetric label="Público" value={`${campaign.stats.total || audienceSummary.length} contatos`} />
          <SummaryMetric label="Criada em" value={formatDateTime(campaign.createdAt)} />
          <SummaryMetric label="Entrega" value={`${deliveryRate}%`} />
        </div>
      ) : null}

      {activeTab === "Resultados" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <SummaryMetric label="Enviadas" value={String(campaign.stats.SENT || campaign.sentCount)} />
          <SummaryMetric label="Falhas" value={String(campaign.stats.FAILED || campaign.failedCount)} />
          <SummaryMetric label="Pendentes" value={String(campaign.stats.PENDING + campaign.stats.PROCESSING + campaign.stats.QUEUED)} />
          <SummaryMetric label="Entrega" value={`${deliveryRate}%`} />
        </div>
      ) : null}

      {activeTab === "Timeline" ? (
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {["Criada", "Validada", "Iniciada", "Pausada", "Concluída"].map((item) => (
            <TimelineStep key={item} label={item} campaign={campaign} />
          ))}
        </div>
      ) : null}

      {activeTab === "Audiência" ? (
        <div className="mt-5">
          {audienceSummary.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Todos os contatos elegíveis.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {audienceSummary.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TimelineStep({ label, campaign }: { label: string; campaign: CampaignItem }) {
  const active =
    label === "Criada" ||
    (label === "Validada" && campaign.status !== "DRAFT") ||
    (label === "Iniciada" && ["RUNNING", "PAUSED", "COMPLETED"].includes(campaign.status)) ||
    (label === "Pausada" && campaign.status === "PAUSED") ||
    (label === "Concluída" && campaign.status === "COMPLETED");

  return (
    <div className={cn("rounded-2xl border p-4", active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
      <div className="flex items-center gap-2">
        {active ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-slate-400" />}
        <p className={cn("text-sm font-semibold", active ? "text-emerald-800" : "text-slate-600")}>{label}</p>
      </div>
    </div>
  );
}

function AudiencePreviewTable({
  loading,
  templateSelected,
  preview,
  selectedIds,
  onToggle,
  page,
  onPageChange
}: {
  loading: boolean;
  templateSelected: boolean;
  preview: AudiencePreviewResponse | null;
  selectedIds: string[];
  onToggle: (contactId: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (loading) {
    return <div className="py-8 text-sm text-slate-500">Carregando audiência...</div>;
  }

  if (!templateSelected) {
    return <div className="py-8 text-sm text-slate-500">Selecione um template para revisar a audiência.</div>;
  }

  if (!preview || preview.recipients.length === 0) {
    return <div className="py-8 text-sm text-slate-500">Nenhum contato encontrado.</div>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
            <th className="px-3 py-3">Sel.</th>
            <th className="px-3 py-3">Nome</th>
            <th className="px-3 py-3">Telefone</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {preview.recipients.map((recipient) => (
            <tr key={recipient.contactId} className="border-b border-slate-100">
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(recipient.contactId)}
                  onChange={() => onToggle(recipient.contactId)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </td>
              <td className="px-3 py-3 font-medium text-slate-950">
                {recipient.name}
                <p className="mt-1 text-xs font-normal text-slate-500">{recipient.code}</p>
              </td>
              <td className="px-3 py-3 text-slate-600">{recipient.phone || "-"}</td>
              <td className="px-3 py-3">
                <SelectionStateBadge state={recipient.selectionState} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Página {preview.page} de {preview.totalPages}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onPageChange(Math.min(preview.totalPages, page + 1))}
            disabled={page >= preview.totalPages}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

function SelectedAudienceList({
  loading,
  preview,
  selectedCount,
  onRemove
}: {
  loading: boolean;
  preview: AudiencePreviewResponse | null;
  selectedCount: number;
  onRemove: (contactId: string) => void;
}) {
  if (loading) {
    return <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">Carregando selecionados...</div>;
  }

  if (selectedCount === 0) {
    return <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">Nenhum destinatário selecionado.</div>;
  }

  if (!preview) {
    return <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500">Selecione um template para revisar.</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-4 flex flex-wrap gap-3 text-sm text-slate-600">
        <span>Total {preview.totalSelecionados ?? selectedCount}</span>
        <span>Elegíveis {preview.totalElegiveis}</span>
        <span>Bloqueados {(preview.totalBloqueados ?? 0) + preview.totalInvalidos}</span>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
        {preview.recipients.map((recipient) => (
          <div key={recipient.contactId} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-950">{recipient.name}</p>
              <p className="mt-1 text-xs text-slate-500">{recipient.phone || "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              <SelectionStateBadge state={recipient.selectionState} />
              <Button type="button" variant="ghost" onClick={() => onRemove(recipient.contactId)}>
                Remover
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
