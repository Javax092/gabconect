import Link from "next/link";
import { Megaphone, Radar } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { CampaignInfrastructurePanels } from "@/components/campaigns/campaign-infrastructure-panels";
import { CampaignsManager } from "@/components/campaigns/campaigns-manager";
import { getOperationalControlSnapshot } from "@/app/admin/campaigns/actions";
import { requireUser } from "@/lib/auth";
import { getCampaignSettings } from "@/lib/campaign-settings";
import { isDemoMode } from "@/lib/demo";
import { countAudienceContacts } from "@/lib/campaign-infrastructure";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CampaignsPage({ searchParams }: PageProps) {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas"
        title="Campanhas WhatsApp oficiais"
        description="Disponivel apenas fora do modo demonstracao, com templates aprovados, publico opt-in e credenciais operacionais da Meta."
        icon={<Megaphone className="h-5 w-5" />}
      />
        <SectionCard>
          <p className="text-sm leading-7 text-slate-600">
            Saia do modo demo para cadastrar contatos com opt-in, templates oficiais e operar campanhas pela WhatsApp Business Platform.
          </p>
        </SectionCard>
      </div>
    );
  }

  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const initialPreflightCampaignId =
    typeof params.preflightCampaignId === "string" ? params.preflightCampaignId : null;
  const selectedFromContacts = Array.isArray(params.selectedContactIds)
    ? params.selectedContactIds.filter((value): value is string => typeof value === "string")
    : typeof params.selectedContactIds === "string"
      ? [params.selectedContactIds]
      : [];

  const [templates, campaigns, contacts, settings] = await Promise.all([
    prisma.whatsAppTemplate.findMany({
      where: {
        mandateId: user.mandateId,
        status: "APPROVED"
      },
      orderBy: {
        updatedAt: "desc"
      }
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
        },
        recipients: {
          select: {
            status: true
          }
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
    getCampaignSettings(user.mandateId)
  ]);
  const snapshot = await getOperationalControlSnapshot();

  const availableTags = [...new Set(contacts.flatMap((contact) => contact.tags).filter(Boolean))].sort();
  const initialEligibleCount = await countAudienceContacts(user.mandateId, {});

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campanhas"
        title="Central de campanhas WhatsApp"
        description="Crie campanhas, revise destinatários, valide a operação e acompanhe o envio supervisionado do início ao pós-start."
        icon={<Megaphone className="h-5 w-5" />}
        aside={
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-[#07111e] px-5 py-4 text-sm text-slate-300">
              Templates oficiais, audiência revisada, fila supervisionada e compliance ativo.
            </div>
            <Link
              href="/admin/campaigns/settings"
              className={buttonVariants("secondary") + " w-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"}
            >
              Regras operacionais
            </Link>
            <Link
              href="/admin/campaigns/operations"
              className={buttonVariants("primary") + " w-full gap-2"}
            >
              <Radar className="h-4 w-4" />
              Acompanhar operação
            </Link>
          </div>
        }
      />

      <CampaignInfrastructurePanels
        profile={snapshot.profile}
        metrics={snapshot.metrics}
        warmupRules={snapshot.warmupRules}
        trustRecovery={snapshot.trustRecovery}
        logs={snapshot.logs.slice(0, 6)}
        campaigns={snapshot.campaigns}
      />

      <SectionCard className="border-white/10 bg-[#07111e] shadow-[0_20px_60px_rgba(2,6,23,0.2)]">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard title="Templates aprovados" value={templates.length} />
          <InfoCard title="Operacoes registradas" value={campaigns.length} />
          <InfoCard title="Publico elegivel" value={initialEligibleCount} />
        </div>
        <div className="mt-5 grid gap-2 text-sm text-slate-400 lg:grid-cols-3">
          <p>Todo envio usa template oficial aprovado na Meta.</p>
          <p>Contatos bloqueados, inválidos ou com opt-out ficam fora da fila automaticamente.</p>
          <p>Respostas de opt-out geram descadastro imediato e proteção da operação.</p>
        </div>
      </SectionCard>

      <CampaignsManager
          initialCampaigns={campaigns.map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            templateId: campaign.templateId,
            segmentTags: campaign.segmentTags,
            audienceConfig: campaign.audienceConfig
              ? {
                  birthdayMonthDay: campaign.audienceConfig.birthdayMonthDay,
                  tags: campaign.audienceConfig.tags,
                  groups: campaign.audienceConfig.groups,
                  priorities: campaign.audienceConfig.priorities,
                  locations: campaign.audienceConfig.locations,
                  interests: campaign.audienceConfig.interests,
                  contactTypes: campaign.audienceConfig.contactTypes,
                  selectedContactIds: campaign.audienceConfig.selectedContactIds
                }
              : null,
            status: campaign.status,
            dailyLimit: campaign.dailyLimit,
            delaySeconds: campaign.delaySeconds,
            scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
            sentCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            createdAt: campaign.createdAt.toISOString(),
            updatedAt: campaign.updatedAt.toISOString(),
            template: {
              ...campaign.template
            },
            operationState: campaign.operationState
              ? {
                  pipelineStage: campaign.operationState.pipelineStage,
                  riskScore: campaign.operationState.riskScore,
                  spamProbability: campaign.operationState.spamProbability,
                  deliveryRate: campaign.operationState.deliveryRate,
                  queuePressure: campaign.operationState.queuePressure,
                  activeThroughput: campaign.operationState.activeThroughput,
                  safeThroughput: campaign.operationState.safeThroughput,
                  currentDelayMin: campaign.operationState.currentDelayMin,
                  currentDelayMax: campaign.operationState.currentDelayMax,
                  failsafeTriggered: campaign.operationState.failsafeTriggered,
                  humanReviewNeeded: campaign.operationState.humanReviewNeeded,
                  recommendedAction: campaign.operationState.recommendedAction
                }
              : null,
            safetySimulation: campaign.safetySimulations[0]
              ? {
                  riskLevel: campaign.safetySimulations[0].riskLevel,
                  safetyScore: campaign.safetySimulations[0].safetyScore,
                  recommendedDailyLimit: campaign.safetySimulations[0].recommendedDailyLimit,
                  recommendedBatchSize: campaign.safetySimulations[0].recommendedBatchSize,
                  recommendedDelayMinSeconds: campaign.safetySimulations[0].recommendedDelayMinSeconds,
                  recommendedDelayMaxSeconds: campaign.safetySimulations[0].recommendedDelayMaxSeconds,
                  requiresHumanReview: campaign.safetySimulations[0].requiresHumanReview,
                  canStartNow: campaign.safetySimulations[0].canStartNow,
                  estimatedCompletionTime: campaign.safetySimulations[0].estimatedCompletionTime,
                  estimatedReputationImpact: campaign.safetySimulations[0].estimatedReputationImpact,
                  createdAt: campaign.safetySimulations[0].createdAt.toISOString()
                }
              : null,
            stats: {
              PENDING: campaign.recipients.filter((recipient) => recipient.status === "PENDING").length,
              SENT: campaign.recipients.filter((recipient) => recipient.status === "SENT").length,
            FAILED: campaign.recipients.filter((recipient) => recipient.status === "FAILED").length,
            SKIPPED: campaign.recipients.filter((recipient) => recipient.status === "SKIPPED").length,
            UNSUBSCRIBED: campaign.recipients.filter((recipient) => recipient.status === "UNSUBSCRIBED").length,
            total: campaign.recipients.length
          }
        }))}
        templateOptions={templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          language: template.language,
          metaTemplateName: template.metaTemplateName,
          status: template.status
        }))}
          availableTags={availableTags}
          audienceOptions={snapshot.audienceOptions}
          initialEligibleCount={initialEligibleCount}
          initialPreflightCampaignId={initialPreflightCampaignId}
          initialSelectedContactIds={selectedFromContacts}
          deliveryMode={process.env.WHATSAPP_DRY_RUN === "true" ? "SIMULACAO" : "REAL"}
          initialSettings={{
            defaultDailyLimit: settings.defaultDailyLimit,
          defaultDelaySeconds: settings.defaultDelaySeconds,
          maxConsecutiveFailures: settings.maxConsecutiveFailures
        }}
      />
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </article>
  );
}
