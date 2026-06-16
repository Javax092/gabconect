"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, PlugZap, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

type ActionState = {
  type: "idle" | "success" | "error";
  message: string;
};

async function readApiMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    return payload?.error?.message ?? "Operação não concluída.";
  }

  return payload?.message ?? "Operação concluída.";
}

export function WhatsAppOperationsPanel() {
  const [connectionState, setConnectionState] = useState<ActionState>({
    type: "idle",
    message: "Valide o Phone Number ID, token de acesso e qualidade do número."
  });
  const [sendState, setSendState] = useState<ActionState>({
    type: "idle",
    message: "Usa um template aprovado e apenas o contato de teste com opt-in."
  });
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [loadingSend, setLoadingSend] = useState(false);

  async function testConnection() {
    setLoadingConnection(true);

    try {
      const response = await fetch("/api/whatsapp/connection", {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
      const message = await readApiMessage(response);

      setConnectionState({
        type: response.ok ? "success" : "error",
        message
      });
    } finally {
      setLoadingConnection(false);
    }
  }

  async function testSend() {
    setLoadingSend(true);

    try {
      const response = await fetch("/api/whatsapp/test-send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmed: true })
      });
      const message = await readApiMessage(response);

      setSendState({
        type: response.ok ? "success" : "error",
        message
      });
    } finally {
      setLoadingSend(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <OperationCard
        icon={<PlugZap className="h-5 w-5" />}
        title="Teste de conexão Meta"
        description="Confirma credenciais no backend sem expor token no navegador."
        state={connectionState}
        actionLabel="Testar conexão"
        loading={loadingConnection}
        onAction={testConnection}
      />
      <OperationCard
        icon={<Send className="h-5 w-5" />}
        title="Teste de envio supervisionado"
        description="Envia somente um template aprovado para contato próprio com opt-in."
        state={sendState}
        actionLabel="Testar template"
        loading={loadingSend}
        onAction={testSend}
      />
    </div>
  );
}

function OperationCard({
  icon,
  title,
  description,
  state,
  actionLabel,
  loading,
  onAction
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  state: ActionState;
  actionLabel: string;
  loading: boolean;
  onAction: () => void;
}) {
  const stateClass =
    state.type === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : state.type === "error"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <span className="text-cyan-700">{icon}</span>
            <h3 className="font-semibold">{title}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <Button type="button" onClick={onAction} disabled={loading} className="shrink-0 gap-2">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {actionLabel}
        </Button>
      </div>
      <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${stateClass}`}>
        {state.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
        <p>{state.message}</p>
      </div>
    </div>
  );
}
