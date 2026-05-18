import { Settings2 } from "lucide-react";

import { DemoSettingsPage } from "@/components/demo/demo-pages";
import { MandateForm } from "@/components/settings/mandate-form";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

export default async function SettingsPage() {
  if (isDemoMode()) {
    return <DemoSettingsPage />;
  }

  const user = await requireUser();

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <Settings2 className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">Configurações operacionais</p>
            <p className="mt-1 text-sm text-slate-400">
              Identidade da operação, número oficial e diretrizes da IA assistiva.
            </p>
          </div>
        </div>
      </section>

      <MandateForm
        initialMandate={{
          id: user.mandate.id,
          name: user.mandate.name,
          politicianName: user.mandate.politicianName,
          city: user.mandate.city,
          state: user.mandate.state,
          whatsappNumber: user.mandate.whatsappNumber,
          aiPrompt: user.mandate.aiPrompt,
          createdAt: user.mandate.createdAt.toISOString()
        }}
      />
    </div>
  );
}
