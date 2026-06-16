"use client";

import { CampaignSafetySimulator } from "@/components/campaigns/campaign-safety-simulator";
import { Button } from "@/components/ui/button";

type SimulationData = {
  riskLevel: string;
  safetyScore: number;
  recommendedDailyLimit: number;
  recommendedBatchSize: number;
  recommendedDelayMinSeconds: number;
  recommendedDelayMaxSeconds: number;
  recommendedStartTime: string | null;
  requiresHumanReview: boolean;
  canStartNow: boolean;
  estimatedCompletionTime: string | null;
  estimatedReputationImpact: string | null;
  warnings: string[];
  recommendations: string[];
  blockingReasons: string[];
  profile: {
    reputationScore: number;
    trustLevel: string;
    qualityRating: string;
  };
};

type PreflightCheckModalProps = {
  open: boolean;
  loading: boolean;
  audienceLoading: boolean;
  actionLoading: boolean;
  simulation: SimulationData | null;
  modeLabel: "REAL" | "SIMULACAO";
  audiencePreview: {
    totalElegiveis: number;
    totalInvalidos: number;
    totalBloqueados?: number;
    totalOptOut: number;
    totalSemTelefone: number;
    totalSemOptIn: number;
    totalEncontrados?: number;
    totalJaConfirmados?: number;
    totalSelecionados?: number;
    totalPages?: number;
    blockedBy?: Array<{
      reason: string;
      count: number;
    }>;
    recipients: Array<{
      contactId: string;
      name: string;
      phone: string;
      code: string;
      tags: string[];
      birthday: string | null;
      optInStatus: string;
      inclusionReason: string;
      renderedPreview: string;
      selectionState: string;
    }>;
  } | null;
  campaignName: string | null;
  templateName: string | null;
  campaignMode: string | null;
  confirmed: boolean;
  onClose: () => void;
  onStart: () => void;
  onReview: () => void;
  onConfirmChange: (value: boolean) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
};

function getStateLabel(simulation: SimulationData | null) {
  if (!simulation) return "Analisando validações operacionais";
  if (simulation.riskLevel === "CRITICAL") return "Bloqueado por risco crítico";
  if (simulation.requiresHumanReview) return "Aguardando revisão humana";
  if (simulation.riskLevel === "HIGH") return "Pode iniciar com cautela";
  return "Apto para iniciar";
}

export function PreflightCheckModal({
  open,
  loading,
  audienceLoading,
  actionLoading,
  simulation,
  audiencePreview,
  campaignName,
  templateName,
  campaignMode,
  modeLabel,
  confirmed,
  onClose,
  onStart,
  onReview,
  onConfirmChange,
  onPageChange,
  currentPage
}: PreflightCheckModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,_rgba(6,17,31,0.98)_0%,_rgba(10,21,38,0.98)_100%)] p-6 shadow-[0_30px_100px_rgba(2,6,23,0.6)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Analise pre-envio</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Confirmar envio supervisionado</h2>
            <p className="mt-2 text-sm text-slate-300">
              {campaignName ?? "Campanha"} • {getStateLabel(simulation)}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Esta etapa confirma quem será processado, em qual modo a campanha será iniciada e
              como a operação entrará na fila antes do worker começar o envio gradual.
            </p>
          </div>
          <Button variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={onClose}>
            Fechar
          </Button>
        </div>

        {loading || !simulation ? (
          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            Validando audiência, reputação operacional, cadência recomendada e salvaguardas de envio...
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <CampaignSafetySimulator simulation={simulation} />
            <section className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50/90">
              <p className="font-semibold text-white">Resumo operacional</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetaCard label="Total revisado" value={String(audiencePreview?.totalSelecionados ?? 0)} />
                <MetaCard label="Encontrados" value={String(audiencePreview?.totalEncontrados ?? 0)} />
                <MetaCard label="Elegíveis para fila" value={String(audiencePreview?.totalElegiveis ?? 0)} />
                <MetaCard
                  label="Cadência estimada"
                  value={`${simulation.recommendedBatchSize} por ciclo`}
                />
                <MetaCard
                  label="Tempo estimado"
                  value={simulation.estimatedCompletionTime ?? "Calculado após início"}
                />
              </div>
              <div className="mt-3 grid gap-2 text-sm text-cyan-50/85">
                <p>A campanha será colocada em fila e não fará envio imediato em massa.</p>
                <p>O worker processará os envios gradualmente conforme a cadência recomendada.</p>
                <p>O delay humano distribui as mensagens para manter uma operação segura.</p>
                <p>O compliance aplica validações automáticas antes e durante o processamento.</p>
                <p>Destinatários selecionados manualmente não dependem dos filtros da campanha.</p>
                <p>
                  {modeLabel === "SIMULACAO"
                    ? "Nenhuma mensagem real será enviada neste modo. O sistema apenas valida o fluxo operacional."
                    : "Este modo realiza envio real para os destinatários elegíveis aprovados nesta revisão."}
                </p>
              </div>
            </section>
            <section className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-sm font-semibold text-white">Destinatários previstos</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    revisar antes de colocar a campanha em fila
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  <span>Selecionados {audiencePreview?.totalSelecionados ?? 0}</span>
                  <span>Encontrados {audiencePreview?.totalEncontrados ?? 0}</span>
                  <span>Elegíveis {audiencePreview?.totalElegiveis ?? 0}</span>
                  <span>Telefone inválido {audiencePreview?.totalInvalidos ?? 0}</span>
                  <span>Opt-out {audiencePreview?.totalOptOut ?? 0}</span>
                  <span>Bloqueio explícito {audiencePreview?.totalBloqueados ?? 0}</span>
                  <span>Enfileirados {audiencePreview?.totalJaConfirmados ?? 0}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetaCard label="Operação" value={campaignName ?? "Campanha"} />
                <MetaCard label="Tipo da campanha" value={campaignMode ?? "TEST"} />
                <MetaCard label="Template oficial" value={templateName ?? "Template"} />
                <MetaCard
                  label="Delay humano"
                  value={`${simulation.recommendedDelayMinSeconds}s-${simulation.recommendedDelayMaxSeconds}s`}
                />
                <MetaCard
                  label="Modo atual"
                  value={modeLabel === "SIMULACAO" ? "Simulação" : "Envio real"}
                />
                <MetaCard
                  label="Lote / limite diário"
                  value={`${simulation.recommendedBatchSize}/${simulation.recommendedDailyLimit}`}
                />
              </div>

              <p className="mt-4 text-sm text-slate-300">
                Destinatários selecionados manualmente não dependem dos filtros da campanha.
              </p>
              {campaignMode === "BIRTHDAY" ? (
                <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                  Esta campanha usa o fluxo de aniversario. Confira se o template e a audiencia sao de aniversariantes antes de iniciar.
                </p>
              ) : null}

              {audienceLoading ? (
                <div className="mt-4 text-sm text-slate-300">Carregando destinatários previstos...</div>
              ) : !audiencePreview || audiencePreview.recipients.length === 0 ? (
                <div className="mt-4 text-sm text-slate-300">Nenhum destinatário elegível para iniciar.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        <th className="px-3 py-2 font-medium">Nome</th>
                        <th className="px-3 py-2 font-medium">Telefone</th>
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Situação</th>
                        <th className="px-3 py-2 font-medium">Preview individual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audiencePreview.recipients.map((recipient) => (
                        <tr key={recipient.contactId} className="align-top">
                          <td className="rounded-l-2xl border-y border-l border-white/8 bg-white/[0.03] px-3 py-3 text-white">
                            {recipient.name}
                          </td>
                          <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                            {recipient.phone || "—"}
                          </td>
                          <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 font-mono text-xs tracking-[0.18em] text-slate-300">
                            {recipient.code}
                          </td>
                          <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                            {formatSelectionState(recipient.selectionState)}
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                            {recipient.renderedPreview}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Página {currentPage} de {audiencePreview.totalPages ?? 1}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        disabled={audienceLoading || currentPage <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                        onClick={() => onPageChange(Math.min(audiencePreview.totalPages ?? 1, currentPage + 1))}
                        disabled={
                          audienceLoading ||
                          currentPage >= (audiencePreview.totalPages ?? 1)
                        }
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <label className="mt-4 flex items-center gap-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirmChange(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-slate-950"
                />
                Confirmo que revisei a audiência e autorizo a continuidade desta operação.
              </label>
            </section>
            {simulation.recommendedStartTime ? (
              <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50/90">
                Início recomendado a partir de {new Date(simulation.recommendedStartTime).toLocaleString("pt-BR")}.
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="gap-2"
            onClick={onStart}
            disabled={
              loading ||
              audienceLoading ||
              actionLoading ||
              !simulation ||
              !confirmed ||
              simulation.riskLevel === "CRITICAL" ||
              simulation.requiresHumanReview
            }
          >
            Iniciar envio supervisionado
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={actionLoading}>
            Ajustar campanha
          </Button>
          <Button
            variant="secondary"
            onClick={onReview}
            disabled={loading || actionLoading || !simulation}
          >
            Solicitar revisão humana
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={actionLoading}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#030913] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function formatSelectionState(value: string) {
  const labels: Record<string, string> = {
    ELEGIVEL: "Elegível",
    BLOQUEADO: "Bloqueado",
    SEM_OPT_IN: "Primeiro contato pendente",
    PRIMEIRO_CONTATO_PENDENTE: "Primeiro contato pendente",
    SEM_TELEFONE: "Sem telefone",
    OPT_OUT: "Opt-out",
    JA_ENFILEIRADO: "Já enfileirado"
  };

  return labels[value] ?? value;
}
