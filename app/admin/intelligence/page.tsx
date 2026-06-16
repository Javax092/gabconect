import { BrainCircuit, Flame, MapPinned, RefreshCw, Star, Users } from "lucide-react";

import { DataTable, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/admin/data-table";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { RecalculateIntelligenceButton } from "@/components/intelligence/recalculate-intelligence-button";
import { requireUser } from "@/lib/auth";
import { calculateInfluenceScore } from "@/lib/contact-intelligence";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";
import { getRelationshipHeatmap } from "@/lib/relationship-heatmap";

function formatDate(value: Date | null) {
  if (!value) return "Sem registro";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

function levelLabel(value: string | null) {
  if (!value) return "Não informado";
  if (value === "VIP") return "VIP";
  if (value === "HIGH") return "Alta";
  if (value === "MEDIUM") return "Média";
  if (value === "LOW") return "Baixa";
  return value;
}

function levelClassName(value: string | null) {
  if (value === "VIP") return "bg-amber-100 text-amber-900";
  if (value === "HIGH") return "bg-rose-100 text-rose-900";
  if (value === "MEDIUM") return "bg-cyan-100 text-cyan-900";
  return "bg-slate-100 text-slate-700";
}

function roleLabel(value: string | null) {
  const labels: Record<string, string> = {
    CITIZEN: "Cidadão comum",
    COMMUNITY_LEADER: "Liderança comunitária",
    RELIGIOUS_LEADER: "Liderança religiosa",
    SPORTS_LEADER: "Liderança esportiva",
    STUDENT_LEADER: "Liderança estudantil",
    BUSINESS_OWNER: "Comerciante",
    PUBLIC_SERVANT: "Servidor público",
    ASSOCIATION_LEADER: "Liderança de associação",
    ACTIVE_SUPPORTER: "Apoiador ativo",
    COLD_SUPPORTER: "Apoiador frio",
    UNDECIDED: "Indeciso",
    SOCIAL_DEMAND: "Demanda social",
    INSTITUTIONAL_CONTACT: "Contato institucional"
  };

  return value ? labels[value] ?? value : "Não informado";
}

function temperatureLabel(value: string | null) {
  const labels: Record<string, string> = {
    COLD: "Fria",
    WARM: "Morna",
    HOT: "Quente",
    STRATEGIC: "Estratégica"
  };

  return value ? labels[value] ?? value : "Não informado";
}

export default async function IntelligencePage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Inteligencia"
          title="Inteligencia de Relacionamento"
          description="Disponivel apenas fora do modo demonstracao, com contatos reais do mandato."
          icon={<BrainCircuit className="h-5 w-5" />}
        />
      </div>
    );
  }

  const user = await requireUser();
  const [contacts, influentialContacts, heatmap] = await Promise.all([
    prisma.contact.findMany({
      where: { mandateId: user.mandateId },
      select: {
        id: true,
        influenceLevel: true,
        role: true,
        politicalTemperature: true,
        relationshipStatus: true,
        lastInteractionAt: true,
        tags: true,
        communityRole: true
      }
    }),
    prisma.contact.findMany({
      where: { mandateId: user.mandateId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        neighborhood: true,
        zone: true,
        role: true,
        communityRole: true,
        influenceScore: true,
        influenceLevel: true,
        influenceReason: true,
        politicalTemperature: true,
        relationshipType: true,
        nextAction: true,
        tags: true,
        lastInteractionAt: true
      }
    }),
    getRelationshipHeatmap(user.mandateId)
  ]);

  const scoredContacts = influentialContacts
    .map((contact) => {
      const calculated = calculateInfluenceScore({
        communityRole: contact.communityRole,
        role: contact.role,
        influenceLevel: contact.influenceLevel,
        politicalTemperature: contact.politicalTemperature,
        relationshipType: contact.relationshipType,
        tags: contact.tags,
        relationshipStatus: contact.politicalTemperature ?? null,
        lastInteractionAt: contact.lastInteractionAt
      });

      return {
        ...contact,
        displayScore: Math.max(contact.influenceScore, calculated.influenceScore),
        displayLevel: contact.influenceLevel ?? calculated.influenceLevel,
        displayReason: calculated.influenceReason
      };
    })
    .sort((a, b) => b.displayScore - a.displayScore || a.name.localeCompare(b.name))
    .slice(0, 25);

  const scoredSummary = contacts.map((contact) =>
    calculateInfluenceScore({
      communityRole: contact.communityRole,
      role: contact.role,
      influenceLevel: contact.influenceLevel,
      politicalTemperature: contact.politicalTemperature,
      tags: contact.tags,
      relationshipStatus: contact.politicalTemperature ?? contact.relationshipStatus,
      lastInteractionAt: contact.lastInteractionAt
    })
  );

  const totalContacts = contacts.length;
  const vipContacts = scoredSummary.filter((contact) => contact.influenceLevel === "VIP").length;
  const highInfluenceContacts = scoredSummary.filter((contact) => contact.influenceLevel === "HIGH").length;
  const criticalRegions = heatmap.filter((area) => area.heatScore >= 70).length;
  const inactiveStrategicContacts = contacts.filter(
    (contact) =>
      contact.relationshipStatus === "INACTIVE" &&
      (contact.influenceLevel === "VIP" || contact.influenceLevel === "HIGH")
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM inteligente"
        title="Inteligência de Relacionamento"
        description="Priorize lideranças, regiões e contatos estratégicos do mandato sem alterar campanhas ou fluxo de WhatsApp."
        icon={<BrainCircuit className="h-5 w-5" />}
        aside={<RecalculateIntelligenceButton />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          title="Total de contatos"
          value={totalContacts}
          tone="blue"
        />
        <MetricCard icon={<Star className="h-5 w-5" />} title="Contatos VIP" value={vipContacts} tone="amber" />
        <MetricCard icon={<Flame className="h-5 w-5" />} title="Alta influência" value={highInfluenceContacts} tone="rose" />
        <MetricCard icon={<MapPinned className="h-5 w-5" />} title="Regiões críticas" value={criticalRegions} tone="amber" />
        <MetricCard
          icon={<BrainCircuit className="h-5 w-5" />}
          title="Inativos estratégicos"
          value={inactiveStrategicContacts}
          tone="teal"
        />
      </div>

      <SectionCard
        title="Ranking de contatos influentes"
        description="Ordenado por score político calculado a partir de influência, papel, temperatura e interação recente."
      >
        <DataTable minWidth="1160px">
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>Nome</DataTableHeader>
              <DataTableHeader>Telefone</DataTableHeader>
              <DataTableHeader>Bairro</DataTableHeader>
              <DataTableHeader>Zona</DataTableHeader>
              <DataTableHeader>Papel</DataTableHeader>
              <DataTableHeader>Temperatura</DataTableHeader>
              <DataTableHeader>Score</DataTableHeader>
              <DataTableHeader>Nível</DataTableHeader>
              <DataTableHeader>Motivo</DataTableHeader>
              <DataTableHeader>Última interação</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <tbody>
              {scoredContacts.length === 0 ? (
                <DataTableRow>
                  <DataTableCell className="py-8 text-center" colSpan={10}>
                    Nenhum contato encontrado para este mandato ainda.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                scoredContacts.map((contact) => (
                  <DataTableRow key={contact.id}>
                    <DataTableCell className="font-medium text-slate-950">{contact.name}</DataTableCell>
                    <DataTableCell>{contact.phone}</DataTableCell>
                    <DataTableCell>{contact.neighborhood ?? "Não informado"}</DataTableCell>
                    <DataTableCell>{contact.zone ?? "Não informado"}</DataTableCell>
                    <DataTableCell>{roleLabel(contact.role ?? contact.communityRole)}</DataTableCell>
                    <DataTableCell>{temperatureLabel(contact.politicalTemperature)}</DataTableCell>
                    <DataTableCell className="font-semibold text-slate-950">{contact.displayScore}</DataTableCell>
                    <DataTableCell>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${levelClassName(contact.displayLevel)}`}>
                        {levelLabel(contact.displayLevel)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="max-w-[280px]">{contact.displayReason ?? contact.influenceReason ?? "Sem motivo calculado"}</DataTableCell>
                    <DataTableCell>{formatDate(contact.lastInteractionAt)}</DataTableCell>
                  </DataTableRow>
                ))
              )}
          </tbody>
        </DataTable>
      </SectionCard>

      <SectionCard
        title="Mapa de calor de relacionamento"
        description="MVP por bairro e zona, ordenado por prioridade de atenção."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {heatmap.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma região com contatos cadastrados.
            </div>
          ) : (
            heatmap.map((area) => (
              <article key={`${area.neighborhood}-${area.zone}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950">{area.neighborhood}</h3>
                    <p className="mt-1 text-sm text-slate-500">{area.zone}</p>
                  </div>
                  <div className="rounded-2xl bg-brand-950 px-4 py-2 text-center text-white">
                    <p className="text-[11px] uppercase text-slate-300">Prioridade</p>
                    <p className="text-xl font-semibold">{area.heatScore}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                  <HeatMetric label="Contatos" value={area.totalContacts} />
                  <HeatMetric label="VIPs" value={area.vipContacts} />
                  <HeatMetric label="Lideranças" value={area.leaderContacts} />
                  <HeatMetric label="Demandas" value={area.socialDemandContacts} />
                  <HeatMetric label="Sem interação" value={area.staleContacts} />
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{area.heatReason}</p>
              </article>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="O que fazer agora?" description="Recomendações simples a partir do ranking e das regiões críticas.">
        <div className="grid gap-4 lg:grid-cols-3">
          <ActionCard
            icon={<Star className="h-5 w-5" />}
            title="Ative os VIPs inativos"
            description={`${inactiveStrategicContacts} contato(s) estratégico(s) precisam de retomada de relacionamento.`}
          />
          <ActionCard
            icon={<MapPinned className="h-5 w-5" />}
            title="Visite regiões críticas"
            description={`${criticalRegions} região(ões) têm calor alto para atenção territorial.`}
          />
          <ActionCard
            icon={<RefreshCw className="h-5 w-5" />}
            title="Mantenha o score atualizado"
            description="Recalcule após importar contatos, registrar papéis comunitários ou novas interações."
          />
        </div>
      </SectionCard>
    </div>
  );
}

function HeatMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ActionCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3 text-brand-700">
        {icon}
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
