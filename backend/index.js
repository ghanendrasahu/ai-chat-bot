import "dotenv/config";
import crypto from "node:crypto";
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

const ACCESS_TOKEN = (process.env.CHAT_ACCESS_TOKEN || "").trim();
const MAX_MESSAGE_CHARS = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = Number(process.env.CHAT_RATE_LIMIT || 15);
const RATE_MAX_PER_DAY = Number(process.env.CHAT_DAILY_LIMIT || 400);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
// Baseline security headers; the SPA is same-origin so framing stays denied.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
// Same-origin is always allowed (the built SPA). Cross-origin is an explicit
// opt-in list instead of the previous allow-all default.
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
    },
  })
);
app.use(express.json({ limit: "16kb" }));

// Small in-memory limiter: per-IP burst + daily cap so a public demo cannot
// be used to drain the owner's LLM key.
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) ?? {
    windowStart: now,
    windowCount: 0,
    dayStart: now,
    dayCount: 0,
  };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.windowStart = now;
    entry.windowCount = 0;
  }
  if (now - entry.dayStart > 86_400_000) {
    entry.dayStart = now;
    entry.dayCount = 0;
  }
  entry.windowCount += 1;
  entry.dayCount += 1;
  hits.set(ip, entry);

  if (hits.size > 5000) {
    for (const [key, value] of hits) {
      if (now - value.dayStart > 86_400_000) hits.delete(key);
    }
  }
  return entry.windowCount > RATE_MAX_PER_WINDOW || entry.dayCount > RATE_MAX_PER_DAY;
}

function isAuthorized(req) {
  if (!ACCESS_TOKEN) return true;
  const provided = (req.get("x-access-token") || "").trim();
  return (
    provided.length === ACCESS_TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(ACCESS_TOKEN))
  );
}

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
      timeout: 30_000,
      maxRetries: 1,
    });
  }
  return client;
}

function getModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return process.env.GROQ_API_KEY ? "openai/gpt-oss-20b" : "gpt-4o-mini";
}

app.post("/chat", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Too many messages. Please wait a moment." });
  }

  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({
      error: `Message is too long (limit ${MAX_MESSAGE_CHARS} characters)`,
    });
  }

  const api = getClient();
  if (!api) {
    return res
      .status(503)
      .json({ error: "No LLM key is configured on the server" });
  }

  try {
    const response = await api.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: "You are Mira, a friendly AI girl who chats warmly." },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0]?.message?.content;
    if (!reply) throw new Error("empty completion");
    res.json({ reply });
  } catch (err) {
    // Log the provider detail, never return it to the browser.
    console.error("chat completion failed:", err);
    res
      .status(502)
      .json({ error: "The AI service is unavailable right now. Please try again." });
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
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  app.listen(port, "0.0.0.0", () =>
    console.log(`✅ Backend running on http://localhost:${port}`)
  );
}

export default app;
