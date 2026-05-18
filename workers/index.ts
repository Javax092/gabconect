import { spawn } from "node:child_process";
import path from "node:path";

const workers = [
  { label: "incoming", file: "incoming-message.worker.ts" },
  { label: "outgoing", file: "outgoing-message.worker.ts" },
  { label: "human", file: "human-escalation.worker.ts" }
];

for (const worker of workers) {
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), path.join("workers", worker.file)],
    {
      stdio: "inherit"
    }
  );

  child.on("exit", (code) => {
    console.error(`[worker:${worker.label}] exited with code ${code ?? 0}`);
    process.exit(code ?? 1);
  });
}
