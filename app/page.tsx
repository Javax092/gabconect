import Link from "next/link";
import { ArrowRight, ShieldCheck, TimerReset, Waypoints } from "lucide-react";

import { MainHeader } from "@/components/layout/main-header";
import { buttonVariants } from "@/components/ui/button";

const architecture = [
  "WhatsApp Cloud API",
  "Webhook",
  "Queue Layer",
  "Compliance Layer",
  "Intent Detection",
  "AI Decision Engine",
  "Humanizer Layer",
  "Human Escalation",
  "WhatsApp Sender"
];

export default async function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#081120_48%,_#0f172a_100%)] text-white">
      <MainHeader />

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:px-8">
          <div>
            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              Infraestrutura segura de atendimento inteligente para WhatsApp
            </span>
            <h1 className="mt-8 max-w-4xl text-5xl font-semibold leading-tight text-white md:text-6xl">
              IA assistiva no backend. Supervisão humana na operação.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              O Gabinete Conectado reposiciona o WhatsApp como interface de entrada e transforma o
              backend em uma camada segura de triagem, roteamento e supervisão operacional.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/login" className={buttonVariants()}>
                Acessar operação
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <a href="#arquitetura" className={buttonVariants("secondary")}>
                Ver arquitetura
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Metric title="Compliance" value="24h" description="janela Meta protegida" />
              <Metric title="Controle" value="100%" description="humano no comando" />
              <Metric title="Fila" value="Híbrida" description="IA assistiva + equipe" />
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_rgba(3,7,18,0.45)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Central operacional</p>
            <div className="mt-5 space-y-3">
              <Preview title="Conversas" value="priorizadas por risco" />
              <Preview title="Fila humana" value="takeover supervisionado" />
              <Preview title="Templates" value="aprovados pela Meta" />
              <Preview title="IA" value="curta, objetiva, assistiva" />
            </div>
            <div className="mt-6 rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-7 text-emerald-50/90">
              Nada aqui tenta parecer CRM, ERP ou bot agressivo. A proposta é estabilidade,
              rastreabilidade e baixo risco operacional.
            </div>
          </div>
        </section>

        <section id="arquitetura" className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Arquitetura final</p>
            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {architecture.map((item) => (
                <div key={item} className="rounded-[22px] border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <Benefit
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Compliance Layer"
              description="Rate limiting, anti-flood, anti-loop, pacing, fallback humano e bloqueio preventivo."
            />
            <Benefit
              icon={<Waypoints className="h-5 w-5" />}
              title="Decision Engine"
              description="A IA não responde tudo. Ela classifica intenção, mede sensibilidade e decide quando escalar."
            />
            <Benefit
              icon={<TimerReset className="h-5 w-5" />}
              title="Janela Meta"
              description="Fora da janela de 24h, o sistema bloqueia envio automático e prioriza template ou humano."
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function Preview({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4">
      <p className="text-sm text-slate-300">{title}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function Benefit({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
        {icon}
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
    </article>
  );
}
