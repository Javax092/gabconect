import "../lib/load-env";

import { prisma } from "../lib/prisma";
import { getCampaignDebugReport } from "../lib/campaign-debug";

function printSection(title: string, value: unknown) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const campaignId = process.argv[2];
  const report = await getCampaignDebugReport(campaignId);

  if (!report.found) {
    printSection("Diagnostico", report);
    return;
  }

  printSection("Etapa parada", {
    stoppedAt: report.stoppedAt
  });
  printSection("Campanha", report.campaign);
  printSection("Audiencia", report.audience);
  printSection("Destinatarios", report.recipients);
  printSection("Jobs", report.jobs);
  printSection("Worker", report.worker);
  printSection("Ultimos MessageLogs", report.messageLogs);
  printSection("Ultimas tentativas", report.sendAttempts);
  printSection("Ultimos eventos", report.events);
}

main()
  .catch((error) => {
    console.error("[debug-campaign] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
