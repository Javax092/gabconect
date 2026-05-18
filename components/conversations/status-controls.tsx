"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, LoaderCircle, ShieldAlert, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/utils";

type StatusControlsProps = {
  conversationId: string;
  currentStatus: "OPEN" | "HUMAN" | "CLOSED";
};

export function StatusControls({ conversationId, currentStatus }: StatusControlsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: "OPEN" | "HUMAN" | "CLOSED") {
    setPendingStatus(status);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });

      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível atualizar o status."));
        return;
      }

      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
      <h3 className="text-lg font-semibold text-ink">Ações da conversa</h3>
      <p className="mt-1 text-sm text-slate-500">
        Status atual: {currentStatus === "HUMAN" ? "Aguardando humano" : currentStatus === "OPEN" ? "Em triagem" : "Encerrada"}
      </p>

      {currentStatus === "HUMAN" ? (
        <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />
            <p>Esta conversa foi marcada para ação humana. Um supervisor deve assumir o atendimento.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <Button
          variant={currentStatus === "HUMAN" ? "primary" : "secondary"}
          className="w-full gap-2"
          disabled={pendingStatus !== null}
          onClick={() => updateStatus("HUMAN")}
        >
          {pendingStatus === "HUMAN" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          Assumir conversa
        </Button>

        <Button
          variant={currentStatus === "OPEN" ? "primary" : "secondary"}
          className="w-full gap-2"
          disabled={pendingStatus !== null}
          onClick={() => updateStatus("OPEN")}
        >
          {pendingStatus === "OPEN" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          Reativar IA
        </Button>

        <Button
          variant={currentStatus === "CLOSED" ? "primary" : "secondary"}
          className="w-full gap-2"
          disabled={pendingStatus !== null}
          onClick={() => updateStatus("CLOSED")}
        >
          {pendingStatus === "CLOSED" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Encerrar conversa
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
