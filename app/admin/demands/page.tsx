import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumn,
  ListFilter,
  Phone
} from "lucide-react";
import { DemandStatus } from "@prisma/client";

import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { PriorityBadge } from "@/components/admin/priority-badge";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { DemoDemandsPage } from "@/components/demo/demo-pages";
import { DemandFiltersForm } from "@/components/demands/demand-filters-form";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultCategoriesForMandate } from "@/lib/categories";
import { isDemoMode } from "@/lib/demo";
import { buildDemandWhere } from "@/lib/demand-filters";
import { prisma } from "@/lib/prisma";
import { demandFiltersSchema } from "@/lib/validations/demand";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DemandsPage({ searchParams }: PageProps) {
  if (isDemoMode()) {
    return <DemoDemandsPage />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const params = await searchParams;
  const parsedFilters = demandFiltersSchema.parse({
    status: typeof params.status === "string" ? params.status : undefined,
    priority: typeof params.priority === "string" ? params.priority : undefined,
    categoryId: typeof params.categoryId === "string" ? params.categoryId : undefined,
    q: typeof params.q === "string" ? params.q : undefined
  });

  const [categories, demands] = await Promise.all([
    ensureDefaultCategoriesForMandate(user.mandateId),
    prisma.demand.findMany({
      where: buildDemandWhere({
        mandateId: user.mandateId,
        ...parsedFilters
      }),
      include: {
        citizen: true,
        category: true
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
    })
  ]);

  const statusCards = [
    {
      label: "Novas",
      value: demands.filter((demand) => demand.status === DemandStatus.NEW).length
    },
    {
      label: "Em andamento",
      value: demands.filter((demand) => demand.status === DemandStatus.IN_PROGRESS).length
    },
    {
      label: "Resolvidas",
      value: demands.filter((demand) => demand.status === DemandStatus.RESOLVED).length
    },
    {
      label: "Críticas",
      value: demands.filter((demand) => demand.priority === "HIGH" && demand.status !== DemandStatus.RESOLVED)
        .length
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Central de demandas"
        description="Transforme mensagens em demandas acompanháveis, visualize prioridades e mantenha a operação do mandato com clareza."
        icon={<ListFilter className="h-5 w-5" />}
        aside={
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">
            {demands.length} {demands.length === 1 ? "demanda ativa na consulta" : "demandas na consulta"}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statusCards.map((item) => (
          <article key={item.label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-950">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {item.label === "Críticas"
                ? "Nunca mais perca uma solicitação importante."
                : "Fila consolidada com status visível para a equipe."}
            </p>
          </article>
        ))}
      </div>

      <DemandFiltersForm
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name
        }))}
      />

      <SectionCard>
        <div className="flex items-center gap-3 border-b border-slate-200 px-1 pb-4">
          <ListFilter className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-950">Fila operacional</h2>
        </div>

        {demands.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              title="Nenhuma demanda encontrada"
              description="Ajuste os filtros ou aguarde novos registros. Esta central mostra o que já foi transformado em demanda acompanhável."
              icon={<ListFilter className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {demands.map((demand) => (
              <Link
                key={demand.id}
                href={`/admin/demands/${demand.id}`}
                className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 transition hover:border-brand-200 hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-ink">{demand.title}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {demand.citizen.name} • {demand.category.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {demand.priority === "HIGH" ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Prioridade alta
                      </span>
                    ) : null}
                    <ArrowUpRight className="h-4 w-4 text-brand-600" />
                  </div>
                </div>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                  {demand.description}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                  <StatusBadge status={demand.status} />
                  <PriorityBadge priority={demand.priority} />
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {demand.category.name}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {demand.citizen.phone}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    }).format(demand.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard className="bg-slate-50">
        <div className="flex items-center gap-3">
          <ChartNoAxesColumn className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-950">Resumo operacional do mandato</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          A busca considera nome do cidadão, título e descrição da demanda. Com prioridade, categoria e status visíveis, o gabinete consegue prestar contas melhor, distribuir trabalho e acompanhar o que já recebeu retorno.
        </p>
      </SectionCard>
    </div>
  );
}
