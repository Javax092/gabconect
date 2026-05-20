import type { ComponentType } from "react";
import { Bot, CircleDot, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

import type { ConversationStatusValue, DemandStatusValue } from "@/lib/prisma-enums";
import { cn } from "@/lib/utils";

type StatusValue = DemandStatusValue | ConversationStatusValue;

const labelMap: Record<StatusValue, string> = {
  NEW: "Nova",
  IN_PROGRESS: "Em andamento",
  RESOLVED: "Resolvida",
  REJECTED: "Rejeitada",
  OPEN: "Em triagem",
  HUMAN: "Aguardando humano",
  CLOSED: "Encerrada"
};

const toneMap: Record<StatusValue, string> = {
  NEW: "border-sky-200 bg-sky-50 text-sky-800",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-800",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-800",
  OPEN: "border-sky-200 bg-sky-50 text-sky-800",
  HUMAN: "border-amber-200 bg-amber-50 text-amber-800",
  CLOSED: "border-slate-200 bg-slate-100 text-slate-700"
};

const iconMap: Record<StatusValue, ComponentType<{ className?: string }>> = {
  NEW: CircleDot,
  IN_PROGRESS: ShieldAlert,
  RESOLVED: CheckCircle2,
  REJECTED: XCircle,
  OPEN: Bot,
  HUMAN: ShieldAlert,
  CLOSED: CheckCircle2
};

export function StatusBadge({ status, className }: { status: StatusValue; className?: string }) {
  const Icon = iconMap[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        toneMap[status],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {labelMap[status]}
    </span>
  );
}
