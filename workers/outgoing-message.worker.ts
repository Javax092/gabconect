import { processOutgoingMessageJob } from "@/lib/message-pipeline";
import { createQueueWorker, QUEUE_NAMES } from "@/lib/queue";

async function main() {
  const worker = await createQueueWorker(QUEUE_NAMES.outgoing, processOutgoingMessageJob);
  if (!worker) {
    console.info("[worker:outgoing] fallback local ativo");
    return;
  }
  console.info("[worker:outgoing] online");

  worker.on("error", (error) => {
    console.error("[worker:outgoing] error", error);
  });
}

main().catch((error) => {
  console.error("[worker:outgoing] fatal", error);
  process.exit(1);
});
