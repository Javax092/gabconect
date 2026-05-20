import { Building2 } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { DemoModeControl, DemoProvider } from "@/components/demo/demo-provider";
import { AdminNav } from "@/components/layout/admin-nav";
import { isDemoMode } from "@/lib/demo";

type DashboardShellProps = {
  user: {
    name: string;
    email: string;
    mandate: {
      name: string;
      city: string;
      state: string;
    };
  };
  children: React.ReactNode;
};

export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <DemoProvider>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.08),_transparent_16%),linear-gradient(180deg,_#030712_0%,_#08101d_48%,_#0f172a_100%)] text-slate-100">
        <AdminNav user={user} />

        <div className="lg:pl-[292px]">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07101d]/88 backdrop-blur">
            <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Central operacional
                </p>
                <div className="mt-2 flex items-center gap-2 text-white">
                  <Building2 className="h-4 w-4 text-cyan-300" />
                  <span className="truncate text-sm font-semibold sm:text-base">
                    {user.mandate.name}
                  </span>
                  {isDemoMode() ? (
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      Demo
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                {isDemoMode() ? <DemoModeControl /> : null}
                <div className="flex items-center gap-3">
                  <div className="hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 xl:block">
                    Operação assistida
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-white">{user.name}</p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                  <LogoutButton variant="topbar" />
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
    </DemoProvider>
  );
}
