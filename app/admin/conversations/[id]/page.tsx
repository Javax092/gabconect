import type { ReactNode } from "react";
import Link from "next/link";
import { MessageDirection, MessageSource } from "@prisma/client";
import {
  ArrowLeft,
  Bot,
  MessageCircleMore,
  Phone,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { DemoConversationDetailPage } from "@/components/demo/demo-pages";
import { ReplyComposer } from "@/components/conversations/reply-composer";
import { StatusControls } from "@/components/conversations/status-controls";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

const sourceLabel: Record<MessageSource, string> = {
  WHATSAPP: "WhatsApp",
  AI: "IA",
  HUMAN: "Humano",
  TEMPLATE: "Template"
};

const sourceIcon: Record<MessageSource, ReactNode> = {
  WHATSAPP: <Phone className="h-3.5 w-3.5" />,
  AI: <Bot className="h-3.5 w-3.5" />,
  HUMAN: <UserRound className="h-3.5 w-3.5" />,
  TEMPLATE: <ShieldAlert className="h-3.5 w-3.5" />
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ConversationDetailPage(context: RouteContext) {
  const { id } = await context.params;

  if (isDemoMode()) {
    return <DemoConversationDetailPage conversationId={id} />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      mandateId: user.mandateId
    },
    include: {
      citizen: true,
      messages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      demands: {
        include: {
          category: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!conversation) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/conversations"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para conversas
        </Link>
        <PageHeader
          eyebrow="Conversa"
          title={conversation.citizen.name}
          description={`Última interação em ${new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short"
          }).format(conversation.lastMessageAt)}. Todo o histórico permanece rastreável e supervisionado.`}
          icon={<MessageCircleMore className="h-5 w-5" />}
          aside={
            <div className="space-y-3">
              <StatusBadge status={conversation.status} />
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-700">
                Risco operacional {Math.round(conversation.riskScore)}
              </div>
            </div>
          }
        />
      </div>

      {conversation.status === "HUMAN" ? (
        <SectionCard className="border-amber-200 bg-amber-50/80">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white p-3 text-amber-700 shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                Conversa aguardando atendimento humano
              </h2>
              <p className="mt-2 text-sm leading-7 text-amber-800">
                Esta conversa foi sinalizada para ação do gabinete. Use os botões ao lado para
                assumir o atendimento, pausar a IA e responder pelo número institucional.
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <SectionCard className="bg-slate-50">
          <div className="flex items-center gap-3 border-b border-slate-200 px-1 pb-4">
            <MessageCircleMore className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-950">Histórico da conversa</h2>
          </div>

          <div className="mt-4 space-y-4">
            {conversation.messages.map((message) => {
              const inbound = message.direction === MessageDirection.INBOUND;
              const label =
                message.source === MessageSource.AI
                  ? "IA"
                  : message.source === MessageSource.TEMPLATE
                    ? "Template"
                  : message.source === MessageSource.HUMAN
                    ? "Assessor"
                    : "Cidadão";

              return (
                <div
                  key={message.id}
                  className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[24px] px-4 py-3 shadow-sm ${
                      inbound
                        ? "bg-white text-ink"
                        : "border border-brand-100 bg-brand-500 text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-medium opacity-80">
                      {sourceIcon[message.source]}
                      <span>{label}</span>
                      <span>•</span>
                      <span>{sourceLabel[message.source]}</span>
                      <span>•</span>
                      <span>
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short"
                        }).format(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6">{message.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <aside className="space-y-6">
          <ReplyComposer conversationId={conversation.id} />
          <StatusControls
            conversationId={conversation.id}
            currentStatus={conversation.status}
          />

          <SectionCard className="bg-slate-950 text-white">
            <h3 className="text-lg font-semibold">Leitura operacional</h3>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/75">
              <p>IA ativa: {conversation.aiPaused ? "não" : "sim"}.</p>
              <p>Janela Meta: {conversation.metaWindowOpen ? "aberta" : "expirada"}.</p>
              <p>Fila atual: {conversation.currentQueue}.</p>
              <p>Última ação da IA: {conversation.lastAIAction ?? "sem decisão registrada"}.</p>
            </div>
          </SectionCard>

          <SectionCard>
            <h3 className="text-lg font-semibold text-slate-950">Contexto relacionado</h3>

            {conversation.demands.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="Nenhuma demanda vinculada"
                  description="Quando um registro operacional for gerado a partir desta conversa, ele aparecerá nesta área."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {conversation.demands.map((demand) => (
                  <article key={demand.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-ink">{demand.title}</p>
                      <Link
                        href={`/admin/demands/${demand.id}`}
                        className="text-sm font-medium text-brand-700"
                      >
                        Abrir demanda
                      </Link>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {demand.category.name}
                      </span>
                      <StatusBadge status={demand.status} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{demand.description}</p>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
