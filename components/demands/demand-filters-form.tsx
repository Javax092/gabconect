"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEMAND_PRIORITY_VALUES,
  DEMAND_STATUS_VALUES,
  type DemandPriorityValue,
  type DemandStatusValue
} from "@/lib/prisma-enums";

type DemandFiltersFormProps = {
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

export function DemandFiltersForm({ categories }: DemandFiltersFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilters(formData: FormData) {
    const params = new URLSearchParams(searchParams.toString());
    const entries = {
      q: String(formData.get("q") ?? "").trim(),
      status: String(formData.get("status") ?? "").trim(),
      priority: String(formData.get("priority") ?? "").trim(),
      categoryId: String(formData.get("categoryId") ?? "").trim()
    };

    for (const [key, value] of Object.entries(entries)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    router.push(`${pathname}?${params.toString()}` as Route);
  }

  function clearFilters() {
    router.push(pathname as Route);
  }

  return (
    <form action={updateFilters} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="h-5 w-5 text-brand-600" />
        <div>
          <h2 className="text-lg font-semibold text-ink">Filtros visíveis da operação</h2>
          <p className="text-sm text-slate-500">
            Refine a fila por tema, urgência e andamento.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          "Transforme mensagens em demandas acompanháveis",
          "Nunca mais perca uma solicitação importante",
          "Mais clareza para o gabinete, mais retorno para o cidadão"
        ].map((item) => (
          <span
            key={item}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-2">
          <label htmlFor="q" className="text-sm font-medium text-slate-700">
            Buscar demanda
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="q"
              name="q"
              defaultValue={searchParams.get("q") ?? ""}
              placeholder="Buscar por cidadão, título ou descrição"
              className="pl-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={searchParams.get("status") ?? ""}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            <option value="">Todos</option>
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
            name="priority"
            defaultValue={searchParams.get("priority") ?? ""}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            <option value="">Todas</option>
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="categoryId" className="text-sm font-medium text-slate-700">
            Categoria
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={searchParams.get("categoryId") ?? ""}
            className="flex h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="gap-2" onClick={clearFilters}>
          <X className="h-4 w-4" />
          Limpar filtros
        </Button>
        <Button type="submit">Atualizar fila</Button>
      </div>
    </form>
  );
}
