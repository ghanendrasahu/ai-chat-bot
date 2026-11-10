const API_BASE =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : "http://localhost:3001";

const ACCESS_TOKEN = import.meta.env.VITE_CHAT_TOKEN || "";

export { API_BASE };

/** An error that carries the HTTP status, so the UI can react to it. */
export class ChatError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = "ChatError";
    this.status = status;
  }
}

export async function fetchHealth(signal) {
  const response = await fetch(`${API_BASE}/health`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new ChatError(response.status, "Health check failed");
  return response.json();
}

export async function sendChat({ message, history = [], signal }) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ACCESS_TOKEN ? { "X-Access-Token": ACCESS_TOKEN } : {}),
    },
    body: JSON.stringify({ message, history }),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatError(response.status, data.error);
  }
  if (typeof data.reply !== "string" || !data.reply.trim()) {
    throw new ChatError(502, "The model returned an empty reply.");
  }
  return data.reply;
}
