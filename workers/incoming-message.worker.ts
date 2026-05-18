import { processIncomingMessageJob } from "@/lib/message-pipeline";
import { createQueueWorker, QUEUE_NAMES } from "@/lib/queue";

async function main() {
  const worker = await createQueueWorker(QUEUE_NAMES.incoming, processIncomingMessageJob);
  if (!worker) {
    console.info("[worker:incoming] fallback local ativo");
    return;
  }
  console.info("[worker:incoming] online");

  worker.on("error", (error) => {
    console.error("[worker:incoming] error", error);
  });
}

main().catch((error) => {
  console.error("[worker:incoming] fatal", error);
  process.exit(1);
});
