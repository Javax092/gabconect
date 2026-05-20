"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMAND_PRIORITY_VALUES,
  DEMAND_STATUS_VALUES,
  type DemandPriorityValue,
  type DemandStatusValue
} from "@/lib/prisma-enums";
import { getApiErrorMessage } from "@/lib/utils";

type DemandEditFormProps = {
  demand: {
    id: string;
    title: string;
    description: string;
    status: DemandStatusValue;
    priority: DemandPriorityValue;
    categoryId: string;
  };
  categories: Array<{
    id: string;
    name: string;
  }>;
};

const statusOptions: Array<{ value: DemandStatusValue; label: string }> = [
  { value: DEMAND_STATUS_VALUES[0], label: "Nova" },
  { value: DEMAND_STATUS_VALUES[1], label: "Em andamento" },
  { value: DEMAND_STATUS_VALUES[2], label: "Resolvida" },
  { value: DEMAND_STATUS_VALUES[3], label: "Rejeitada" }
];

const priorityOptions: Array<{ value: DemandPriorityValue; label: string }> = [
  { value: DEMAND_PRIORITY_VALUES[0], label: "Baixa" },
  { value: DEMAND_PRIORITY_VALUES[1], label: "Média" },
  { value: DEMAND_PRIORITY_VALUES[2], label: "Alta" }
];

export function DemandEditForm({ demand, categories }: DemandEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(demand.title);
  const [description, setDescription] = useState(demand.description);
  const [status, setStatus] = useState<DemandStatusValue>(demand.status);
  const [priority, setPriority] = useState<DemandPriorityValue>(demand.priority);
  const [categoryId, setCategoryId] = useState(demand.categoryId);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/demands/${demand.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          description,
          status,
          priority,
          categoryId
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível salvar a demanda."));
        return;
      }

      setFeedback(data.message ?? "Demanda atualizada com sucesso.");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function applyQuickStatus(nextStatus: DemandStatusValue) {
    setStatus(nextStatus);
    setPending(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/demands/${demand.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          description,
          status: nextStatus,
          priority,
          categoryId
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível atualizar o status."));
        return;
      }

      setFeedback(data.message ?? "Demanda atualizada com sucesso.");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Resumo operacional da demanda</h2>
          <p className="mt-1 text-sm text-slate-500">
            Atualize classificação, prioridade, conteúdo e andamento para a equipe acompanhar sem ruído.
          </p>
        </div>
        <Button type="submit" className="gap-2" disabled={pending}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ArrowRightLeft className="h-4 w-4 text-brand-600" />
          Ações rápidas de andamento
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => applyQuickStatus(DEMAND_STATUS_VALUES[0])}
          >
            Marcar como nova
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => applyQuickStatus(DEMAND_STATUS_VALUES[1])}
          >
            Colocar em andamento
          </Button>
          <Button
            type="button"
            variant="success"
            disabled={pending}
            onClick={() => applyQuickStatus(DEMAND_STATUS_VALUES[2])}
          >
            Marcar como resolvida
          </Button>
        </div>
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

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="title" className="text-sm font-medium text-slate-700">
            Título operacional
          </label>
          <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>

        <div className="space-y-2">
          <label htmlFor="status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as DemandStatusValue)}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="priority" className="text-sm font-medium text-slate-700">
            Prioridade
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as DemandPriorityValue)}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="categoryId" className="text-sm font-medium text-slate-700">
            Categoria
          </label>
          <select
            id="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="description" className="text-sm font-medium text-slate-700">
            Histórico e resumo
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={9}
            className="flex w-full rounded-[24px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
          <p className="text-xs leading-6 text-slate-500">
            Mantenha um resumo claro do pedido, contexto informado pelo cidadão e detalhes úteis para acompanhamento.
          </p>
        </div>
      </div>
    </form>
  );
}
