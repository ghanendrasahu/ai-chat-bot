const KEY = "mira.chat.v1";
const MAX_STORED = 40;

/** Reads the saved thread. Failed messages are never restored. */
export function loadMessages() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "mira") &&
          typeof m.text === "string" &&
          m.status !== "error"
      )
      .slice(-MAX_STORED)
      .map((m, index) => ({
        id: m.id || `restored-${index}`,
        role: m.role,
        text: m.text,
        at: typeof m.at === "number" ? m.at : Date.now(),
        status: "sent",
      }));
  } catch {
    return [];
  }
}

export function saveMessages(messages) {
  try {
    const clean = messages.filter((m) => m.status !== "error").slice(-MAX_STORED);
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Private mode or a full quota - losing the thread is acceptable.
  }
}

export function clearStoredMessages() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
