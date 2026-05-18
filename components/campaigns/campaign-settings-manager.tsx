"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { LoaderCircle, Save, ShieldCheck, Stamp } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";

type CampaignSettings = {
  defaultDailyLimit: number;
  defaultDelaySeconds: number;
  maxConsecutiveFailures: number;
};

type CampaignTemplate = {
  id: string;
  name: string;
  metaTemplateName: string;
  language: string;
  category: string;
  status: string;
  body: string;
  updatedAt: string;
};

type CampaignSettingsManagerProps = {
  initialSettings: CampaignSettings;
  initialTemplates: CampaignTemplate[];
};

type FeedbackState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export function CampaignSettingsManager({
  initialSettings,
  initialTemplates
}: CampaignSettingsManagerProps) {
  const [settings, setSettings] = useState({
    defaultDailyLimit: String(initialSettings.defaultDailyLimit),
    defaultDelaySeconds: String(initialSettings.defaultDelaySeconds),
    maxConsecutiveFailures: String(initialSettings.maxConsecutiveFailures)
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    metaTemplateName: "",
    language: "pt_BR",
    category: "MARKETING",
    status: "APPROVED",
    body: ""
  });
  const [templates, setTemplates] = useState(initialTemplates);
  const [settingsPending, setSettingsPending] = useState(false);
  const [templatePending, setTemplatePending] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<FeedbackState>(null);
  const [templateFeedback, setTemplateFeedback] = useState<FeedbackState>(null);

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsPending(true);
    setSettingsFeedback(null);

    try {
      const response = await fetch("/api/campaigns/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          defaultDailyLimit: Number(settings.defaultDailyLimit),
          defaultDelaySeconds: Number(settings.defaultDelaySeconds),
          maxConsecutiveFailures: Number(settings.maxConsecutiveFailures)
        })
      });
      const data = (await response.json()) as {
        message?: string;
        settings?: CampaignSettings;
      };

      if (!response.ok || !data.settings) {
        setSettingsFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível salvar as configurações.")
        });
        return;
      }

      setSettings({
        defaultDailyLimit: String(data.settings.defaultDailyLimit),
        defaultDelaySeconds: String(data.settings.defaultDelaySeconds),
        maxConsecutiveFailures: String(data.settings.maxConsecutiveFailures)
      });
      setSettingsFeedback({
        type: "success",
        message: data.message ?? "Configurações salvas com sucesso."
      });
    } catch {
      setSettingsFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente."
      });
    } finally {
      setSettingsPending(false);
    }
  }

  async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTemplatePending(true);
    setTemplateFeedback(null);

    try {
      const response = await fetch("/api/campaigns/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(templateForm)
      });
      const data = (await response.json()) as {
        message?: string;
        template?: CampaignTemplate;
      };

      if (!response.ok || !data.template) {
        setTemplateFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível cadastrar o template.")
        });
        return;
      }

      const createdTemplate = data.template;

      setTemplates((current) => [createdTemplate, ...current]);
      setTemplateForm({
        name: "",
        metaTemplateName: "",
        language: "pt_BR",
        category: "MARKETING",
        status: "APPROVED",
        body: ""
      });
      setTemplateFeedback({
        type: "success",
        message: data.message ?? "Template cadastrado com sucesso."
      });
    } catch {
      setTemplateFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente."
      });
    } finally {
      setTemplatePending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <SectionCard>
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
                  Defaults operacionais
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Pacing e proteção reputacional
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Esses valores são usados como padrão para novas campanhas quando o administrador
                  não informar limites específicos.
                </p>
              </div>
              <Button type="submit" className="gap-2" disabled={settingsPending}>
                {settingsPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>

            {settingsFeedback ? (
              <FeedbackBanner feedback={settingsFeedback} />
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Limite diário"
                hint="Entre 1 e 200 envios por dia."
                input={
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={settings.defaultDailyLimit}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        defaultDailyLimit: event.target.value
                      }))
                    }
                    required
                  />
                }
              />
              <Field
                label="Delay entre envios"
                hint="Entre 25 e 3600 segundos."
                input={
                  <Input
                    type="number"
                    min={25}
                    max={3600}
                    value={settings.defaultDelaySeconds}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        defaultDelaySeconds: event.target.value
                      }))
                    }
                    required
                  />
                }
              />
              <Field
                label="Falhas consecutivas"
                hint="Entre 1 e 10 falhas para pausar."
                input={
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.maxConsecutiveFailures}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        maxConsecutiveFailures: event.target.value
                      }))
                    }
                    required
                  />
                }
              />
            </div>
          </form>
        </SectionCard>

        <SectionCard className="bg-[linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Compliance de campanha</p>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-600">
                <p>Envios dependem de opt-in válido e contato ativo no momento da execução.</p>
                <p>Somente templates aprovados podem ser usados em campanhas e no endpoint de envio.</p>
                <p>Tokens e credenciais do WhatsApp Business permanecem restritos ao backend.</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <SectionCard>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Stamp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
                Templates cadastrados
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Inventário de templates para campanha
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {templates.map((template) => (
              <article
                key={template.id}
                className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{template.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {template.metaTemplateName} • {template.language}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {template.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-white px-3 py-2">{template.category}</span>
                  <span className="rounded-full bg-white px-3 py-2">
                    Atualizado em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    }).format(new Date(template.updatedAt))}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{template.body}</p>
              </article>
            ))}

            {templates.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                Nenhum template de campanha cadastrado ainda.
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard>
          <form onSubmit={handleCreateTemplate} className="space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
                Novo template
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Cadastro inicial de template
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Cadastre o identificador interno, o nome oficial na Meta e o status operacional do
                template antes de liberar seu uso em campanhas.
              </p>
            </div>

            {templateFeedback ? <FeedbackBanner feedback={templateFeedback} /> : null}

            <Field
              label="Nome interno"
              input={
                <Input
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Campanha informativo"
                  required
                />
              }
            />
            <Field
              label="Nome oficial do template Meta"
              input={
                <Input
                  value={templateForm.metaTemplateName}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      metaTemplateName: event.target.value
                    }))
                  }
                  placeholder="campanha_informativo"
                  required
                />
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Idioma"
                input={
                  <Input
                    value={templateForm.language}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        language: event.target.value
                      }))
                    }
                    placeholder="pt_BR"
                    required
                  />
                }
              />
              <Field
                label="Categoria"
                input={
                  <select
                    value={templateForm.category}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        category: event.target.value
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  >
                    <option value="MARKETING">MARKETING</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                }
              />
            </div>

            <Field
              label="Status"
              input={
                <select
                  value={templateForm.status}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      status: event.target.value
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              }
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Corpo de referência</label>
              <textarea
                value={templateForm.body}
                onChange={(event) =>
                  setTemplateForm((current) => ({ ...current, body: event.target.value }))
                }
                placeholder="Texto base do template aprovado na Meta."
                className="min-h-32 w-full rounded-[22px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-[0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                required
              />
            </div>

            <Button type="submit" className="gap-2" disabled={templatePending}>
              {templatePending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Stamp className="h-4 w-4" />
              )}
              Cadastrar template
            </Button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

function Field({
  label,
  input,
  hint
}: {
  label: string;
  input: import("react").ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {input}
      {hint ? <p className="text-xs leading-6 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Exclude<FeedbackState, null> }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        feedback.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {feedback.message}
    </div>
  );
}
