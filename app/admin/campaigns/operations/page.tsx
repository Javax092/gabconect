import { Radar } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { CampaignOperationsPanel } from "@/components/campaigns/campaign-operations-panel";
import { CampaignInfrastructurePanels } from "@/components/campaigns/campaign-infrastructure-panels";
import { getOperationalControlSnapshot } from "@/app/admin/campaigns/actions";
import { requireUser } from "@/lib/auth";
import {
  CAMPAIGN_OPERATION_FILTERS,
  getCampaignOperationsView,
  type CampaignOperationFilter
} from "@/lib/campaign-operations";
import { isDemoMode } from "@/lib/demo";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CampaignOperationsPage({ searchParams }: PageProps) {
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

  const user = await requireUser();
  const params = await searchParams;
  const campaignId = typeof params.campaignId === "string" ? params.campaignId : undefined;
  const requestedFilter = typeof params.filter === "string" ? params.filter : "all";
  const filter = (
    CAMPAIGN_OPERATION_FILTERS.includes(requestedFilter as CampaignOperationFilter)
      ? requestedFilter
      : "all"
  ) as CampaignOperationFilter;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const [snapshot, operations] = await Promise.all([
    getOperationalControlSnapshot(),
    getCampaignOperationsView({
      mandateId: user.mandateId,
      campaignId,
      filter,
      page
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacoes"
        title="Central operacional de campanhas"
        description="Acompanhe fila, processamento, timeline, simulação e envio real com leitura operacional clara por destinatário."
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

      <CampaignOperationsPanel
        campaigns={operations.campaigns}
        selectedCampaign={operations.selectedCampaign}
      />
    </div>
  );
}
