import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MetricCardTone = "blue" | "teal" | "amber" | "rose" | "slate";

const toneMap: Record<MetricCardTone, string> = {
  blue: "border-brand-100 bg-brand-50/70 text-brand-700",
  teal: "border-teal-100 bg-teal-50/80 text-teal-700",
  amber: "border-amber-100 bg-amber-50/80 text-amber-700",
  rose: "border-rose-100 bg-rose-50/80 text-rose-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700"
};

export function MetricCard({
  title,
  value,
  description,
  icon,
  tone = "blue",
  className
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  tone?: MetricCardTone;
  className?: string;
}) {
  return (
    <article className={cn("rounded-3xl border border-slate-200 bg-white p-5 shadow-soft ring-1 ring-white/70", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
        </div>
        {icon ? (
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border", toneMap[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
      {description ? <p className="mt-4 text-sm leading-6 text-slate-500">{description}</p> : null}
    </article>
  );
}
