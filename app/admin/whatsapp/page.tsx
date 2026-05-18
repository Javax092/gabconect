import { PlugZap } from "lucide-react";

import { DemoWhatsAppPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getQueueHealth } from "@/lib/queue";

function maskValue(value: string | undefined) {
  if (!value) {
    return "Não configurado";
  }

  if (value.length <= 6) {
    return "Configurado";
  }

  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

export default async function WhatsAppPage() {
  if (isDemoMode()) {
    return <DemoWhatsAppPage />;
  }

  const user = await requireUser();
  const webhookUrl = `${env.appUrl}/api/webhooks/whatsapp`;

  const [waitingMessages, approvedTemplates, latestCompliance, queueHealth] = await Promise.all([
    prisma.messageQueue.count({
      where: {
        mandateId: user.mandateId,
        status: "PENDING"
      }
    }),
    prisma.messageTemplate.count({
      where: {
        mandateId: user.mandateId,
        approved: true
      }
    }),
    prisma.complianceLog.findFirst({
      where: { mandateId: user.mandateId },
      orderBy: { createdAt: "desc" }
    }),
    getQueueHealth()
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <PlugZap className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-semibold text-white">Painel de infraestrutura WhatsApp</p>
            <p className="mt-1 text-sm text-slate-400">
              Webhook, filas, janela Meta e exposição de risco operacional em um único monitor.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard title="Webhook status" value="Ativo" />
        <InfoCard title="Mensagens aguardando" value={String(waitingMessages)} />
        <InfoCard title="Templates aprovados" value={String(approvedTemplates)} />
        <InfoCard title="Risco operacional" value={latestCompliance?.spamRisk ?? "LOW"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Conectividade Meta</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Webhook: {webhookUrl}</p>
            <p>Phone Number ID: {maskValue(process.env.WHATSAPP_PHONE_NUMBER_ID)}</p>
            <p>Verify Token: {maskValue(process.env.WHATSAPP_VERIFY_TOKEN)}</p>
            <p>Access Token: invisível por padrão</p>
            <p>Redis/Queue: {queueHealth.redis} / {queueHealth.queues}</p>
          </div>
        </section>

        <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Guardrails</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-amber-50/90">
            <p>Proteção de janela 24h antes de qualquer envio automático.</p>
            <p>Cooldown, pacing e escalonamento humano quando o risco sobe.</p>
            <p>Credenciais nunca são expostas no frontend.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </article>
  );
}
