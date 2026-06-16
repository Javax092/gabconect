import { getSystemProfile } from "./system.js";

export function selectModel() {
  const sys = getSystemProfile();

  const ram = Number(sys.totalRAM);

  // 🔥 Máquina fraca
  if (ram < 8) {
    return {
      type: "cloud",
      model: "gpt-4o-mini"
    };
  }

  // ⚙️ Máquina média
  if (ram >= 8 && ram < 16) {
    return {
      type: "local",
      model: "qwen2.5-coder:7b"
    };
  }

  // 💪 Máquina forte
  return {
    type: "local",
    model: "qwen2.5-coder:14b"
  };
}
