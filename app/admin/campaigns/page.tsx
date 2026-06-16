import Link from "next/link";
import { Megaphone, PauseCircle, Send, TrendingUp } from "lucide-react";
import { CampaignRecipientStatus, CampaignStatus, WhatsAppMessageLogStatus } from "@prisma/client";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CampaignsManager } from "@/components/campaigns/campaigns-manager";
import { requireUser } from "@/lib/auth";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

type CampaignsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CampaignStats = {
  PENDING: number;
  PROCESSING: number;
  QUEUED: number;
  SENT: number;
  FAILED: number;
  SKIPPED: number;
  UNSUBSCRIBED: number;
  CANCELLED: number;
  total: number;
};

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stringArrayParam(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : value.split(",");
}

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Campanhas"
          title="Campanhas WhatsApp"
          description="Disponivel fora do modo demonstracao, com templates aprovados, audiencia revisada e fila supervisionada."
          icon={<Megaphone className="h-5 w-5" />}
        />
      </div>
    );
  }

  const user = await requireUser();
  const params = await searchParams;
  const selectedContactIds = stringArrayParam(params.selectedContactIds).filter(Boolean);
  const preflightCampaignId = stringParam(params.preflightCampaignId) ?? null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [settings, templates, campaigns, contacts, statsRows, messagesSentToday] = await Promise.all([
    getCampaignSettings(user.mandateId),
    prisma.whatsAppTemplate.findMany({
      where: {
        mandateId: user.mandateId
      },
      select: {
        id: true,
        name: true,
        category: true,
        language: true,
        metaTemplateName: true,
        status: true
      },
      orderBy: [{ status: "asc" }, { name: "asc" }]
    }),
    prisma.campaign.findMany({
      where: {
        mandateId: user.mandateId
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            language: true,
            metaTemplateName: true,
            status: true
          }
        },
        audienceConfig: true,
        operationState: true,
        safetySimulations: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.contact.findMany({
      where: {
        mandateId: user.mandateId
      },
      select: {
        tags: true
      }
    }),
    prisma.campaignRecipient.groupBy({
      by: ["campaignId", "status"],
      _count: {
        _all: true
      }
    }),
    prisma.whatsAppMessageLog.count({
      where: {
        mandateId: user.mandateId,
        campaignId: {
          not: null
        },
        status: {
          in: [
            WhatsAppMessageLogStatus.SENT,
            WhatsAppMessageLogStatus.DELIVERED,
            WhatsAppMessageLogStatus.READ,
            WhatsAppMessageLogStatus.SIMULATED_SENT
          ]
        },
        createdAt: {
          gte: todayStart
        }
      }
    })
  ]);

  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const statsByCampaign = new Map<string, CampaignStats>();

  for (const row of statsRows) {
    if (!campaignIds.has(row.campaignId)) {
      continue;
    }

    const current = statsByCampaign.get(row.campaignId) ?? {
      PENDING: 0,
      PROCESSING: 0,
      QUEUED: 0,
      SENT: 0,
      FAILED: 0,
      SKIPPED: 0,
      UNSUBSCRIBED: 0,
      CANCELLED: 0,
      total: 0
    };

    current[row.status] = row._count._all;
    current.total += row._count._all;
    statsByCampaign.set(row.campaignId, current);
  }

  const availableTags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort();
  const initialEligibleCount = await prisma.contact.count({
    where: {
      mandateId: user.mandateId
    }
  });
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === CampaignStatus.RUNNING).length;
  const pausedCampaigns = campaigns.filter((campaign) => campaign.status === CampaignStatus.PAUSED).length;
  const sentRecipients = [...statsByCampaign.values()].reduce((total, stats) => total + stats.SENT, 0);
  const failedRecipients = [...statsByCampaign.values()].reduce((total, stats) => total + stats.FAILED, 0);
  const deliveryTotal = sentRecipients + failedRecipients;
  const deliveryRate = deliveryTotal > 0 ? Math.round((sentRecipients / deliveryTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas"
        title="Campanhas WhatsApp"
        description="Gerencie campanhas oficiais e acompanhe resultados em tempo real."
        icon={<Megaphone className="h-5 w-5" />}
        aside={
          <Link href="#nova-campanha" className={buttonVariants("primary")}>
            + Nova Campanha
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Campanhas Ativas" value={activeCampaigns} icon={<Megaphone className="h-5 w-5" />} tone="blue" />
        <MetricCard title="Mensagens Enviadas Hoje" value={messagesSentToday} icon={<Send className="h-5 w-5" />} tone="teal" />
        <MetricCard title="Taxa de Entrega" value={`${deliveryRate}%`} icon={<TrendingUp className="h-5 w-5" />} tone="slate" />
        <MetricCard title="Campanhas Pausadas" value={pausedCampaigns} icon={<PauseCircle className="h-5 w-5" />} tone="amber" />
      </div>

      <CampaignsManager
        initialCampaigns={campaigns.map((campaign) => ({
          ...campaign,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
          audience: campaign.audienceConfig
            ? [
                ...campaign.audienceConfig.tags,
                ...campaign.audienceConfig.groups,
                ...campaign.audienceConfig.priorities,
                ...campaign.audienceConfig.locations,
                ...campaign.audienceConfig.interests,
                ...campaign.audienceConfig.contactTypes
              ]
            : campaign.segmentTags,
          operationState: campaign.operationState
            ? {
                ...campaign.operationState,
                lastEvaluatedAt: campaign.operationState.lastEvaluatedAt?.toISOString() ?? null
              }
            : null,
          safetySimulation: campaign.safetySimulations[0]
            ? {
                ...campaign.safetySimulations[0],
                recommendedStartTime:
                  campaign.safetySimulations[0].recommendedStartTime?.toISOString() ?? null,
                createdAt: campaign.safetySimulations[0].createdAt.toISOString()
              }
            : null,
          stats: statsByCampaign.get(campaign.id) ?? {
            [CampaignRecipientStatus.PENDING]: 0,
            [CampaignRecipientStatus.PROCESSING]: 0,
            [CampaignRecipientStatus.QUEUED]: 0,
            [CampaignRecipientStatus.SENT]: 0,
            [CampaignRecipientStatus.FAILED]: 0,
            [CampaignRecipientStatus.SKIPPED]: 0,
            [CampaignRecipientStatus.UNSUBSCRIBED]: 0,
            [CampaignRecipientStatus.CANCELLED]: 0,
            total: 0
          }
        }))}
        templateOptions={templates}
        availableTags={availableTags}
        audienceOptions={{
          birthdayMonthDay: null,
          tags: availableTags,
          groups: [],
          priorities: [],
          locations: [],
          interests: [],
          contactTypes: [],
          selectedContactIds
        }}
        initialEligibleCount={initialEligibleCount}
        initialPreflightCampaignId={preflightCampaignId}
        initialSelectedContactIds={selectedContactIds}
        deliveryMode={process.env.WHATSAPP_DRY_RUN === "true" ? "SIMULACAO" : "REAL"}
        initialSettings={settings}
      />
    </div>
  );
}
