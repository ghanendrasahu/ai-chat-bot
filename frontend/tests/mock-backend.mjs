// Standalone mock of the Mira backend for the mobile test suite.
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
const PORT = Number(process.env.PORT || 3001);
const HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Access-Token");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === "GET" && (req.url === "/health" || req.url === "/ping")) {
    res.end(
      JSON.stringify({ status: "ok", ready: true, provider: "groq", model: "openai/gpt-oss-20b" })
    );
    return;
  }
  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const reply = payload.message?.includes("code")
        ? "Here you go:\n\n```js\nexport const add = (a, b) => a + b;\n```"
        : REPLY;
      res.end(JSON.stringify({ reply }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, HOST, () =>
  console.log(`test mock backend on http://${HOST}:${PORT}`)
);
