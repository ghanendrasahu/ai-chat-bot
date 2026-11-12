import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  MAX_MEMORY_CHARS,
  MAX_MEMORY_ITEMS,
  SETTINGS_STORAGE_KEY,
  defaultModelFor,
  loadSettings,
  saveSettings,
  sanitizeSettings,
} from "../lib/settings.js";

function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Persistent user settings: provider, model, per-provider keys, the one
 * shared memory, custom instructions, persona and theme.
 *
 * Keys never leave the browser except as a per-request header to this app's
 * own backend, which forwards them to the provider and forgets them.
 */
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Another tab changing settings should be reflected here too.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key && event.key !== SETTINGS_STORAGE_KEY) return;
      setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // "System" follows the OS live, not just at boot.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return undefined;
    const onChange = (event) => setSystem(event.matches ? "light" : "dark");
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const theme = settings.theme === "system" ? system : settings.theme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#e9edf2" : "#080a0e");
  }, [theme]);

  const update = useCallback((patch) => {
    setSettings((prev) => sanitizeSettings({ ...prev, ...patch }));
  }, []);

  const setProvider = useCallback((provider) => {
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        provider,
        // Restore whatever model this provider was last used with.
        model: prev.models?.[provider] || defaultModelFor(provider),
      })
    );
  }, []);

  const setModel = useCallback((model) => {
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        model,
        models: { ...prev.models, [prev.provider]: model },
      })
    );
  }, []);

  const setKey = useCallback((provider, value) => {
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        keys: { ...prev.keys, [provider]: value },
      })
    );
  }, []);

  const addMemory = useCallback(
    (raw) => {
      const text = String(raw ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_MEMORY_CHARS);
      if (!text) return false;
      if (settings.memory.length >= MAX_MEMORY_ITEMS) return false;
      if (settings.memory.some((item) => item.toLowerCase() === text.toLowerCase())) {
        return false;
      }
      setSettings((prev) => sanitizeSettings({ ...prev, memory: [...prev.memory, text] }));
      return true;
    },
    [settings.memory]
  );

  const removeMemory = useCallback((index) => {
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        memory: prev.memory.filter((_, position) => position !== index),
      })
    );
  }, []);

  const clearMemory = useCallback(() => {
    setSettings((prev) => sanitizeSettings({ ...prev, memory: [] }));
  }, []);

  const clearKeys = useCallback(() => {
    setSettings((prev) =>
      sanitizeSettings({
        ...prev,
        keys: Object.fromEntries(Object.keys(prev.keys).map((id) => [id, ""])),
      })
    );
  }, []);

  const resetAll = useCallback(() => {
    setSettings(sanitizeSettings({}));
  }, []);

  const apiKey = settings.keys[settings.provider] ?? "";

  /** What a chat request needs to carry. */
  const requestConfig = useMemo(
    () => ({
      provider: settings.provider,
      model: settings.model,
      apiKey,
      memory: settings.memory,
      instructions: settings.instructions,
      persona: settings.persona,
    }),
    [
      settings.provider,
      settings.model,
      apiKey,
      settings.memory,
      settings.instructions,
      settings.persona,
    ]
  );

  return {
    settings,
    theme,
    apiKey,
    requestConfig,
    update,
    setProvider,
    setModel,
    setKey,
    addMemory,
    removeMemory,
    clearMemory,
    clearKeys,
    resetAll,
  };
}
