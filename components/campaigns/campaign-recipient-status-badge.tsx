"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock3, PauseCircle, ShieldBan } from "lucide-react";

import type { OperationalRecipientStatus } from "@/lib/campaign-operations";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  OperationalRecipientStatus,
  {
    label: string;
    className: string;
    icon: typeof Clock3;
  }
> = {
  QUEUED: {
    label: "Na fila",
    className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    icon: Clock3
  },
  SENDING: {
    label: "Em envio",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    icon: Activity
  },
  SENT: {
    label: "Enviado",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    icon: CheckCircle2
  },
  SIMULATED_SENT: {
    label: "Simulado",
    className: "border-indigo-400/20 bg-indigo-400/10 text-indigo-100",
    icon: CheckCircle2
  },
  FAILED: {
    label: "Falhou",
    className: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    icon: AlertTriangle
  },
  SKIPPED: {
    label: "Ignorado",
    className: "border-slate-400/20 bg-slate-400/10 text-slate-200",
    icon: PauseCircle
  },
  OPTED_OUT: {
    label: "Opt-out",
    className: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100",
    icon: ShieldBan
  }
};

export function CampaignRecipientStatusBadge({
  status,
  className
}: {
  status: OperationalRecipientStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em]",
        meta.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
