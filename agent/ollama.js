import axios from "axios";

export async function askOllama(model, prompt) {
  const res = await axios.post("http://localhost:11434/api/generate", {
    model,
    prompt,
    stream: false
  });

  return res.data.response;
}
