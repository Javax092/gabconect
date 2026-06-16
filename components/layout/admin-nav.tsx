"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  Cpu,
  Database,
  Layers3,
  Megaphone,
  MessageSquareText,
  PlugZap,
  Settings2,
  ShieldCheck,
  ShieldUser,
  Stamp
} from "lucide-react";

import { cn } from "@/lib/utils";

import { LogoutButton } from "@/components/auth/logout-button";

const navigationItems: Array<{
  href: Route;
  label: string;
  icon: ReactNode;
}> = [
  {
    href: "/admin",
    label: "Painel",
    icon: <Layers3 className="h-4 w-4" />
  },
  {
    href: "/admin/conversations",
    label: "Conversas",
    icon: <MessageSquareText className="h-4 w-4" />
  },
  {
    href: "/admin/human-queue",
    label: "Fila Humana",
    icon: <ShieldUser className="h-4 w-4" />
  },
  {
    href: "/admin/templates",
    label: "Templates",
    icon: <Stamp className="h-4 w-4" />
  },
  {
    href: "/admin/campaigns",
    label: "Campanhas",
    icon: <Megaphone className="h-4 w-4" />
  },
  {
    href: "/admin/contacts",
    label: "Contatos",
    icon: <Database className="h-4 w-4" />
  },
  {
    href: "/admin/intelligence",
    label: "Inteligência",
    icon: <BrainCircuit className="h-4 w-4" />
  },
  {
    href: "/admin/ai",
    label: "IA",
    icon: <Cpu className="h-4 w-4" />
  },
  {
    href: "/admin/whatsapp",
    label: "WhatsApp",
    icon: <PlugZap className="h-4 w-4" />
  },
  {
    href: "/admin/settings",
    label: "Configurações",
    icon: <Settings2 className="h-4 w-4" />
  }
];

function matchesPath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname.startsWith(href);
}

export function AdminNav({
  user
}: {
  user: {
    name: string;
    email: string;
    mandate: {
      name: string;
      city: string;
      state: string;
    };
  };
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[292px] border-r border-slate-200 bg-[linear-gradient(180deg,_#07111f_0%,_#0b1f35_52%,_#102a3a_100%)] text-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b border-white/10 px-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-200">
              GabineteConectado
            </p>
            <h1 className="mt-2 text-lg font-semibold text-white">CRM político inteligente</h1>
          </div>
        </div>

        <div className="flex-1 px-5 py-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-sm font-semibold text-white">{user.mandate.name}</p>
            <p className="mt-1 text-sm text-slate-400">{user.mandate.city}, {user.mandate.state}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/90">
              <ShieldCheck className="h-3.5 w-3.5" />
              Supervisão humana ativa
            </p>
          </div>

          <nav className="mt-6 space-y-2">
            {navigationItems.map((item) => {
              const active = matchesPath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-white/10 px-5 py-5">
          <div className="mb-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-sm font-medium text-white">{user.name}</p>
            <p className="mt-1 text-sm text-slate-400">{user.email}</p>
          </div>
          <LogoutButton variant="sidebar" />
        </div>
      </aside>

      <nav className="fixed inset-x-4 bottom-4 z-50 rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_45px_rgba(15,23,32,0.18)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navigationItems.map((item) => {
            const active = matchesPath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-medium transition",
                    active ? "bg-brand-900 text-white" : "text-slate-500"
                  )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
