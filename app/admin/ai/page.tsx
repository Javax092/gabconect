import { Cpu, MessageSquareText, ShieldAlert, Sparkles } from "lucide-react";

import { DemoAiPage } from "@/components/demo/demo-pages";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { AiPromptForm } from "@/components/settings/ai-prompt-form";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export default async function AdminAiPage() {
  if (isDemoMode()) {
    return <DemoAiPage />;
  }

  const user = await requireUser();

  const exampleConversation = await prisma.conversation.findFirst({
    where: {
      mandateId: user.mandateId
    },
    include: {
      citizen: true,
      messages: {
        orderBy: {
          createdAt: "desc"
        },
        take: 3
      },
      demands: {
        include: {
          category: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: {
      lastMessageAt: "desc"
    }
  });

  const inboundExample = exampleConversation?.messages.find((message) => message.direction === "INBOUND");
  const aiExample = exampleConversation?.messages.find((message) => message.source === "AI");
  const demandExample = exampleConversation?.demands[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA assistiva"
        title="Motor de decisão supervisionado"
        description="Edite o prompt operacional, visualize exemplos reais e deixe claro onde a IA ajuda e onde a equipe assume."
        icon={<Cpu className="h-5 w-5" />}
      />

      <AiPromptForm
        mandate={{
          name: user.mandate.name,
          politicianName: user.mandate.politicianName,
          city: user.mandate.city,
          state: user.mandate.state,
          whatsappNumber: user.mandate.whatsappNumber,
          aiPrompt: user.mandate.aiPrompt
        }}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <ExampleCard
          title="Mensagem recebida"
          eyebrow="Exemplo de entrada"
          icon={<MessageSquareText className="h-5 w-5" />}
          content={
            inboundExample?.content ??
            "Quando chegarem novas mensagens do WhatsApp, elas aparecerão aqui como referência operacional."
          }
        />
        <ExampleCard
          title="Resposta da IA"
          eyebrow="Exemplo de saída"
          icon={<Sparkles className="h-5 w-5" />}
          content={
            aiExample?.content ??
            "A resposta inicial da IA ficará disponível aqui assim que houver uma interação processada."
          }
        />
        <ExampleCard
          title="Demanda criada"
          eyebrow="Exemplo de registro"
          icon={<ShieldAlert className="h-5 w-5" />}
          content={
            demandExample
              ? `${demandExample.title}\n\nCategoria: ${demandExample.category.name}\nPrioridade: ${demandExample.priority}\n\n${demandExample.description}`
              : "Quando a IA gerar um registro operacional, o resumo aparecerá aqui para validação."
          }
          preformatted
        />
      </div>

      <SectionCard className="bg-[linear-gradient(180deg,_#fff7ed_0%,_#ffffff_100%)]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Segurança operacional</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              A IA registra e orienta, mas não promete solução, vaga, exame, obra, benefício ou
              qualquer entrega que dependa de decisão administrativa ou humana.
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>Ela não substitui a equipe.</p>
              <p>Ela encaminha casos sensíveis para humano.</p>
              <p>Ela transforma o WhatsApp em uma fila organizada e supervisionada.</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ExampleCard({
  eyebrow,
  title,
  icon,
  content,
  preformatted = false
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  content: string;
  preformatted?: boolean;
}) {
  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
        </div>
      </div>
      {preformatted ? (
        <pre className="mt-5 whitespace-pre-wrap rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
          {content}
        </pre>
      ) : (
        <p className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
          {content}
        </p>
      )}
    </SectionCard>
  );
}
