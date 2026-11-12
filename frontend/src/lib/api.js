const API_BASE =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : "http://localhost:3001";

const ACCESS_TOKEN = import.meta.env.VITE_CHAT_TOKEN || "";

// A health check must never hang: a request that never settles would leave
// the status badge stuck on whatever it last showed. AbortSignal.timeout is
// not universal, so detect it and fall back.
const HEALTH_TIMEOUT_MS = 20_000;

function healthSignal() {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(HEALTH_TIMEOUT_MS);
  }
  return undefined;
}

export { API_BASE };

/** An error that carries the HTTP status, so the UI can react to it. */
export class ChatError extends Error {
  constructor(status, detail, code) {
    super(detail || `Request failed with status ${status}`);
    this.name = "ChatError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchPing() {
  const response = await fetch(`${API_BASE}/ping`, {
    headers: { Accept: "application/json" },
    signal: healthSignal(),
  });
  if (!response.ok) throw new ChatError(response.status, "Ping failed");
  return response.json();
}

/**
 * Sends one turn.
 *
 * Provider, model and the user's own key travel as headers so the key never
 * lands in a request log that records bodies. Memory and instructions are
 * plain content and go in the body.
 */
export async function sendChat({
  message,
  history = [],
  memory = [],
  instructions = "",
  persona = "friendly",
  provider,
  model,
  apiKey,
  signal,
}) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ACCESS_TOKEN ? { "X-Access-Token": ACCESS_TOKEN } : {}),
      ...(provider ? { "X-Provider": provider } : {}),
      ...(model ? { "X-Model": model } : {}),
      ...(apiKey ? { "X-Provider-Key": apiKey } : {}),
    },
    body: JSON.stringify({ message, history, memory, instructions, persona }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatError(response.status, data.error, data.code);
  }
  if (typeof data.reply !== "string" || !data.reply.trim()) {
    throw new ChatError(502, "The model returned an empty reply.");
  }
  return {
    reply: data.reply,
    model: typeof data.model === "string" ? data.model : model ?? null,
    provider: typeof data.provider === "string" ? data.provider : provider ?? null,
  };
}
