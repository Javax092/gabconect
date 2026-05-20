import { Fragment } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Layers3, Phone, Radar, RefreshCw } from "lucide-react";

import { CampaignRecipientStatusBadge } from "@/components/campaigns/campaign-recipient-status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  CAMPAIGN_OPERATION_FILTERS,
  getCampaignOperationsView,
  type CampaignOperationFilter
} from "@/lib/campaign-operations";
import { cn } from "@/lib/utils";

type CampaignOperationsView = Awaited<ReturnType<typeof getCampaignOperationsView>>;

type CampaignOperationsPanelProps = {
  campaigns: CampaignOperationsView["campaigns"];
  selectedCampaign: CampaignOperationsView["selectedCampaign"];
};

const FILTER_LABELS: Record<CampaignOperationFilter, string> = {
  all: "Todos",
  sent: "Enviados",
  pending: "Na fila",
  failed: "Falhas",
  opt_out: "Opt-outs",
  active: "Em operação",
  birthday_today: "Aniversário hoje"
};

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");

  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

function buildHref(input: {
  campaignId?: string;
  filter?: CampaignOperationFilter;
  page?: number;
}): Route {
  const params = new URLSearchParams();

  if (input.campaignId) params.set("campaignId", input.campaignId);
  if (input.filter && input.filter !== "all") params.set("filter", input.filter);
  if (input.page && input.page > 1) params.set("page", String(input.page));

  const query = params.toString();
  return (query ? `/admin/campaigns/operations?${query}` : "/admin/campaigns/operations") as Route;
}

function toneClass(tone: string) {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
}

export function CampaignOperationsPanel({
  campaigns,
  selectedCampaign
}: CampaignOperationsPanelProps) {
  if (!selectedCampaign) {
    return (
      <section className="rounded-[30px] border border-white/10 bg-[#07111e] p-6 text-slate-300 shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        Nenhuma campanha encontrada para este mandato.
      </section>
    );
  }

  const metrics = [
    { label: "Destinatários", value: selectedCampaign.summary.totalRecipients },
    { label: "Na fila", value: selectedCampaign.summary.queued },
    { label: "Em envio", value: selectedCampaign.summary.sending },
    { label: "Enviados", value: selectedCampaign.summary.sent },
    { label: "Simulados", value: selectedCampaign.summary.simulatedSent },
    { label: "Falhas", value: selectedCampaign.summary.failed },
    { label: "Ignorados", value: selectedCampaign.summary.skipped },
    { label: "Opt-out", value: selectedCampaign.summary.optOut },
    { label: "Delay médio", value: `${selectedCampaign.summary.averageDelaySeconds}s` },
    { label: "Modo", value: selectedCampaign.summary.mode }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/10 bg-[#07111e] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Operações da campanha
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Painel operacional</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Acompanhe o que já entrou na fila, o que está em envio, o que foi enviado,
              simulado, ignorado ou falhou, com timeline detalhada por destinatário.
            </p>
          </div>
          <Link
            href={buildHref({ campaignId: selectedCampaign.id, filter: selectedCampaign.filter, page: selectedCampaign.pagination.page })}
            className={buttonVariants("secondary") + " border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Link>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          {campaigns.map((campaign) => {
            const active = campaign.id === selectedCampaign.id;

            return (
              <Link
                key={campaign.id}
                href={buildHref({ campaignId: campaign.id })}
                className={cn(
                  "rounded-[24px] border px-4 py-4 transition",
                  active
                    ? "border-cyan-400/30 bg-cyan-400/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{campaign.name}</p>
                    <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-400">
                      {campaign.template.name}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                    {campaign.operationState?.pipelineStage ?? campaign.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <CompactCell label="Total" value={campaign._count.recipients} />
                  <CompactCell label="Enviados" value={campaign.sentCount} />
                  <CompactCell label="Falhas" value={campaign.failedCount} />
                </div>
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  atualizado {formatDateTime(campaign.updatedAt)}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,_rgba(4,11,22,0.98)_0%,_rgba(5,16,30,0.98)_100%)] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                <Radar className="h-3.5 w-3.5" />
                {selectedCampaign.status}
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                {selectedCampaign.operationState?.pipelineStage ?? "SEM PIPELINE"}
              </span>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-white">{selectedCampaign.name}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-cyan-200" />
                {selectedCampaign.templateName}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-cyan-200" />
                atualizado {formatDateTime(selectedCampaign.updatedAt)}
              </span>
            </div>
          </div>

          <div className="grid min-w-[280px] gap-2 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
            <MetaRow label="Template oficial" value={selectedCampaign.templateMetaName} />
            <MetaRow
              label="Cadência atual"
              value={`${selectedCampaign.operationState?.activeThroughput ?? 0}/${selectedCampaign.operationState?.safeThroughput ?? 0}`}
            />
            <MetaRow
              label="Delay humano"
              value={`${selectedCampaign.operationState?.currentDelayMin ?? selectedCampaign.summary.averageDelaySeconds}s-${selectedCampaign.operationState?.currentDelayMax ?? selectedCampaign.summary.averageDelaySeconds}s`}
            />
            <MetaRow
              label="Risco"
              value={String(selectedCampaign.operationState?.riskScore ?? 0)}
            />
            <MetaRow
              label="Pressão de fila"
              value={`${selectedCampaign.operationState?.queuePressure ?? 0}%`}
            />
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50/90">
          <p className="font-semibold text-white">Como ler os status desta operação</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <p><span className="font-medium text-white">Na fila:</span> destinatário confirmado e aguardando processamento.</p>
            <p><span className="font-medium text-white">Em envio:</span> worker processando esta mensagem agora.</p>
            <p><span className="font-medium text-white">Enviado:</span> mensagem concluída em modo real.</p>
            <p><span className="font-medium text-white">Simulado:</span> validação concluída sem envio real.</p>
            <p><span className="font-medium text-white">Falhou:</span> o envio não foi concluído e exige análise.</p>
            <p><span className="font-medium text-white">Ignorado:</span> contato retirado por regra operacional ou compliance.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {metric.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">{metric.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-[#07111e] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-sm font-semibold text-white">Destinatários</p>
            <p className="mt-1 text-sm text-slate-400">
              {selectedCampaign.pagination.total} registro(s) no filtro atual
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              A timeline abaixo mostra o histórico operacional por destinatário, incluindo fila,
              processamento, entrega, simulação, falhas e bloqueios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_OPERATION_FILTERS.map((filter) => (
              <Link
                key={filter}
                href={buildHref({ campaignId: selectedCampaign.id, filter, page: 1 })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  selectedCampaign.filter === filter
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                )}
              >
                {FILTER_LABELS[filter]}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {selectedCampaign.summary.totalRecipients === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              <p>Esta operação ainda não possui destinatários enfileirados.</p>
              <Link
                href={selectedCampaign.reviewHref as Route}
                className={buttonVariants("secondary") + " mt-4 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"}
              >
                Revisar destinatários
              </Link>
            </div>
          ) : (
            <>
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 pb-1">Nome</th>
                    <th className="px-3 pb-1">Telefone</th>
                    <th className="px-3 pb-1">Código</th>
                    <th className="px-3 pb-1">Status</th>
                    <th className="px-3 pb-1">Preview</th>
                    <th className="px-3 pb-1">Última atualização</th>
                    <th className="px-3 pb-1">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCampaign.recipients.map((recipient) => (
                    <Fragment key={recipient.id}>
                      <tr
                        className="align-top text-sm text-slate-200"
                      >
                        <td className="rounded-l-[18px] border border-r-0 border-white/10 bg-white/[0.03] px-3 py-3">
                          <div className="font-medium text-white">{recipient.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                            {recipient.contactStatus}
                            {recipient.isBirthdayToday ? " • ANIVERSÁRIO" : ""}
                          </div>
                        </td>
                        <td className="border-y border-white/10 bg-white/[0.03] px-3 py-3 text-slate-300">
                          <span className="inline-flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-cyan-200" />
                            {formatPhone(recipient.phone)}
                          </span>
                        </td>
                        <td className="border-y border-white/10 bg-white/[0.03] px-3 py-3 font-mono text-xs tracking-[0.18em] text-slate-300">
                          {recipient.code}
                        </td>
                        <td className="border-y border-white/10 bg-white/[0.03] px-3 py-3">
                          <CampaignRecipientStatusBadge status={recipient.status} />
                        </td>
                        <td className="border-y border-white/10 bg-white/[0.03] px-3 py-3 text-slate-300">
                          <p className="max-w-[360px] whitespace-normal leading-6">{recipient.preview}</p>
                        </td>
                        <td className="border-y border-white/10 bg-white/[0.03] px-3 py-3 text-slate-300">
                          {formatDateTime(recipient.updatedAt)}
                        </td>
                        <td className="rounded-r-[18px] border border-l-0 border-white/10 bg-white/[0.03] px-3 py-3 text-slate-300">
                          {recipient.failureReason ?? "—"}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={7} className="px-2 pb-2">
                          <div className="rounded-[18px] border border-white/10 bg-[#030913] px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Timeline operacional
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {recipient.timeline.length > 0 ? (
                                recipient.timeline.map((event) => (
                                  <div
                                    key={event.id}
                                    className={cn(
                                      "min-w-[180px] rounded-2xl border px-3 py-2 text-xs",
                                      toneClass(event.tone)
                                    )}
                                  >
                                    <p className="font-semibold uppercase tracking-[0.16em]">
                                      {event.title}
                                    </p>
                                    <p className="mt-1 leading-5 text-current/90">{event.message}</p>
                                    <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-current/70">
                                      {formatDateTime(event.createdAt)}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                                  Sem eventos operacionais para este destinatário.
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {selectedCampaign.recipients.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  Nenhum destinatário encontrado para este filtro.
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-sm text-slate-400">
            Página {selectedCampaign.pagination.page} de {selectedCampaign.pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Link
              href={buildHref({
                campaignId: selectedCampaign.id,
                filter: selectedCampaign.filter,
                page: Math.max(1, selectedCampaign.pagination.page - 1)
              })}
              className={cn(
                buttonVariants("secondary"),
                "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                selectedCampaign.pagination.page <= 1 && "pointer-events-none opacity-50"
              )}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Anterior
            </Link>
            <Link
              href={buildHref({
                campaignId: selectedCampaign.id,
                filter: selectedCampaign.filter,
                page: Math.min(selectedCampaign.pagination.totalPages, selectedCampaign.pagination.page + 1)
              })}
              className={cn(
                buttonVariants("secondary"),
                "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                selectedCampaign.pagination.page >= selectedCampaign.pagination.totalPages &&
                  "pointer-events-none opacity-50"
              )}
            >
              Próxima
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function CompactCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#030913] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}
