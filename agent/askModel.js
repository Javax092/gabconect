import { selectModel } from "./router.js";
import { askOllama } from "./providers/ollama.js";
import { askCloud } from "./providers/cloud.js";

export async function askModel(prompt) {
  const route = selectModel();

  console.log("🧠 Router escolheu:", route);

  try {
    if (route.type === "local") {
      return await askOllama(route.model, prompt);
    }

    return await askCloud(prompt);
  } catch (err) {
    console.log("⚠️ fallback cloud ativado");

    return await askCloud(prompt);
  }
}
