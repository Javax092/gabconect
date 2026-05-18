"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/utils";

export function HumanQueueActions({
  conversationId,
  aiPaused
}: {
  conversationId: string;
  aiPaused: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"takeover" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "takeover" | "resume") {
    setPendingAction(action);
    setError(null);

    try {
      const response = await fetch(
        action === "takeover"
          ? `/api/conversations/${conversationId}/takeover`
          : `/api/conversations/${conversationId}/resume-ai`,
        { method: "POST" }
      );
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível atualizar a conversa."));
        return;
      }

      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={pendingAction !== null} onClick={() => runAction("takeover")}>
          Assumir conversa
        </Button>
        {aiPaused ? (
          <Button type="button" variant="success" disabled={pendingAction !== null} onClick={() => runAction("resume")}>
            Reativar IA
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
