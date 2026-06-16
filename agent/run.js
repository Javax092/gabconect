import { askModel } from "./agent.js";
import { readFile, writeFile, backupFile } from "./fs.js";
import { runTests } from "./runner.js";
import fs from "fs";

const PROJECT_ROOT = "..";

function safeRead(path) {
  const fullPath = `${PROJECT_ROOT}/${path}`;

  if (!fs.existsSync(fullPath)) {
    return null; // evita crash do agente
  }

  return readFile(fullPath);
}

async function run() {
  console.log("🧠 Iniciando agente multi-arquivo...");

  // 📦 CONTEXTO DO PROJETO (ROBUSTO)
  const context = {
    "app/page.tsx": safeRead("app/page.tsx"),
    "lib/utils.ts": safeRead("lib/utils.ts")
  };

  console.log("🧠 Chamando modelo...");

  const prompt = `
Você é um engenheiro de software senior.

Você pode modificar múltiplos arquivos.

RETORNE APENAS JSON VÁLIDO:

{
  "changes": [
    {
      "file": "caminho/relativo",
      "content": "código completo"
    }
  ],
  "runTests": true
}

REGRAS:
- Não explique nada
- Não use markdown
- Sempre retorne JSON válido
- Não remova funcionalidades críticas
- Se um arquivo não existir, crie ele do zero

CONTEXTO DO PROJETO:
${JSON.stringify(context, null, 2)}
`;

  const result = await askModel(prompt);

  let parsed;

  try {
    parsed = JSON.parse(result);
  } catch (e) {
    console.error("❌ JSON inválido do modelo");
    console.log(result);
    return;
  }

  if (!parsed?.changes?.length) {
    console.error("❌ Nenhuma mudança retornada");
    return;
  }

  console.log(`📦 Mudanças recebidas: ${parsed.changes.length}`);

  // 🛡️ BACKUP + ESCRITA SEGURA
  for (const change of parsed.changes) {
    const filePath = `${PROJECT_ROOT}/${change.file}`;

    backupFile(filePath);
  }

  // ✍️ APLICAR MUDANÇAS
  for (const change of parsed.changes) {
    const filePath = `${PROJECT_ROOT}/${change.file}`;

    writeFile(filePath, change.content);
  }

  // 🧪 TESTES (SYNCHRONOUS SAFE)
  console.log("🧪 Rodando testes...");

  const testsOk = runTests();

  if (!testsOk) {
    console.log("🔁 Testes falharam, rollback necessário");

    return;
  }

  console.log("✅ Mudanças aplicadas com sucesso!");
}

run();
