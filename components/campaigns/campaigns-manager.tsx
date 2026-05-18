"use client";

import { useEffect, useState } from "react";
import { Megaphone, Pause, Play, RefreshCw } from "lucide-react";

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

type CampaignItem = {
  id: string;
  name: string;
  templateId: string;
  segmentTags: string[];
  status: string;
  dailyLimit: number;
  delaySeconds: number;
  scheduledAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  template: TemplateOption;
  stats: {
    PENDING: number;
    SENT: number;
    FAILED: number;
    SKIPPED: number;
    UNSUBSCRIBED: number;
    total: number;
  };
};

type CampaignsManagerProps = {
  initialCampaigns: CampaignItem[];
  templateOptions: TemplateOption[];
  availableTags: string[];
  initialEligibleCount: number;
  initialSettings: {
    defaultDailyLimit: number;
    defaultDelaySeconds: number;
    maxConsecutiveFailures: number;
  };
};

export function CampaignsManager({
  initialCampaigns,
  templateOptions,
  availableTags,
  initialEligibleCount,
  initialSettings
}: CampaignsManagerProps) {
  const emptyForm = {
    name: "",
    templateId: "",
    dailyLimit: String(initialSettings.defaultDailyLimit),
    delaySeconds: String(initialSettings.defaultDelaySeconds),
    scheduledAt: ""
  };
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [form, setForm] = useState(emptyForm);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [eligibleCount, setEligibleCount] = useState(initialEligibleCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("eligibleCount", "true");
    selectedTags.forEach((tag) => params.append("tags", tag));

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
  }, [selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  }

  async function refreshCampaigns() {
    const response = await fetch("/api/campaigns");
    const data = (await response.json()) as { campaigns?: CampaignItem[] };

    if (!response.ok || !data.campaigns) {
      throw new Error(getApiErrorMessage(data, "Não foi possível atualizar as campanhas."));
    }

    setCampaigns(data.campaigns);
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
          dailyLimit: form.dailyLimit.trim() ? Number(form.dailyLimit) : undefined,
          delaySeconds: form.delaySeconds.trim() ? Number(form.delaySeconds) : undefined,
          segmentTags: selectedTags
        })
      });
      const data = (await response.json()) as {
        campaign?: CampaignItem;
        message?: string;
      };

      if (!response.ok || !data.campaign) {
        setError(getApiErrorMessage(data, "Não foi possível criar a campanha."));
        return;
      }

      setForm(emptyForm);
      setSelectedTags([]);
      setFeedback(data.message ?? "Campanha criada.");
      await refreshCampaigns();
    } catch {
      setError("Falha de conexão. Tente novamente.");
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
        setError(getApiErrorMessage(data, "Não foi possível executar a ação."));
        return;
      }

      await refreshCampaigns();
      setFeedback(data.message ?? "Ação executada.");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome da campanha"
              />
              <select
                value={form.templateId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, templateId: event.target.value }))
                }
                className="h-12 rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              >
                <option value="">Selecione um template aprovado</option>
                {templateOptions.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} • {template.language}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.dailyLimit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dailyLimit: event.target.value }))
                }
                placeholder="Limite diário"
              />
              <Input
                type="number"
                min={30}
                max={3600}
                value={form.delaySeconds}
                onChange={(event) =>
                  setForm((current) => ({ ...current, delaySeconds: event.target.value }))
                }
                placeholder="Delay entre mensagens"
              />
            </div>

            <Input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, scheduledAt: event.target.value }))
              }
            />

            <div>
              <p className="text-sm font-medium text-slate-800">Segmento por tags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableTags.length === 0 ? (
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500">
                    Nenhuma tag cadastrada em contatos ainda.
                  </span>
                ) : (
                  availableTags.map((tag) => {
                    const selected = selectedTags.includes(tag);

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="gap-2" disabled={pending || templateOptions.length === 0}>
                <Megaphone className="h-4 w-4" />
                Criar campanha
              </Button>
              <Button type="button" variant="secondary" onClick={() => refreshCampaigns()} disabled={pending}>
                Atualizar lista
              </Button>
            </div>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {feedback ? <p className="text-sm text-emerald-600">{feedback}</p> : null}
            <p className="text-xs leading-6 text-slate-500">
              Se você mantiver os campos preenchidos, a campanha usará os padrões atuais:{" "}
              {initialSettings.defaultDailyLimit}/dia, {initialSettings.defaultDelaySeconds}s entre
              envios e pausa após {initialSettings.maxConsecutiveFailures} falhas consecutivas.
            </p>
          </form>

          <aside className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">Contatos elegíveis</p>
            <p className="mt-3 text-3xl font-semibold text-amber-950">{eligibleCount}</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-amber-900/80">
              <p>Envio apenas para contatos com opt-in válido e status ativo.</p>
              <p>Campanhas usam somente template aprovado pela Meta.</p>
              <p>Muitos erros em sequência pausam a campanha para proteger reputação.</p>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-950">{campaign.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {campaign.template.name} • {campaign.template.language} • {campaign.template.metaTemplateName}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {campaign.status}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {campaign.segmentTags.length === 0 ? (
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  Todos os contatos elegíveis
                </span>
              ) : (
                campaign.segmentTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-700"
                  >
                    {tag}
                  </span>
                ))
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Metric label="Pendentes" value={campaign.stats.PENDING} />
              <Metric label="Enviados" value={campaign.stats.SENT} />
              <Metric label="Falhas" value={campaign.stats.FAILED} />
              <Metric label="Descadastros" value={campaign.stats.UNSUBSCRIBED} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Limite/dia: {campaign.dailyLimit}</span>
              <span>Delay: {campaign.delaySeconds}s</span>
              <span>
                Agendada:{" "}
                {campaign.scheduledAt
                  ? new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    }).format(new Date(campaign.scheduledAt))
                  : "Não"}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                className="gap-2"
                onClick={() => triggerAction(campaign.id, "start")}
                disabled={pending}
              >
                <Play className="h-4 w-4" />
                Iniciar
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => triggerAction(campaign.id, "send-next")}
                disabled={pending || campaign.status !== "RUNNING"}
              >
                <RefreshCw className="h-4 w-4" />
                Enviar próximo
              </Button>
              <Button
                type="button"
                variant="danger"
                className="gap-2"
                onClick={() => triggerAction(campaign.id, "pause")}
                disabled={pending}
              >
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Nenhuma campanha criada ainda. Cadastre templates aprovados e contatos com opt-in antes do primeiro disparo.
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
