// Standalone mock of the Mira backend for the UI test suites.
// Listens on 127.0.0.1 only - never exposed on the network.
import http from "node:http";

const REPLY = `Here's a short answer. **Large language models** predict the next token:

1. Training - the model learns the statistics of text
2. Prompting - your message is the context
3. Inference - it samples the next token and repeats

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Models are great at patterns and bad at knowing what they don't know.`;

const CODE_REPLY = "Here you go:\n\n```js\nexport const add = (a, b) => a + b;\n```";
const PORT = Number(process.env.PORT || 3001);
const HOST = "127.0.0.1";

/** Every /chat or /chat/stream request, so a test can assert what went out. */
const requests = [];

/** The newest chat turn only - title/summary calls are recorded separately. */
let lastChat = null;

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Streams a reply as SSE. The route closes cleanly on client abort. */
function streamReply(req, res, { reply, model, provider, message }) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  if (message.includes("drop")) {
    // Send a partial answer, then break the connection: the UI should keep
    // the text and offer a retry.
    const partial = reply.slice(0, 28);
    writeEvent(res, "token", { t: partial });
    setTimeout(() => res.destroy(), 120);
    return;
  }

  const slow = message.includes("slow");
  const size = slow ? 4 : 7;
  const delay = slow ? 90 : 12;
  const chunks = [];
  for (let index = 0; index < reply.length; index += size) {
    chunks.push(reply.slice(index, index + size));
  }

  let position = 0;
  const timer = setInterval(() => {
    if (position >= chunks.length) {
      clearInterval(timer);
      if (res.writableEnded || res.destroyed) return;
      writeEvent(res, "done", { reply, model, provider });
      res.end();
      return;
    }
    writeEvent(res, "token", { t: chunks[position] });
    position += 1;
  }, delay);

  req.on("close", () => clearInterval(timer));
  res.on("close", () => clearInterval(timer));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Access-Token, X-Provider, X-Model, X-Provider-Key, Accept"
  );
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/ping")) {
    res.end(
      JSON.stringify({
        status: "ok",
        ready: true,
        provider: "groq",
        model: "openai/gpt-oss-20b",
        providers: { groq: true, openai: false, openrouter: false },
      })
    );
    return;
  }

  // Test-only introspection. Never part of the real backend.
  if (req.method === "GET" && req.url === "/test/last") {
    res.end(JSON.stringify(lastChat ?? {}));
    return;
  }
  if (req.method === "GET" && req.url === "/test/requests") {
    res.end(JSON.stringify(requests));
    return;
  }
  if (req.method === "POST" && req.url === "/test/reset") {
    requests.length = 0;
    lastChat = null;
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && (req.url === "/chat" || req.url === "/chat/stream")) {
    const payload = await readBody(req);
    const entry = { path: req.url, headers: req.headers, body: payload };
    requests.push(entry);
    lastChat = entry;

    const model = req.headers["x-model"] || "openai/gpt-oss-20b";
    const provider = req.headers["x-provider"] || "groq";
    const reply = payload.message?.includes("code") ? CODE_REPLY : REPLY;

    if (req.url === "/chat/stream") {
      streamReply(req, res, { reply, model, provider, message: payload.message ?? "" });
      return;
    }

    res.end(JSON.stringify({ reply, model, provider, summary: "", summaryCount: 0 }));
    return;
  }

  if (req.method === "POST" && req.url === "/title") {
    const payload = await readBody(req);
    requests.push({ path: req.url, headers: req.headers, body: payload });
    const message = String(payload.message ?? "").trim();
    const title = message.toLowerCase().includes("deploy")
      ? "Deploying the app"
      : message.split(/\s+/).slice(0, 4).join(" ") || "New chat";
    res.end(JSON.stringify({ title }));
    return;
  }

  if (req.method === "POST" && req.url === "/summary") {
    const payload = await readBody(req);
    requests.push({ path: req.url, headers: req.headers, body: payload });
    res.end(
      JSON.stringify({
        summary: "Earlier the user asked about deployments and chose Node streams.",
      })
    );
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, HOST, () =>
  console.log(`test mock backend on http://${HOST}:${PORT}`)
);
