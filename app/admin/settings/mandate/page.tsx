import { Settings2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { DemoSettingsPage } from "@/components/demo/demo-pages";
import { MandateForm } from "@/components/settings/mandate-form";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

export default async function MandateSettingsPage() {
  if (isDemoMode()) {
    return <DemoSettingsPage />;
  }

  const user = await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configurações"
        title="Mandato"
        description="Defina identidade institucional, dados operacionais e o contexto que orienta a IA sem promessas indevidas ao cidadão."
        icon={<Settings2 className="h-5 w-5" />}
      />

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
