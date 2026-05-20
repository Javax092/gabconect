"use client";

type CampaignRiskTimelineProps = {
  warnings: string[];
  recommendations: string[];
  blockingReasons: string[];
};

export function CampaignRiskTimeline({
  warnings,
  recommendations,
  blockingReasons
}: CampaignRiskTimelineProps) {
  const items = [
    ...warnings.map((item) => ({ tone: "amber", label: "Alerta", text: item })),
    ...recommendations.map((item) => ({ tone: "cyan", label: "Acao", text: item })),
    ...blockingReasons.map((item) => ({ tone: "rose", label: "Bloqueio", text: item }))
  ];

  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Checklist operacional</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Sem alertas ativos. O plano recomendado está dentro da faixa segura.</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex gap-3">
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  item.tone === "rose" ? "bg-rose-400" : item.tone === "amber" ? "bg-amber-300" : "bg-cyan-300"
                }`}
              />
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">{item.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
