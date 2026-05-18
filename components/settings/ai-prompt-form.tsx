"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Save, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/utils";

type AiPromptFormProps = {
  mandate: {
    name: string;
    politicianName: string;
    city: string;
    state: string;
    whatsappNumber: string;
    aiPrompt: string;
  };
};

const promptSuggestions = [
  "Atue como assistente institucional do gabinete, com linguagem respeitosa, objetiva e acolhedora. Registre demandas, peça dados faltantes e nunca prometa solução imediata.",
  "Priorize mensagens com urgência social, saúde, segurança ou risco coletivo. Quando houver sensibilidade política ou necessidade de decisão humana, sinalize atendimento humano.",
  "Responda sempre em nome do gabinete, sem opiniões pessoais. Oriente o cidadão sobre próximos passos e mantenha o histórico útil para a equipe interna."
];

export function AiPromptForm({ mandate }: AiPromptFormProps) {
  const [prompt, setPrompt] = useState(mandate.aiPrompt);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch("/api/mandate", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: mandate.name,
          politicianName: mandate.politicianName,
          city: mandate.city,
          state: mandate.state,
          whatsappNumber: mandate.whatsappNumber,
          aiPrompt: prompt
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível atualizar o prompt institucional."));
        return;
      }

      setFeedback(data.message ?? "Prompt institucional atualizado com sucesso.");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function insertSuggestion(text: string) {
    setPrompt((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
      <form
        onSubmit={handleSubmit}
        className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft lg:p-8"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
              Prompt institucional
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">Como a IA deve se comportar</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Defina tom, limites, prioridades e critérios de encaminhamento. A IA deve acolher,
              registrar e orientar, sem prometer solução que ainda depende da equipe.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Atendimento inteligente com controle humano",
                "Nunca promete solução",
                "Encaminha casos sensíveis para assessor"
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <Button type="submit" className="gap-2 sm:self-start" disabled={pending}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? "Salvando..." : "Salvar prompt"}
          </Button>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {feedback ? (
          <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {feedback}
          </p>
        ) : null}

        <div className="mt-6 space-y-2">
          <label htmlFor="aiPrompt" className="text-sm font-medium text-slate-700">
            Instruções da IA
          </label>
          <textarea
            id="aiPrompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            required
            rows={16}
            className="flex w-full rounded-[24px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            placeholder="Explique como a IA deve atender, o que deve registrar, quando pedir mais dados e quando escalar para um assessor humano."
          />
          <p className="text-xs leading-6 text-slate-500">
            Boas instruções melhoram triagem, respostas iniciais e qualidade dos resumos para a
            equipe do gabinete.
          </p>
        </div>
      </form>

      <aside className="space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-slate-950 p-6 text-white shadow-soft">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-300" />
            <h3 className="text-lg font-semibold">Aviso de segurança</h3>
          </div>
          <p className="mt-4 text-sm leading-7 text-white/75">
            A IA não deve prometer solução, prazo fechado ou posicionamento oficial. O papel dela
            é registrar, orientar e encaminhar corretamente.
          </p>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-3">
            <WandSparkles className="h-5 w-5 text-brand-700" />
            <h3 className="text-lg font-semibold text-ink">Sugestões institucionais</h3>
          </div>
          <div className="mt-4 space-y-4">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => insertSuggestion(suggestion)}
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
            <h3 className="text-lg font-semibold text-ink">O que um bom prompt cobre</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>Tom de voz institucional do gabinete.</p>
            <p>Temas que exigem prioridade alta.</p>
            <p>Casos que devem ser assumidos por humano.</p>
            <p>Informações mínimas para registrar uma demanda.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
