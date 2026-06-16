import { AlertTriangle, CheckCircle2, Clock3, KeyRound, PlugZap, ServerCog, ShieldCheck } from "lucide-react";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { DemoWhatsAppPage } from "@/components/demo/demo-pages";
import { WhatsAppOperationsPanel } from "@/components/whatsapp/whatsapp-operations-panel";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { getCachedOperationalReadiness } from "@/lib/operational-cache";
import { getWhatsAppCredentialSummary } from "@/lib/whatsapp";

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
  const readiness = await getCachedOperationalReadiness(user.mandateId);
  const credentials = getWhatsAppCredentialSummary();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp"
        title="Canal oficial e infraestrutura de envio"
        description="Acompanhe conexão Meta, credenciais, filas, workers e eventos recentes antes de liberar qualquer operação real."
        icon={<PlugZap className="h-5 w-5" />}
        aside={
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-950">
              {readiness.mode === "SIMULACAO" ? "WHATSAPP_DRY_RUN ativo" : "Envio real ativo"}
            </span>
            <p className="mt-1 text-xs">
              {readiness.mode === "SIMULACAO" ? "Nenhuma mensagem real será enviada." : "Mensagens aprovadas podem sair pela fila."}
            </p>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Conexão Meta"
          value={readiness.credentials.accessTokenConfigured && readiness.credentials.phoneNumberIdConfigured ? "Pronta" : "Atenção"}
          description="Token e Phone Number ID necessários para operação."
          icon={<PlugZap className="h-5 w-5" />}
          tone={readiness.credentials.accessTokenConfigured && readiness.credentials.phoneNumberIdConfigured ? "teal" : "amber"}
        />
        <MetricCard
          title="Webhook"
          value={readiness.webhook.configured ? "Configurado" : "Pendente"}
          description="Recebimento de eventos e status da Meta."
          icon={<ShieldCheck className="h-5 w-5" />}
          tone={readiness.webhook.configured ? "teal" : "amber"}
        />
        <MetricCard
          title="Fila e worker"
          value={readiness.outgoingWorkerReady ? "Online" : "Atenção"}
          description={`${readiness.queueSummary.queued} mensagens aguardando processamento.`}
          icon={<ServerCog className="h-5 w-5" />}
          tone={readiness.outgoingWorkerReady ? "teal" : "rose"}
        />
        <MetricCard
          title="Horário comercial"
          value="Supervisionado"
          description="Campanhas continuam protegidas pelo preflight operacional."
          icon={<Clock3 className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <WhatsAppOperationsPanel />

      <SectionCard title="Métricas de envio 24h" description="Resumo operacional para avaliar pressão de fila, bloqueios e estabilidade do canal.">
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricLine label="Enviadas" value={String(readiness.operationalMetrics.sent)} />
          <MetricLine label="Bloqueadas" value={String(readiness.operationalMetrics.blocked)} />
          <MetricLine label="Opt-outs" value={String(readiness.operationalMetrics.optOuts)} />
          <MetricLine label="Erros" value={String(readiness.operationalMetrics.errors)} />
          <MetricLine label="Taxa de entrega" value={`${readiness.operationalMetrics.deliveryRate}%`} />
          <MetricLine label="Fila pendente" value={String(readiness.operationalMetrics.pendingQueue)} />
          <MetricLine label="Tempo médio" value={`${readiness.operationalMetrics.averageSendTimeSeconds}s`} />
          <MetricLine label="Capacidade/hora" value={String(readiness.operationalMetrics.estimatedSafeCapacityPerHour)} />
        </div>
      </SectionCard>

      {readiness.operationalAlerts.length > 0 ? (
        <SectionCard title="Alertas operacionais" description="Pontos que exigem revisão antes de novas campanhas.">
          <div className="mt-4 space-y-3">
            {readiness.operationalAlerts.map((alert) => (
              <div key={alert.type} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <div className="flex items-center gap-2 text-amber-950">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium">{alert.type}</p>
                </div>
                <p className="mt-1 text-sm text-amber-800">{alert.message}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <SectionCard title="Diagnóstico de conexão" description="Leitura técnica resumida dos serviços que sustentam a operação.">
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <StatusLine label="Webhook endpoint" value={readiness.webhook.endpoint} />
            <StatusLine label="Assinatura Meta" value={readiness.webhook.appSecretConfigured ? "Ativa" : "Ausente"} />
            <StatusLine label="Redis" value={readiness.queueHealth.redis} />
            <StatusLine label="Filas" value={readiness.queueHealth.queues} />
            <StatusLine label="Fila de envio" value={String(readiness.queueSummary.queued)} />
            <StatusLine label="Processando agora" value={String(readiness.queueSummary.processing)} />
          </div>
        </SectionCard>

        <SectionCard className="border-brand-900 bg-brand-950 text-white">
          <h2 className="text-lg font-semibold">Modo atual</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/80">
            <p>{readiness.mode === "SIMULACAO" ? "Nenhum envio real será feito." : "A fila pode enviar mensagens reais aprovadas."}</p>
            <p>Não há envio imediato em massa: a campanha entra na fila e o worker outgoing processa gradualmente.</p>
            <p>Use apenas 1 contato próprio no primeiro teste real.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Credenciais operacionais" description="Valores mascarados para conferência segura de configuração.">
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatusLine label="Access token" value={credentials.accessToken} />
          <StatusLine label="Phone Number ID" value={credentials.phoneNumberId} />
          <StatusLine label="Verify token" value={credentials.verifyToken} />
          <StatusLine label="App secret" value={credentials.appSecret} />
          <StatusLine label="Contato de teste" value={credentials.testRecipient} />
        </div>
      </SectionCard>

      <SectionCard title="Checklist de configuração Meta" description="Itens necessários para que o canal opere com previsibilidade.">
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {readiness.envChecklist.map((item) => (
            <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-brand-700" />
                <p className="text-sm font-medium text-slate-950">{item.label}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.status}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Último evento recebido">
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Recebido em: {formatDateTime(readiness.latestInboundMessage?.createdAt ?? null)}</p>
            <p>Contato: {readiness.latestInboundMessage?.citizenName ?? "Nenhum evento recente registrado."}</p>
            <p>Telefone: {readiness.latestInboundMessage?.from ?? "—"}</p>
            <p>Conteúdo: {readiness.latestInboundMessage?.contentPreview ?? "—"}</p>
          </div>
        </SectionCard>

        <SectionCard title="Último envio realizado">
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Registrado em: {formatDateTime(readiness.latestDelivery?.createdAt ?? null)}</p>
            <p>Status: {readiness.latestDelivery?.status ?? "Nenhum envio recente registrado."}</p>
            <p>Contato: {readiness.latestDelivery?.contactName ?? "—"}</p>
            <p>Operação: {readiness.latestDelivery?.campaignName ?? "—"}</p>
            <p>Falha Meta: {readiness.latestDelivery?.errorMessage ?? "Nenhuma"}</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Eventos recentes do WhatsApp" description="Falhas e retornos relevantes para diagnóstico operacional.">
        <div className="mt-4 space-y-3">
          {readiness.recentErrors.length === 0 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma falha recente registrada.
            </div>
          ) : (
            readiness.recentErrors.map((error) => (
              <div key={error.id} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                <p className="text-sm font-medium text-rose-950">{error.message}</p>
                <p className="mt-1 text-sm text-rose-700">
                  {formatDateTime(error.createdAt)} • telefone {error.phone ?? "—"}
                </p>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="Instruções resumidas">
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
          <p>1. Configure `APP_URL` ou `NEXT_PUBLIC_APP_URL` e publique o endpoint `{readiness.webhook.endpoint}` na Meta.</p>
          <p>2. Cadastre `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `META_APP_SECRET`.</p>
          <p>3. Rode `npm run worker:incoming`, `npm run worker:outgoing` e `npm run worker:human` ou `npm run worker:all`.</p>
          <p>4. Faça o primeiro teste em modo simulação e só depois troque para envio real com 1 contato próprio.</p>
          <p>5. Nenhuma mensagem real deve sair sem revisão no preflight da campanha.</p>
        </div>
      </SectionCard>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-medium text-slate-950">{label}</p>
      <p className="mt-1 break-all text-sm text-slate-600">{value}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
