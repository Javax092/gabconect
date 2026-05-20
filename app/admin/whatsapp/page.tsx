import { PlugZap } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { DemoWhatsAppPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { getOperationalReadiness } from "@/lib/operational-readiness";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function WhatsAppPage() {
  if (isDemoMode()) {
    return <DemoWhatsAppPage />;
  }

  const user = await requireUser();
  const readiness = await getOperationalReadiness(user.mandateId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp"
        title="Canal oficial e fila de envio"
        description="Valide conexão, webhook, assinatura Meta, heartbeat dos workers, último evento recebido e último envio antes de liberar operação real."
        icon={<PlugZap className="h-5 w-5" />}
        aside={
          <div className="rounded-[22px] border border-white/10 bg-[#07111e] px-5 py-4 text-sm text-slate-300">
            {readiness.mode === "SIMULACAO" ? "Modo simulação" : "Envio real"}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard title="Token Meta" value={readiness.credentials.accessTokenConfigured ? "Configurado" : "Ausente"} />
        <InfoCard title="Phone Number ID" value={readiness.credentials.phoneNumberIdConfigured ? "Configurado" : "Ausente"} />
        <InfoCard title="Webhook" value={readiness.webhook.configured ? "Configurado" : "Pendente"} />
        <InfoCard title="Outgoing worker" value={readiness.outgoingWorkerReady ? "Online" : "Sem heartbeat"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <SectionCard>
          <h2 className="text-lg font-semibold text-slate-950">Status da conexão</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <StatusLine label="Webhook endpoint" value={readiness.webhook.endpoint} />
            <StatusLine label="Assinatura Meta" value={readiness.webhook.appSecretConfigured ? "Ativa" : "Ausente"} />
            <StatusLine label="Redis" value={readiness.queueHealth.redis} />
            <StatusLine label="Filas" value={readiness.queueHealth.queues} />
            <StatusLine label="Fila de envio" value={String(readiness.queueSummary.queued)} />
            <StatusLine label="Processando agora" value={String(readiness.queueSummary.processing)} />
          </div>
        </SectionCard>

        <SectionCard className="bg-slate-950 text-white">
          <h2 className="text-lg font-semibold">Modo atual</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/75">
            <p>{readiness.mode === "SIMULACAO" ? "Nenhum envio real será feito." : "A fila pode enviar mensagens reais aprovadas."}</p>
            <p>Não há disparo direto: a campanha entra na fila e o worker outgoing processa gradualmente.</p>
            <p>Use apenas 1 contato próprio no primeiro teste real.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <h2 className="text-lg font-semibold text-slate-950">Checklist de configuração Meta</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {readiness.envChecklist.map((item) => (
            <div key={item.key} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-medium text-slate-950">{item.label}</p>
              <p className="mt-1 text-sm text-slate-600">{item.status}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard>
          <h2 className="text-lg font-semibold text-slate-950">Último evento recebido</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Recebido em: {formatDateTime(readiness.latestInboundMessage?.createdAt ?? null)}</p>
            <p>Contato: {readiness.latestInboundMessage?.citizenName ?? "Sem evento recente"}</p>
            <p>Telefone: {readiness.latestInboundMessage?.from ?? "—"}</p>
            <p>Conteúdo: {readiness.latestInboundMessage?.content ?? "—"}</p>
          </div>
        </SectionCard>

        <SectionCard>
          <h2 className="text-lg font-semibold text-slate-950">Último envio realizado</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Registrado em: {formatDateTime(readiness.latestDelivery?.createdAt ?? null)}</p>
            <p>Status: {readiness.latestDelivery?.status ?? "Sem envio recente"}</p>
            <p>Contato: {readiness.latestDelivery?.contactName ?? "—"}</p>
            <p>Operação: {readiness.latestDelivery?.campaignName ?? "—"}</p>
            <p>Falha Meta: {readiness.latestDelivery?.errorMessage ?? "Nenhuma"}</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <h2 className="text-lg font-semibold text-slate-950">Instruções resumidas</h2>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
          <p>1. Configure `APP_URL` e publique o endpoint `{readiness.webhook.endpoint}` na Meta.</p>
          <p>2. Cadastre `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `META_APP_SECRET`.</p>
          <p>3. Rode `npm run worker:incoming`, `npm run worker:outgoing` e `npm run worker:human` ou `npm run worker:all`.</p>
          <p>4. Faça o primeiro teste em modo simulação e só depois troque para envio real com 1 contato próprio.</p>
          <p>5. Nenhuma mensagem real deve sair sem revisão no preflight da campanha.</p>
        </div>
      </SectionCard>
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

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-medium text-slate-950">{label}</p>
      <p className="mt-1 break-all text-sm text-slate-600">{value}</p>
    </div>
  );
}
