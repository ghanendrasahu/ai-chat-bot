import { PERSONAS, PROVIDER_IDS, PROVIDERS, getProvider } from "./providers.js";

/**
 * Everything the user can tune. Keys live in this browser only; the backend
 * receives them per request and never stores them.
 */
const STORAGE_KEY = "mira.settings.v1";

export const MAX_MEMORY_ITEMS = 40;
export const MAX_MEMORY_CHARS = 300;
export const MAX_INSTRUCTIONS_CHARS = 2000;
export const MAX_KEY_CHARS = 512;
const MAX_MODEL_CHARS = 120;

const PERSONA_IDS = PERSONAS.map((persona) => persona.id);

export function defaultModelFor(providerId) {
  return getProvider(providerId).models[0]?.id ?? "";
}

const emptyModels = () =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, defaultModelFor(id)]));

export const DEFAULT_SETTINGS = {
  provider: "groq",
  model: defaultModelFor("groq"),
  models: emptyModels(),
  keys: Object.fromEntries(PROVIDER_IDS.map((id) => [id, ""])),
  memory: [],
  instructions: "",
  persona: "friendly",
  theme: "system",
};

function asText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function cleanKey(value) {
  const key = asText(value, MAX_KEY_CHARS).trim();
  // A key is a single token. Anything with whitespace or control characters
  // would be rejected by the provider anyway, so drop it here.
  return /^[\x21-\x7E]*$/.test(key) ? key : "";
}

export function sanitizeSettings(input) {
  const raw = input && typeof input === "object" ? input : {};
  const provider = PROVIDER_IDS.includes(raw.provider)
    ? raw.provider
    : DEFAULT_SETTINGS.provider;

  // Each provider remembers the model it was last used with, so flipping
  // back and forth does not silently reset a hand-typed id.
  const models = Object.fromEntries(
    PROVIDER_IDS.map((id) => {
      const saved = asText(raw.models?.[id], MAX_MODEL_CHARS).trim();
      return [id, saved || defaultModelFor(id)];
    })
  );

  const model =
    asText(raw.model, MAX_MODEL_CHARS).trim() || models[provider] || defaultModelFor(provider);
  models[provider] = model;

  const keys = Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, cleanKey(raw.keys?.[id])])
  );

  const memory = Array.isArray(raw.memory)
    ? raw.memory
        .filter((item) => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_CHARS))
        .filter(Boolean)
        .slice(0, MAX_MEMORY_ITEMS)
    : [];

  // Dedupe case-insensitively, keeping the first spelling.
  const seen = new Set();
  const uniqueMemory = memory.filter((item) => {
    const fingerprint = item.toLowerCase();
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });

  return {
    provider,
    model,
    models,
    keys,
    memory: uniqueMemory,
    instructions: asText(raw.instructions, MAX_INSTRUCTIONS_CHARS),
    persona: PERSONA_IDS.includes(raw.persona) ? raw.persona : "friendly",
    theme: ["system", "light", "dark"].includes(raw.theme) ? raw.theme : "system",
  };
}

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitizeSettings(DEFAULT_SETTINGS);
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: settings just won't survive a reload.
  }
}

export function clearSettings() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { STORAGE_KEY as SETTINGS_STORAGE_KEY };

export function providerLabel(providerId) {
  return PROVIDERS.find((provider) => provider.id === providerId)?.label ?? providerId;
}
