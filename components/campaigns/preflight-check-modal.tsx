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
  actionLoading: boolean;
  simulation: SimulationData | null;
  campaignName: string | null;
  onClose: () => void;
  onStart: () => void;
  onReview: () => void;
};

function getStateLabel(simulation: SimulationData | null) {
  if (!simulation) return "Analisando";
  if (simulation.riskLevel === "CRITICAL") return "Bloqueado por risco critico";
  if (simulation.requiresHumanReview) return "Requer revisao humana";
  if (simulation.riskLevel === "HIGH") return "Iniciar com cautela";
  return "Seguro para iniciar";
}

export function PreflightCheckModal({
  open,
  loading,
  actionLoading,
  simulation,
  campaignName,
  onClose,
  onStart,
  onReview
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
            <h2 className="mt-2 text-2xl font-semibold text-white">Análise de segurança antes do envio</h2>
            <p className="mt-2 text-sm text-slate-300">
              {campaignName ?? "Campanha"} • {getStateLabel(simulation)}
            </p>
          </div>
          <Button variant="ghost" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={onClose}>
            Fechar
          </Button>
        </div>

        {loading || !simulation ? (
          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
            Gerando plano seguro recomendado, reputacao operacional e limites de throughput...
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <CampaignSafetySimulator simulation={simulation} />
            {simulation.recommendedStartTime ? (
              <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50/90">
                Inicio recomendado a partir de {new Date(simulation.recommendedStartTime).toLocaleString("pt-BR")}.
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
              actionLoading ||
              !simulation ||
              simulation.riskLevel === "CRITICAL" ||
              simulation.requiresHumanReview
            }
          >
            Iniciar com plano recomendado
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={actionLoading}>
            Ajustar campanha
          </Button>
          <Button
            variant="secondary"
            onClick={onReview}
            disabled={loading || actionLoading || !simulation}
          >
            Enviar para revisão humana
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={actionLoading}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
