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

// initialize OpenAI client lazily so a missing key doesn't crash the
// process at boot; the endpoint reports the config error instead.
let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

app.post("/chat", async (req, res) => {
  const api = getClient();
  if (!api) {
    return res
      .status(503)
      .json({ error: "OPENAI_API_KEY is not configured on the server" });
  }
  try {
    const { message } = req.body;

    // send user message to GPT
    const response = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Mira, a friendly AI girl who chats warmly." },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
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
