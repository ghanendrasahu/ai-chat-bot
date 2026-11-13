import { PERSONAS } from "./providers.js";

/**
 * Chat storage.
 *
 * Conversations can carry variants, pinned turns and a rolling summary, which
 * outgrow localStorage quickly. They live in IndexedDB; settings and API keys
 * deliberately stay in localStorage where the rest of the app expects them.
 *
 * The module migrates the two older localStorage formats automatically, and
 * falls back to localStorage if IndexedDB is missing or blocked.
 */

const DB_NAME = "mira-chats";
const DB_VERSION = 1;
const STORE = "state";
const RECORD_KEY = "store";
const KEY = "mira.chats.v2";
const LEGACY_KEY = "mira.chat.v1";

const MAX_STORED_CHATS = 25;
const MAX_STORED_MESSAGES = 40;
const MAX_VARIANTS = 5;
const TITLE_CHARS = 60;
const MAX_SUMMARY_CHARS = 4000;
const MAX_CHAT_INSTRUCTIONS = 1000;
const MAX_MODEL_CHARS = 120;

const PERSONA_IDS = new Set(PERSONAS.map((persona) => persona.id));

/** Max length of the generated chat title (from the first user message). */
const TITLE_CHARS_FALLBACK = 60;

function titleOf(messages) {
  const first = messages.find((m) => m.role === "user")?.text?.trim() ?? "";
  if (!first) return "New chat";
  return first.length > TITLE_CHARS_FALLBACK
    ? `${first.slice(0, TITLE_CHARS_FALLBACK)}…`
    : first;
}

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

let dbPromise;
function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function readRecord(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeRecord(db, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, RECORD_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function deleteRecord(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function sanitizeVariants(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((variant) => variant && typeof variant.text === "string" && variant.text)
    .slice(-MAX_VARIANTS)
    .map((variant) => ({
      text: variant.text,
      ...(typeof variant.model === "string" && variant.model
        ? { model: variant.model.slice(0, MAX_MODEL_CHARS) }
        : {}),
      at: typeof variant.at === "number" ? variant.at : Date.now(),
    }));
}

function sanitizeMessage(message, index) {
  if (
    !message ||
    (message.role !== "user" && message.role !== "mira") ||
    typeof message.text !== "string" ||
    message.status === "error"
  ) {
    return null;
  }

  const variants = sanitizeVariants(message.variants);
  const variantIndex = Number.isFinite(message.variantIndex)
    ? Math.max(0, Math.min(variants.length - 1, Math.trunc(message.variantIndex)))
    : Math.max(0, variants.length - 1);
  const selected = variants[variantIndex];
  const text = selected?.text || message.text;
  if (!text) return null;

  return {
    id: typeof message.id === "string" && message.id ? message.id.slice(0, 80) : `restored-${index}`,
    role: message.role,
    text,
    at: typeof message.at === "number" ? message.at : Date.now(),
    ...(typeof message.model === "string" && message.model
      ? { model: message.model.slice(0, MAX_MODEL_CHARS) }
      : {}),
    status: message.status === "stopped" ? "stopped" : "sent",
    ...(message.pinned ? { pinned: true } : {}),
    ...(variants.length > 0 ? { variants, variantIndex } : {}),
  };
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map(sanitizeMessage)
    .filter(Boolean)
    .slice(-MAX_STORED_MESSAGES);
}

function sanitizeChat(chat) {
  if (!chat || typeof chat !== "object" || typeof chat.id !== "string") return null;
  const messages = sanitizeMessages(chat.messages);
  if (messages.length === 0) return null;

  const summary = typeof chat.summary === "string" ? chat.summary.slice(0, MAX_SUMMARY_CHARS) : "";
  const summaryCount = Number.isFinite(chat.summaryCount)
    ? Math.max(0, Math.min(500, Math.trunc(chat.summaryCount)))
    : 0;

  return {
    id: chat.id.slice(0, 64),
    title:
      typeof chat.title === "string" && chat.title.trim()
        ? chat.title.trim().slice(0, TITLE_CHARS)
        : titleOf(messages),
    titleAuto: chat.titleAuto !== false,
    at: typeof chat.at === "number" ? chat.at : Date.now(),
    messages,
    ...(summary ? { summary, summaryCount } : {}),
    ...(typeof chat.persona === "string" && PERSONA_IDS.has(chat.persona)
      ? { persona: chat.persona }
      : {}),
    ...(typeof chat.instructions === "string" && chat.instructions.trim()
      ? { instructions: chat.instructions.slice(0, MAX_CHAT_INSTRUCTIONS) }
      : {}),
  };
}

/** Validates a whole store, tolerating anything malformed. */
export function sanitizeStore(input, { keepEmpty = false } = {}) {
  if (!input || !Array.isArray(input.chats)) return null;
  const chats = input.chats
    .map(sanitizeChat)
    .filter(Boolean)
    .slice(0, MAX_STORED_CHATS);
  if (chats.length === 0 && !keepEmpty) return null;
  const activeId = chats.some((chat) => chat.id === input.activeId)
    ? input.activeId
    : chats[0]?.id ?? null;
  return { activeId, chats };
}

function readLocalStorage() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = sanitizeStore(JSON.parse(raw));
      if (parsed) return parsed;
    }

    // Migrate the single-conversation v1 store if present.
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const parsed = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const messages = sanitizeMessages(parsed);
    if (messages.length === 0) return null;
    const chat = {
      id: `c${Date.now().toString(36)}`,
      title: titleOf(messages),
      titleAuto: true,
      at: Date.now(),
      messages,
    };
    return { activeId: chat.id, chats: [chat] };
  } catch {
    return null;
  }
}

function writeLocalStorage(store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

function removeLocalStorage() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Loads the store. IndexedDB wins; an empty database triggers a one-time
 * migration from either localStorage format. The localStorage copy is only
 * removed after the IndexedDB write succeeds, so a failure cannot lose chats.
 */
export async function loadStore() {
  const db = await getDb();
  if (db) {
    const saved = await readRecord(db);
    if (saved) {
      const clean = sanitizeStore(saved, { keepEmpty: true });
      if (clean) return clean;
    }

    const migrated = readLocalStorage();
    if (migrated) {
      const savedOk = await writeRecord(db, migrated);
      if (savedOk) removeLocalStorage();
      return migrated;
    }
    return null;
  }

  return readLocalStorage();
}

/**
 * Persists the store. The caller debounces; this function is just the write.
 * An empty store is persisted too, otherwise deleted chats would come back.
 */
export async function saveStore(state) {
  const clean = sanitizeStore(state, { keepEmpty: true });
  if (!clean) return false;

  const db = await getDb();
  if (db) {
    const ok = await writeRecord(db, clean);
    if (ok) {
      removeLocalStorage();
      return true;
    }
  }

  return writeLocalStorage(clean);
}

export async function clearStoredChats() {
  const db = await getDb();
  if (db) await deleteRecord(db);
  removeLocalStorage();
}

export const CHAT_STORAGE_LIMITS = {
  MAX_STORED_CHATS,
  MAX_STORED_MESSAGES,
  MAX_VARIANTS,
};
