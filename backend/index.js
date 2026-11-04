import "dotenv/config";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// When the React app is built (frontend/dist), the backend serves it so the
// whole project deploys as a single web service.
const distDir = path.join(__dirname, "..", "frontend", "dist");
const hasBuiltFrontend = existsSync(path.join(distDir, "index.html"));

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Prefer Groq's free OpenAI-compatible endpoint when configured; fall back
// to OpenAI. The client is created lazily so a missing key doesn't crash the
// process at boot - the endpoint reports the config error instead.
let client = null;
function getClient() {
  const groqKey = process.env.GROQ_API_KEY;
  const apiKey = groqKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: groqKey ? "https://api.groq.com/openai/v1" : undefined,
    });
  }
  return client;
}

function getModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return process.env.GROQ_API_KEY ? "openai/gpt-oss-20b" : "gpt-4o-mini";
}

app.post("/chat", async (req, res) => {
  const api = getClient();
  if (!api) {
    return res
      .status(503)
      .json({ error: "No LLM key is configured on the server" });
  }
  try {
    const { message } = req.body;

    const response = await api.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: "You are Mira, a friendly AI girl who chats warmly." },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error(err);
    const detail =
      err && typeof err.message === "string" && err.message.length < 200
        ? err.message
        : "The AI provider rejected the request";
    res.status(502).json({ error: detail });
  }
});

// Serve the built React frontend when present (single-service deployment).
if (hasBuiltFrontend) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/chat")) {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
}

const port = process.env.PORT || 3001;
app.listen(port, "0.0.0.0", () =>
  console.log(`✅ Backend running on http://localhost:${port}`)
);
