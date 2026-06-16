import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type RiskTone = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const config: Record<RiskTone, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  LOW: {
    label: "Risco baixo",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2
  },
  MEDIUM: {
    label: "Atenção",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: CircleAlert
  },
  HIGH: {
    label: "Risco alto",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    icon: AlertTriangle
  },
  CRITICAL: {
    label: "Crítico",
    className: "border-red-200 bg-red-50 text-red-800",
    icon: AlertTriangle
  }
};

export function RiskBadge({ risk, className }: { risk: RiskTone; className?: string }) {
  const item = config[risk];
  const Icon = item.icon;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", item.className, className)}>
      <Icon className="h-3.5 w-3.5" />
      {item.label}
    </span>
  );
}
