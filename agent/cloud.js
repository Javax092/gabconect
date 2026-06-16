import axios from "axios";

export async function askCloud(prompt) {
  const res = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: prompt }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });

  return res.data.choices[0].message.content;
}
