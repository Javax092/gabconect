import Link from "next/link";

import { getSession } from "@/lib/auth";

import { buttonVariants } from "@/components/ui/button";

export async function MainHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#040b16]/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-sm font-bold text-cyan-100">
            GC
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Gabinete Conectado
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/#arquitetura" className="hidden text-sm text-slate-300 md:block">
            Arquitetura
          </Link>
          <Link href="/#arquitetura" className="hidden text-sm text-slate-300 md:block">
            Compliance
          </Link>
          {session ? (
            <Link href="/admin" className={buttonVariants()}>
              Abrir operação
            </Link>
          ) : (
            <Link href="/login" className={buttonVariants()}>
              Fazer login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
