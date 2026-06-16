import axios from "axios";
import fs from "fs-extra";
import path from "path";

const OLLAMA_URL = "http://localhost:11434/api/generate";

export async function askModel(prompt) {
  const res = await axios.post(OLLAMA_URL, {
    model: "qwen2.5-coder:14b",
    prompt,
    stream: false
  });

  return res.data.response;
}
