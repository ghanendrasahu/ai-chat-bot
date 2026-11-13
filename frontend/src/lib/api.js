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

/** Provider, model and the user's own key always travel as headers. */
function requestHeaders({ provider, model, apiKey }) {
  return {
    "Content-Type": "application/json",
    ...(ACCESS_TOKEN ? { "X-Access-Token": ACCESS_TOKEN } : {}),
    ...(provider ? { "X-Provider": provider } : {}),
    ...(model ? { "X-Model": model } : {}),
    ...(apiKey ? { "X-Provider-Key": apiKey } : {}),
  };
}

function turnPayload({
  message,
  history = [],
  pinned = [],
  memory = [],
  instructions = "",
  chatInstructions = "",
  persona = "friendly",
  summary = "",
  summaryCount = 0,
}) {
  return {
    message,
    history,
    pinned,
    memory,
    instructions,
    chatInstructions,
    persona,
    summary,
    summaryCount,
  };
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
 * Sends one turn without streaming. Kept as the fallback when a stream cannot
 * start, and as the shape the rest of the UI expects.
 */
export async function sendChat({
  message,
  history = [],
  pinned = [],
  memory = [],
  instructions = "",
  chatInstructions = "",
  persona = "friendly",
  summary = "",
  summaryCount = 0,
  provider,
  model,
  apiKey,
  signal,
}) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: requestHeaders({ provider, model, apiKey }),
    body: JSON.stringify(
      turnPayload({
        message,
        history,
        pinned,
        memory,
        instructions,
        chatInstructions,
        persona,
        summary,
        summaryCount,
      })
    ),
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
    summary: typeof data.summary === "string" ? data.summary : "",
    summaryCount: Number.isFinite(data.summaryCount) ? data.summaryCount : 0,
  };
}

/** Parses one `event:`/`data:` block from the SSE stream. */
function parseEvent(raw) {
  let event = "message";
  const data = [];

  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

async function readChatStream(options, onFirstToken) {
  const { message, history, pinned, memory, instructions, chatInstructions, persona,
    summary, summaryCount, provider, model, apiKey, signal, onToken } = options;

  let response;
  try {
    response = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: {
        ...requestHeaders({ provider, model, apiKey }),
        Accept: "text/event-stream",
      },
      body: JSON.stringify(
        turnPayload({
          message,
          history,
          pinned,
          memory,
          instructions,
          chatInstructions,
          persona,
          summary,
          summaryCount,
        })
      ),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    // The stream endpoint could not be reached at all. Retrying the plain
    // endpoint is safe: nothing was generated yet.
    const failure = new ChatError(0, "Could not open the reply stream.");
    failure.fallback = true;
    throw failure;
  }

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !response.body || !type.includes("text/event-stream")) {
    const data = await response.json().catch(() => ({}));
    const failure = new ChatError(
      response.status || 502,
      data.error,
      data.code
    );
    // A backend without the stream route is the one case worth retrying.
    failure.fallback = response.status === 404 || response.status === 405;
    throw failure;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let done = null;
  let streamError = null;

  try {
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let index;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = parseEvent(raw);
        if (!event) continue;

        if (event.event === "token") {
          const token = typeof event.data?.t === "string" ? event.data.t : "";
          if (!token) continue;
          if (!reply) onFirstToken();
          reply += token;
          onToken?.(reply);
        } else if (event.event === "done") {
          done = event.data ?? {};
          if (typeof done.reply === "string" && done.reply) reply = done.reply;
        } else if (event.event === "error") {
          streamError = new ChatError(
            502,
            event.data?.error || "The reply stopped before it finished.",
            event.data?.code
          );
        }
      }

      if (streamError) break;
      if (done) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (streamError) throw streamError;
  if (!done) {
    throw new ChatError(502, "Connection lost before the reply finished.", "stream_incomplete");
  }
  if (!reply.trim()) {
    throw new ChatError(502, "The model returned an empty reply.");
  }

  return {
    reply,
    model: typeof done.model === "string" ? done.model : model ?? null,
    provider: typeof done.provider === "string" ? done.provider : provider ?? null,
    summary: typeof done.summary === "string" ? done.summary : "",
    summaryCount: Number.isFinite(done.summaryCount) ? done.summaryCount : 0,
  };
}

/**
 * Streams one reply. If the route cannot be reached, falls back to the plain
 * JSON endpoint once - but only before any token arrived, so a partial reply
 * is never duplicated.
 */
export async function streamChat(options) {
  let received = false;
  try {
    return await readChatStream(options, () => {
      received = true;
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (!received && error.fallback) return sendChat(options);
    throw error;
  }
}

/** One cheap call for a short chat title. Never throws into the UI. */
export async function generateTitle({ message, provider, model, apiKey, signal }) {
  const response = await fetch(`${API_BASE}/title`, {
    method: "POST",
    headers: requestHeaders({ provider, model, apiKey }),
    body: JSON.stringify({ message }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatError(response.status, data.error, data.code);
  }
  return typeof data.title === "string" ? data.title : "";
}

/** Folds turns into the cached summary. Failures are handled by the caller. */
export async function summarizeConversation({
  previous = "",
  messages = [],
  provider,
  model,
  apiKey,
  signal,
}) {
  const response = await fetch(`${API_BASE}/summary`, {
    method: "POST",
    headers: requestHeaders({ provider, model, apiKey }),
    body: JSON.stringify({ previous, messages }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatError(response.status, data.error, data.code);
  }
  return typeof data.summary === "string" ? data.summary : "";
}
