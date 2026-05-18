"use client";

import { AdaptiveThroughputCard } from "@/components/campaigns/adaptive-throughput-card";
import { CampaignRiskTimeline } from "@/components/campaigns/campaign-risk-timeline";
import { ReputationRiskPanel } from "@/components/campaigns/reputation-risk-panel";

type CampaignSafetySimulatorProps = {
  simulation: {
    riskLevel: string;
    safetyScore: number;
    recommendedDailyLimit: number;
    recommendedBatchSize: number;
    recommendedDelayMinSeconds: number;
    recommendedDelayMaxSeconds: number;
    estimatedCompletionTime: string | null;
    estimatedReputationImpact: string | null;
    warnings: string[];
    recommendations: string[];
    blockingReasons: string[];
    profile: {
      reputationScore: number;
      trustLevel: string;
      qualityRating: string;
    };
  };
};

export function CampaignSafetySimulator({ simulation }: CampaignSafetySimulatorProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ReputationRiskPanel
        reputationScore={simulation.profile.reputationScore}
        riskLevel={simulation.riskLevel}
        safetyScore={simulation.safetyScore}
        trustLevel={simulation.profile.trustLevel}
        qualityRating={simulation.profile.qualityRating}
      />
      <AdaptiveThroughputCard
        recommendedDailyLimit={simulation.recommendedDailyLimit}
        recommendedBatchSize={simulation.recommendedBatchSize}
        delayMinSeconds={simulation.recommendedDelayMinSeconds}
        delayMaxSeconds={simulation.recommendedDelayMaxSeconds}
        estimatedCompletionTime={simulation.estimatedCompletionTime}
      />
      <div className="xl:col-span-2">
        <CampaignRiskTimeline
          warnings={simulation.warnings}
          recommendations={simulation.recommendations}
          blockingReasons={simulation.blockingReasons}
        />
      </div>
      {simulation.estimatedReputationImpact ? (
        <div className="xl:col-span-2 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Impacto estimado na reputacao: {simulation.estimatedReputationImpact}
        </div>
      ) : null}
    </div>
  );
}
