import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] px-6 py-16">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[40px] border border-white/10 bg-white shadow-soft lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="hidden bg-ink p-12 text-white lg:block">
          <p className="text-sm uppercase tracking-[0.2em] text-white/55">Gabinete Conectado</p>
          <h1 className="mt-8 max-w-md text-4xl font-semibold leading-tight">
            Infraestrutura operacional para atendimento inteligente no WhatsApp.
          </h1>
          <div className="mt-10 space-y-5 text-sm leading-7 text-white/70">
            <p>Centralize conversas, triagem, supervisão e decisões sensíveis em uma única camada segura.</p>
            <p>Controle acesso por equipe e operação com arquitetura pronta para escalar.</p>
            <p>Crie o primeiro acesso administrativo com o seed apenas durante a configuração inicial.</p>
          </div>
        </section>

        <section className="p-8 sm:p-10 lg:p-12">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
              Acesso seguro
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-ink">Entrar na operação</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Faça login com seu e-mail institucional para acessar a central operacional.
            </p>

            <div className="mt-10">
              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
