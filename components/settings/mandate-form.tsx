"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  Save,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";
import type { MandateFormValues } from "@/lib/validations/mandate";

type MandatePayload = MandateFormValues & {
  id: string;
  createdAt: string;
};

type MandateFormProps = {
  initialMandate: MandatePayload;
};

type FeedbackState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const promptSuggestions = [
  "Atenda com linguagem institucional, acolhedora e objetiva. Sempre registre a solicitação com clareza e peça dados faltantes quando necessário.",
  "Nunca prometa solução, prazo ou benefício. Oriente o cidadão, informe que a equipe vai analisar e encaminhe para atendimento humano em casos sensíveis.",
  "Priorize saúde, segurança, denúncia, risco coletivo e demandas repetidas. Quando a situação exigir decisão política ou humana, marque como atendimento humano."
];

export function MandateForm({ initialMandate }: MandateFormProps) {
  const [form, setForm] = useState<MandateFormValues>({
    name: initialMandate.name,
    politicianName: initialMandate.politicianName,
    city: initialMandate.city,
    state: initialMandate.state,
    whatsappNumber: initialMandate.whatsappNumber,
    aiPrompt: initialMandate.aiPrompt
  });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  function updateField<K extends keyof MandateFormValues>(field: K, value: MandateFormValues[K]) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function applyPromptSuggestion(text: string) {
    setForm((current) => ({
      ...current,
      aiPrompt: current.aiPrompt.trim() ? `${current.aiPrompt.trim()}\n\n${text}` : text
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/mandate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          state: form.state.toUpperCase()
        })
      });

      const data = (await response.json()) as {
        message?: string;
        mandate?: MandatePayload;
      };

      if (!response.ok) {
        setFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível salvar as configurações.")
        });
        return;
      }

      if (data.mandate) {
        setForm({
          name: data.mandate.name,
          politicianName: data.mandate.politicianName,
          city: data.mandate.city,
          state: data.mandate.state,
          whatsappNumber: data.mandate.whatsappNumber,
          aiPrompt: data.mandate.aiPrompt
        });
      }

      setFeedback({
        type: "success",
        message: data.message ?? "Configurações salvas com sucesso."
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente em alguns instantes."
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <form
        onSubmit={handleSubmit}
        className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft lg:p-8"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
              Posicionamento institucional
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">
              Identidade do mandato e operação da IA
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Configure como o gabinete deve ser apresentado ao cidadão, qual número será exibido e
              quais regras orientam a triagem inteligente no atendimento.
            </p>
          </div>

          <Button type="submit" className="gap-2 sm:self-start" disabled={pending}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>

        {feedback ? (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="name" className="text-sm font-medium text-slate-700">
              Nome do gabinete ou mandato
            </label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Gabinete da Vereadora Maria Silva"
              required
            />
            <p className="text-xs leading-6 text-slate-500">
              Esse nome será usado em relatórios, cabeçalhos e comunicação institucional.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="politicianName" className="text-sm font-medium text-slate-700">
              Nome público da liderança política
            </label>
            <Input
              id="politicianName"
              value={form.politicianName}
              onChange={(event) => updateField("politicianName", event.target.value)}
              placeholder="Vereadora Maria Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="city" className="text-sm font-medium text-slate-700">
              Cidade de atuação
            </label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) => updateField("city", event.target.value)}
              placeholder="Manaus"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="state" className="text-sm font-medium text-slate-700">
              UF
            </label>
            <Input
              id="state"
              value={form.state}
              onChange={(event) => updateField("state", event.target.value.toUpperCase())}
              placeholder="AM"
              maxLength={2}
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="whatsappNumber" className="text-sm font-medium text-slate-700">
              WhatsApp institucional
            </label>
            <Input
              id="whatsappNumber"
              value={form.whatsappNumber}
              onChange={(event) => updateField("whatsappNumber", event.target.value)}
              placeholder="+55 92 99999-9999"
              required
            />
            <p className="text-xs leading-6 text-slate-500">
              Use o número oficial do gabinete para manter rastreabilidade e continuidade do atendimento.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="aiPrompt" className="text-sm font-medium text-slate-700">
              Prompt institucional da IA
            </label>
            <textarea
              id="aiPrompt"
              value={form.aiPrompt}
              onChange={(event) => updateField("aiPrompt", event.target.value)}
              placeholder="Explique como a IA deve atender, classificar prioridades, pedir dados faltantes e quando escalar para um assessor."
              required
              rows={12}
              className="flex w-full rounded-[24px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
            <p className="text-xs leading-6 text-slate-500">
              Um bom prompt define tom de voz, limites, temas prioritários e o momento certo de
              acionar atendimento humano.
            </p>
            <p className="text-xs leading-6 text-slate-500">
              A IA não promete solução, vaga, benefício ou prazo final. Ela registra, orienta e
              organiza o atendimento para o gabinete agir com segurança.
            </p>
          </div>
        </div>
      </form>

      <aside className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-slate-950 p-6 text-white shadow-soft">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-brand-300" />
            <h2 className="text-lg font-semibold">Escopo e segurança</h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-white/75">
            Esta área controla somente o mandato vinculado à sua conta. A IA deve registrar,
            orientar e organizar a fila, sem fazer promessas institucionais automáticas.
          </p>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-brand-700" />
            <h2 className="text-lg font-semibold text-ink">Sugestões de prompt</h2>
          </div>
          <div className="mt-4 space-y-4">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => applyPromptSuggestion(suggestion)}
                className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left text-sm leading-6 text-slate-600 transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-ink">Checklist rápido</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p className="flex items-start gap-3">
              <Building2 className="mt-1 h-4 w-4 flex-none text-slate-400" />
              Nome institucional consistente com a operação real.
            </p>
            <p className="flex items-start gap-3">
              <MessageSquareText className="mt-1 h-4 w-4 flex-none text-slate-400" />
              WhatsApp oficial configurado para atendimento.
            </p>
            <p className="flex items-start gap-3">
              <Sparkles className="mt-1 h-4 w-4 flex-none text-slate-400" />
              Regras da IA claras sobre limites e escalonamento humano.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
