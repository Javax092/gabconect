import { Radar } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { CampaignInfrastructurePanels } from "@/components/campaigns/campaign-infrastructure-panels";
import { getOperationalControlSnapshot } from "@/app/admin/campaigns/actions";
import { isDemoMode } from "@/lib/demo";

export default async function CampaignOperationsPage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
      <PageHeader
        eyebrow="Operacoes"
        title="Command center operacional"
        description="Disponivel apenas fora do modo demonstracao, com numero operacional, campanhas reais e sinais de fila."
        icon={<Radar className="h-5 w-5" />}
      />
      </div>
    );
  }

  const snapshot = await getOperationalControlSnapshot();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacoes"
        title="Command center de reputacao e throughput"
        description="Observabilidade de risco, distribuicao responsavel, trust recovery e filas em execucao."
        icon={<Radar className="h-5 w-5" />}
      />

      <CampaignInfrastructurePanels
        profile={snapshot.profile}
        metrics={snapshot.metrics}
        warmupRules={snapshot.warmupRules}
        trustRecovery={snapshot.trustRecovery}
        logs={snapshot.logs}
        campaigns={snapshot.campaigns}
      />
    </div>
  );
}
