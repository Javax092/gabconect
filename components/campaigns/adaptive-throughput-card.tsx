"use client";

type AdaptiveThroughputCardProps = {
  recommendedDailyLimit: number;
  recommendedBatchSize: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  estimatedCompletionTime?: string | null;
};

export function AdaptiveThroughputCard({
  recommendedDailyLimit,
  recommendedBatchSize,
  delayMinSeconds,
  delayMaxSeconds,
  estimatedCompletionTime
}: AdaptiveThroughputCardProps) {
  return (
    <article className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Cadência operacional recomendada</p>
      <p className="mt-2 text-sm leading-6 text-cyan-50/85">
        Esta recomendação indica quantas mensagens podem ser processadas por ciclo e qual intervalo
        deve ser mantido entre elas para proteger a operação.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Limite seguro" value={`${recommendedDailyLimit}/dia`} />
        <Metric label="Por ciclo" value={String(recommendedBatchSize)} />
        <Metric label="Delay mínimo" value={`${delayMinSeconds}s`} />
        <Metric label="Delay máximo" value={`${delayMaxSeconds}s`} />
      </div>
      {estimatedCompletionTime ? (
        <p className="mt-4 text-sm text-cyan-50/90">Tempo estimado de processamento: {estimatedCompletionTime}</p>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-cyan-300/15 bg-slate-950/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
