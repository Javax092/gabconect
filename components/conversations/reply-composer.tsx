"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/utils";

type ReplyComposerProps = {
  conversationId: string;
};

export function ReplyComposer({ conversationId }: ReplyComposerProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!text.trim()) {
      setError("Digite uma mensagem antes de enviar.");
      return;
    }

    setPending(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível enviar a resposta."));
        return;
      }

      setText("");
      setFeedback(data.message ?? "Mensagem enviada com sucesso.");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
      <div>
        <h3 className="text-lg font-semibold text-ink">Responder pela equipe</h3>
        <p className="mt-1 text-sm text-slate-500">
          A resposta será registrada no histórico e enviada pelo WhatsApp oficial com rastreabilidade.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        placeholder="Digite a resposta operacional..."
        className="mt-4 flex w-full rounded-[24px] border border-line bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
      />
      <p className="mt-3 text-xs leading-6 text-slate-500">
        Use um tom institucional, acolhedor e objetivo. A IA orienta a triagem, mas a decisão final continua humana.
      </p>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="submit" className="gap-2" disabled={pending}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? "Enviando..." : "Enviar resposta"}
        </Button>
      </div>
    </form>
  );
}
