import Link from "next/link";
import { ShieldUser } from "lucide-react";

import { DemoHumanQueuePage } from "@/components/demo/demo-pages";
import { HumanQueueActions } from "@/components/conversations/human-queue-actions";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function HumanQueuePage() {
  if (isDemoMode()) {
    return <DemoHumanQueuePage />;
  }

  const user = await requireUser();

  const conversations = await prisma.conversation.findMany({
    where: {
      mandateId: user.mandateId,
      status: "HUMAN"
    },
      include: {
        citizen: true,
        messages: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
        takeovers: {
        where: { active: true },
        include: { user: true },
        orderBy: { startedAt: "desc" },
        take: 1
      }
    },
    orderBy: [{ humanPriority: "desc" }, { lastMessageAt: "desc" }]
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <ShieldUser className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">Fila Humana</p>
            <p className="mt-1 text-sm text-slate-400">
              Conversas pausadas para supervisão, decisão humana ou atendimento prioritário.
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {conversations.map((conversation) => (
          <article
            key={conversation.id}
            className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-5 transition hover:border-amber-300/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-white">{conversation.citizen.name}</p>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                Humano ativo
              </span>
              {conversation.sensitive ? (
                <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-200">
                  Sensível
                </span>
              ) : null}
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
              {conversation.messages[0]?.content ?? "Sem histórico recente."}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              <span>Risco: {Math.round(conversation.riskScore)}</span>
              <span>Fila: {conversation.currentQueue}</span>
              <span>Motivo: {conversation.takeovers[0]?.reason ?? "Escalação operacional"}</span>
              <span>
                Última mensagem: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(conversation.lastMessageAt)}
              </span>
              <span>
                Supervisor: {conversation.takeovers[0]?.user?.name ?? "Aguardando atribuição"}
              </span>
              <Link href={`/admin/conversations/${conversation.id}`} className="font-medium text-cyan-300">
                Abrir conversa
              </Link>
            </div>
            <HumanQueueActions conversationId={conversation.id} aiPaused={conversation.aiPaused} />
          </article>
        ))}

        {conversations.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-8 text-sm text-slate-400">
            Nenhuma conversa aguardando atendimento humano.
          </div>
        ) : null}
      </div>
    </div>
  );
}
