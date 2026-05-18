import { processHumanEscalationJob } from "@/lib/message-pipeline";
import { createQueueWorker, QUEUE_NAMES } from "@/lib/queue";

async function main() {
  const worker = await createQueueWorker(QUEUE_NAMES.human, processHumanEscalationJob);
  if (!worker) {
    console.info("[worker:human] fallback local ativo");
    return;
  }
  console.info("[worker:human] online");

  worker.on("error", (error) => {
    console.error("[worker:human] error", error);
  });
}

main().catch((error) => {
  console.error("[worker:human] fatal", error);
  process.exit(1);
});
