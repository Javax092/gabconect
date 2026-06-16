import { execSync } from "child_process";

export function runTests() {
  try {
    console.log("🧪 Rodando testes...");

    execSync("npm test", { stdio: "inherit" });

    console.log("✅ Testes passaram!");
    return true;
  } catch (err) {
    console.log("❌ Testes falharam!");
    return false;
  }
}
