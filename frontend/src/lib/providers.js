/**
 * Providers the backend can talk to, plus a short list of model ids worth
 * suggesting. The list is only a convenience: every model field also accepts
 * any id the provider offers, because these catalogs go stale.
 */
export const PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    note: "Free tier · very fast",
    keysUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_…",
    models: [
      { id: "openai/gpt-oss-20b", note: "Free · default" },
      { id: "llama-3.3-70b-versatile" },
      { id: "llama-3.1-8b-instant", note: "Fastest" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    note: "Paid · your own billing",
    keysUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    models: [
      { id: "gpt-4o-mini", note: "Cheapest" },
      { id: "gpt-4o" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    note: "One key, many models",
    keysUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-…",
    models: [
      { id: "openrouter/auto", note: "Routes for you" },
      { id: "meta-llama/llama-3.3-70b-instruct:free" },
    ],
  },
];

export const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

/** The part of a model id worth showing in a narrow header chip. */
export function shortModelName(model) {
  if (!model) return "No model";
  const tail = String(model).split("/").pop() ?? "";
  return tail.replace(/:free$/, "") || String(model);
}

/** True when the id is not in the suggested list (a hand-typed id). */
export function isCustomModel(providerId, model) {
  return !getProvider(providerId).models.some((entry) => entry.id === model);
}

export const PERSONAS = [
  { id: "friendly", label: "Friendly", note: "Warm and conversational" },
  { id: "concise", label: "Concise", note: "Short, no filler" },
  { id: "technical", label: "Technical", note: "Precise, code-friendly" },
  { id: "creative", label: "Creative", note: "Vivid, imaginative" },
];
