"use client";

type ReputationRiskPanelProps = {
  reputationScore: number;
  riskLevel: string;
  safetyScore: number;
  trustLevel?: string | null;
  qualityRating?: string | null;
};

export function ReputationRiskPanel({
  reputationScore,
  riskLevel,
  safetyScore,
  trustLevel,
  qualityRating
}: ReputationRiskPanelProps) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Reputacao operacional</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Este painel resume o nível de segurança atual da operação antes do envio.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Índice de segurança" value={String(safetyScore)} />
        <Metric label="Risco estimado" value={riskLevel} />
        <Metric label="Reputação atual" value={`${reputationScore}/100`} />
        <Metric label="Nível de confiança" value={trustLevel ?? "Supervisionado"} />
      </div>
      {qualityRating ? (
        <p className="mt-4 text-sm text-slate-300">Qualidade operacional atual: {qualityRating}</p>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
