const KEY = "mira.chats.v2";
const LEGACY_KEY = "mira.chat.v1";
const MAX_STORED_CHATS = 25;
const MAX_STORED_MESSAGES = 40;

/** Max length of the generated chat title (from the first user message). */
const TITLE_CHARS = 60;

function titleOf(messages) {
  const first = messages.find((m) => m.role === "user")?.text?.trim() ?? "";
  if (!first) return "New chat";
  return first.length > TITLE_CHARS ? `${first.slice(0, TITLE_CHARS)}…` : first;
}

/** Parses the v2 store, tolerating anything malformed. */
export function loadStore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // Migrate the single-conversation v1 store if present.
      const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
      if (!legacyRaw) return null;
      const parsed = JSON.parse(legacyRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const messages = sanitizeMessages(parsed);
      if (messages.length === 0) return null;
      const chat = { id: `c${Date.now().toString(36)}`, title: titleOf(messages), at: Date.now(), messages };
      return { activeId: chat.id, chats: [chat] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.chats)) return null;
    const chats = parsed.chats
      .filter((c) => c && typeof c === "object" && typeof c.id === "string")
      .slice(0, MAX_STORED_CHATS)
      .map((c) => ({
        id: c.id.slice(0, 64),
        title: typeof c.title === "string" ? c.title.slice(0, TITLE_CHARS + 1) : "Chat",
        at: typeof c.at === "number" ? c.at : Date.now(),
        messages: sanitizeMessages(c.messages),
      }))
      .filter((c) => c.messages.length > 0);
    if (chats.length === 0) return null;
    const activeId = chats.some((c) => c.id === parsed.activeId) ? parsed.activeId : chats[0].id;
    return { activeId, chats };
  } catch {
    return null;
  }
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "mira") &&
        typeof m.text === "string" &&
        m.status !== "error"
    )
    .slice(-MAX_STORED_MESSAGES)
    .map((m, index) => ({
      id: m.id || `restored-${index}`,
      role: m.role,
      text: m.text,
      at: typeof m.at === "number" ? m.at : Date.now(),
      // Which model wrote a reply, when it is known.
      ...(typeof m.model === "string" && m.model
        ? { model: m.model.slice(0, 120) }
        : {}),
      status: "sent",
    }));
}

export function saveStore({ activeId, chats }) {
  try {
    const clean = {
      activeId,
      chats: chats
        .slice(0, MAX_STORED_CHATS)
        .map((c) => ({
          id: c.id,
          title: c.title,
          at: c.at,
          messages: c.messages.filter((m) => m.status !== "error").slice(-MAX_STORED_MESSAGES),
        }))
        .filter((c) => c.messages.length > 0),
    };
    window.localStorage.setItem(KEY, JSON.stringify(clean));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Private mode or a full quota - losing the thread is acceptable.
  }
}

export function clearStoredChats() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}
