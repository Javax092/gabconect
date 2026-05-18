"use client";

type TrustRecoveryPanelProps = {
  trustRecovery: {
    status: string;
    reason: string;
    recommendedLimit: number;
    cooldownUntil: string | null;
    recoverySteps: string[];
  } | null;
};

export function TrustRecoveryPanel({ trustRecovery }: TrustRecoveryPanelProps) {
  const isActive =
    trustRecovery &&
    trustRecovery.status !== "RECOVERED" &&
    trustRecovery.status !== "INACTIVE";

  return (
    <article className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-sm font-semibold text-white">Trust recovery</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
            protecao reputacional e retomada supervisionada
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isActive
              ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {isActive ? "active" : "stable"}
        </span>
      </div>

      {isActive ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[20px] border border-amber-400/15 bg-amber-400/10 px-4 py-4">
            <p className="text-sm leading-6 text-amber-50/90">{trustRecovery.reason}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <RecoveryMetric label="Recommended limit" value={`${trustRecovery.recommendedLimit}/dia`} />
            <RecoveryMetric
              label="Cooldown until"
              value={
                trustRecovery.cooldownUntil
                  ? new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    }).format(new Date(trustRecovery.cooldownUntil))
                  : "monitorado"
              }
            />
          </div>

          <div className="space-y-2">
            {trustRecovery.recoverySteps.map((step, index) => (
              <div
                key={`${step}-${index}`}
                className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <span className="mt-1 h-2 w-2 rounded-full bg-amber-300" />
                <p className="text-sm text-slate-300">{step}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="rounded-[20px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-4">
            <p className="text-sm text-emerald-50/90">
              Sem restricao ativa. O numero segue em distribuicao responsavel com supervisao operacional.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RecoveryMetric label="Recommended limit" value="faixa normal" />
            <RecoveryMetric label="Cooldown until" value="nao aplicavel" />
          </div>
        </div>
      )}
    </article>
  );
}

function RecoveryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
