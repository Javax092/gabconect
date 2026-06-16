"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type RecalculateResponse = {
  success: boolean;
  message?: string;
  totalContacts?: number;
  recalculatedContacts?: number;
  vipContacts?: number;
  highInfluenceContacts?: number;
  heatmapAreas?: number;
  error?: {
    message: string;
  };
};

export function RecalculateIntelligenceButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function recalculate() {
    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/intelligence/recalculate", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as RecalculateResponse;

      if (!response.ok || !data.success) {
        setFeedback(data.error?.message ?? "Nao foi possivel recalcular.");
        return;
      }

      setFeedback(`${data.recalculatedContacts ?? 0} contatos recalculados.`);
      router.refresh();
    } catch {
      setFeedback("Nao foi possivel recalcular.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={recalculate} disabled={pending} className="w-full gap-2">
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {pending ? "Recalculando" : "Recalcular inteligencia"}
      </Button>
      {feedback ? <p className="text-xs leading-5 text-slate-600">{feedback}</p> : null}
    </div>
  );
}
