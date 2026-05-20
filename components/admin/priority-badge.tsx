import type { ComponentType } from "react";
import { AlertTriangle, Minus, TimerReset } from "lucide-react";

import type { DemandPriorityValue } from "@/lib/prisma-enums";
import { cn } from "@/lib/utils";

const labelMap: Record<DemandPriorityValue, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta"
};

const toneMap: Record<DemandPriorityValue, string> = {
  LOW: "border-slate-200 bg-slate-100 text-slate-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-rose-200 bg-rose-50 text-rose-800"
};

const iconMap: Record<DemandPriorityValue, ComponentType<{ className?: string }>> = {
  LOW: Minus,
  MEDIUM: TimerReset,
  HIGH: AlertTriangle
};

export function PriorityBadge({
  priority,
  className
}: {
  priority: DemandPriorityValue;
  className?: string;
}) {
  const Icon = iconMap[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        toneMap[priority],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      Prioridade {labelMap[priority]}
    </span>
  );
}
