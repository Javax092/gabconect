import Link from "next/link";
import { MessageSource } from "@prisma/client";
import {
  ArrowLeft,
  CheckCircle2,
  CalendarClock,
  Clock3,
  MessageSquareText,
  Phone,
  UserRound
} from "lucide-react";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { PriorityBadge } from "@/components/admin/priority-badge";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { DemoDemandDetailPage } from "@/components/demo/demo-pages";
import { DemandEditForm } from "@/components/demands/demand-edit-form";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultCategoriesForMandate } from "@/lib/categories";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DemandDetailPage(context: RouteContext) {
  const { id } = await context.params;

  if (isDemoMode()) {
    return <DemoDemandDetailPage demandId={id} />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [demand, categories] = await Promise.all([
    prisma.demand.findFirst({
      where: {
        id,
        mandateId: user.mandateId
      },
      include: {
        citizen: true,
        category: true,
        conversation: {
          include: {
            messages: {
              orderBy: {
                createdAt: "desc"
              },
              take: 5
            }
          }
        }
      }
    }),
    ensureDefaultCategoriesForMandate(user.mandateId)
  ]);

  if (!demand) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/demands"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para demandas
        </Link>
        <PageHeader
          eyebrow="Demanda"
          title={demand.title}
          description="Atualize a classificação, acompanhe o cidadão e mantenha contexto suficiente para o gabinete agir com segurança."
          icon={<MessageSquareText className="h-5 w-5" />}
          aside={
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge status={demand.status} />
                <PriorityBadge priority={demand.priority} />
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">
                Criada em{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short"
                }).format(demand.createdAt)}
              </div>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <DemandEditForm
          demand={{
            id: demand.id,
            title: demand.title,
            description: demand.description,
            status: demand.status,
            priority: demand.priority,
            categoryId: demand.categoryId
          }}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name
          }))}
        />

        <aside className="space-y-6">
          <SectionCard>
            <h2 className="text-lg font-semibold text-slate-950">Cidadão relacionado</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4 text-brand-600" />
                {demand.citizen.name}
              </div>
              <div className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-600" />
                {demand.citizen.phone}
              </div>
            </div>
          </SectionCard>

          <SectionCard className="bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-950">Resumo da demanda</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-1 h-4 w-4 flex-none text-brand-600" />
                <p>
                  Aberta em{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short"
                  }).format(demand.createdAt)}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <MessageSquareText className="mt-1 h-4 w-4 flex-none text-brand-600" />
                <p>Categoria atual: {demand.category.name}</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-4 w-4 flex-none text-brand-600" />
                <p>
                  Esta demanda ajuda a transformar atendimento disperso em acompanhamento registrável para o mandato.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-1 h-4 w-4 flex-none text-brand-600" />
                <p>
                  Última atualização em{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short"
                  }).format(demand.updatedAt)}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">Conversa relacionada</h2>
              <Link
                href={`/admin/conversations/${demand.conversationId}`}
                className="text-sm font-medium text-brand-700"
              >
                Abrir conversa
              </Link>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Clock3 className="h-4 w-4" />
              Última interação{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short"
              }).format(demand.conversation.lastMessageAt)}
            </div>

            <div className="mt-4 space-y-3">
              {demand.conversation.messages.map((message) => (
                <article key={message.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    {message.source === MessageSource.AI
                      ? "IA"
                      : message.source === MessageSource.HUMAN
                        ? "Assessor"
                        : "Cidadão"}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{message.content}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
