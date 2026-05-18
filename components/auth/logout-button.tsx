"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";

export function LogoutButton({
  variant = "default"
}: {
  variant?: "default" | "sidebar" | "topbar";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      router.push("/login");
      router.refresh();
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-sm font-medium transition disabled:opacity-60",
        variant === "sidebar" &&
          "w-full rounded-2xl border border-white/10 px-4 py-3 text-slate-200 hover:bg-white/10 hover:text-white",
        variant === "topbar" &&
          "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 hover:bg-slate-50",
        variant === "default" &&
          "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 hover:bg-slate-50"
      )}
    >
      <LogOut className="h-4 w-4" />
      {pending ? "Saindo..." : "Sair"}
    </button>
  );
}
