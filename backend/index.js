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
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 8000;
// The body has to carry the current message plus the history we are willing
// to read: 11 messages of 2,000 characters, worst case with JSON escaping.
const MAX_BODY_SIZE = "256kb";
const SYSTEM_PROMPT =
  "You are Mira, a friendly AI girl who chats warmly. Keep replies short and useful.";
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = Number(process.env.CHAT_RATE_LIMIT || 15);
const RATE_MAX_PER_DAY = Number(process.env.CHAT_DAILY_LIMIT || 400);
// A ceiling for the whole service, independent of any client address. The
// per-IP limits are only as trustworthy as the IP they key on, so this is
// what actually bounds the damage if that identity is spoofed.
const GLOBAL_MAX_PER_WINDOW = Number(process.env.CHAT_GLOBAL_LIMIT || 120);
const GLOBAL_MAX_PER_DAY = Number(process.env.CHAT_GLOBAL_DAILY_LIMIT || 1500);
// Upper bound on the number of IPs the limiter remembers.
const MAX_TRACKED_IPS = 10_000;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// How many proxy hops to trust when reading X-Forwarded-For. 1 is right for
// Render; use 0 when the app is exposed directly, otherwise a client can
// spoof the header and get a fresh rate-limit bucket per request.
const TRUST_PROXY = Number.parseInt(process.env.TRUST_PROXY ?? "1", 10);

const app = express();
app.disable("x-powered-by");
app.set(
  "trust proxy",
  Number.isFinite(TRUST_PROXY) && TRUST_PROXY >= 0 ? TRUST_PROXY : 1
);

// Baseline security headers; the SPA is same-origin so framing stays denied.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

/**
 * A request may come from the app itself, from an explicitly allowed origin,
 * or from something that is not a browser at all.
 *
 * The app's own origin has to be allowed: browsers send an Origin header on
 * module script fetches and on every POST, so a check that only looked at
 * CORS_ORIGIN would refuse the site's own requests.
 */
function originAllowed(req, origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  const proto = (req.get("x-forwarded-proto") || req.protocol)
    .split(",")[0]
    .trim();
  const host = (req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    .trim();
  return Boolean(host) && origin === `${proto}://${host}`;
}

// Same-origin is always allowed (the built SPA). Cross-origin is an explicit
// opt-in list instead of the previous allow-all default.
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
    },
  })
);
// CORS only stops a browser from *reading* a cross-origin response - it does
// not stop the request from reaching the handler. Refuse foreign origins on
// the API so a page on another site cannot spend the owner's LLM key. Static
// files cost nothing, so they are left alone.
app.use(["/chat", "/api"], (req, res, next) => {
  if (!originAllowed(req, req.get("origin"))) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  next();
});

app.use(express.json({ limit: MAX_BODY_SIZE }));


// Small in-memory limiter: per-IP burst + daily cap so a public demo cannot
// be used to drain the owner's LLM key.
const hits = new Map();

// Service-wide counters. These do not depend on any client-supplied address.
let globalWindowStart = Date.now();
let globalWindowCount = 0;
let globalDayStart = Date.now();
let globalDayCount = 0;

function isGloballyLimited() {
  const now = Date.now();
  if (now - globalWindowStart > RATE_WINDOW_MS) {
    globalWindowStart = now;
    globalWindowCount = 0;
  }
  if (now - globalDayStart > 86_400_000) {
    globalDayStart = now;
    globalDayCount = 0;
  }
  globalWindowCount += 1;
  globalDayCount += 1;
  return (
    globalWindowCount > GLOBAL_MAX_PER_WINDOW || globalDayCount > GLOBAL_MAX_PER_DAY
  );
}

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

  // Re-insert so the map is ordered by last use, then drop the oldest
  // entries. Without a hard cap the map grows with every new IP.
  hits.delete(ip);
  hits.set(ip, entry);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, value] of hits) {
      if (now - value.dayStart > 86_400_000) hits.delete(key);
    }
    while (hits.size > MAX_TRACKED_IPS) {
      hits.delete(hits.keys().next().value);
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

const healthHandler = (req, res) => {
  // A cached health answer could tell the platform the app is ready when it
  // is not, so this one is never stored.
  res.setHeader("Cache-Control", "no-store");
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const hasKey = Boolean(groqKey || openaiKey);
  res.json({
    status: "ok",
    ready: hasKey,
    provider: groqKey ? "groq" : openaiKey ? "openai" : null,
    model: hasKey ? getModel() : null,
  });
};

// /health is the classic health endpoint, and it is on every ad blocker's
// list - so the browser's probe lives on /ping, where nothing filters.
app.get("/health", healthHandler);
app.get("/ping", healthHandler);

// Prefer Groq's free OpenAI-compatible endpoint when configured; fall back
// to OpenAI. The client is created lazily so a missing key doesn't crash the
// process at boot - the endpoint reports the config error instead.
let client = null;
let clientSignature = "";
function getClient() {
  const groqKey = process.env.GROQ_API_KEY;
  const apiKey = groqKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseURL = groqKey ? "https://api.groq.com/openai/v1" : undefined;
  const signature = `${baseURL ?? ""}::${apiKey}`;
  if (!client || signature !== clientSignature) {
    client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 30_000,
      maxRetries: 1,
    });
    clientSignature = signature;
  }
  return client;
}

function getModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  return process.env.GROQ_API_KEY ? "openai/gpt-oss-20b" : "gpt-4o-mini";
}

/**
 * Keeps the recent turns of the conversation so Mira can answer with the
 * thread in mind. Only known roles and plain text survive, and the total
 * size is capped so a long thread cannot blow up the request.
 */
function sanitizeHistory(input) {
  if (!Array.isArray(input)) return [];
  const clean = [];
  let budget = MAX_HISTORY_CHARS;

  for (let i = input.length - 1; i >= 0; i -= 1) {
    if (clean.length >= MAX_HISTORY_MESSAGES) break;
    const item = input[i];
    if (!item || typeof item !== "object") continue;

    const role =
      item.role === "user"
        ? "user"
        : item.role === "assistant"
          ? "assistant"
          : null;
    if (!role) continue;

    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) continue;

    const clipped = content.slice(0, MAX_MESSAGE_CHARS);
    if (budget - clipped.length < 0) break;
    budget -= clipped.length;
    clean.unshift({ role, content: clipped });
  }

  return clean;
}

app.post("/chat", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res
      .set("Retry-After", String(Math.ceil(RATE_WINDOW_MS / 1000)))
      .status(429)
      .json({ error: "Too many messages. Please wait a moment." });
  }
  // The service-wide ceiling, checked against the clock rather than against
  // anything the client controls.
  if (isGloballyLimited()) {
    return res
      .set("Retry-After", String(Math.ceil(RATE_WINDOW_MS / 1000)))
      .status(429)
      .json({ error: "The chat is busy right now. Please wait a moment." });
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

  const history = sanitizeHistory(req.body?.history);

  try {
    const response = await api.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0]?.message?.content;
    if (!reply) throw new Error("empty completion");
    res.json({ reply });
  } catch (err) {
    // Log the provider detail, never return it to the browser. Only the
    // status and message are logged - the SDK error object can carry
    // request metadata that has no business in the logs.
    console.error("chat completion failed:", {
      status: err?.status ?? null,
      message: err?.message ?? String(err),
    });
    res
      .status(502)
      .json({ error: "The AI service is unavailable right now. Please try again." });
  }
});

// Serve the built React frontend when present (single-service deployment).
if (hasBuiltFrontend) {
  const shell = path.join(distDir, "index.html");

  // The shell is the pointer to the hashed assets, so a cached copy means
  // running old code. It is tiny - never store it.
  app.get("/", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(shell);
  });

  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        // The file name carries the content hash, so it can be cached hard.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
}

// Unknown routes answer in JSON for the API and with the SPA shell for
// anything that looks like a page. A missing asset is a 404, not the app.
app.use((req, res) => {
  const looksLikeApi =
    req.path.startsWith("/api") ||
    req.path.startsWith("/chat") ||
    req.path.startsWith("/health");

  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !looksLikeApi &&
    !path.extname(req.path) &&
    hasBuiltFrontend
  ) {
    res.set("Cache-Control", "no-store");
    return res.sendFile(path.join(distDir, "index.html"));
  }
  res.status(404).json({ error: "Not found" });
});

// Last resort: every failure answers in JSON, never an HTML error page.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }
  console.error("unhandled request error:", err?.message ?? err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const port = process.env.PORT || 3001;
// Render (and any container host) needs 0.0.0.0. Local verification can set
// HOST=127.0.0.1 so nothing is reachable from the network.
const host = process.env.HOST || "0.0.0.0";
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  app.listen(port, host, () =>
    console.log(`✅ Backend running on http://localhost:${port}`)
  );
}

export { app, sanitizeHistory };
export default app;
