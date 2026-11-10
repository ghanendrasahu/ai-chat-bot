import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth } from "../lib/api.js";

const POLL_MS = 60_000;

/**
 * Tracks whether the backend is actually reachable and whether a model key is
 * configured, so the status badge can tell the truth instead of always
 * claiming "Ready".
 */
export function useHealth() {
  const [state, setState] = useState({
    status: "checking",
    provider: null,
    model: null,
  });
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const info = await fetchHealth(controller.signal);
      if (controller.signal.aborted) return;
      setState({
        status: info.ready ? "online" : "degraded",
        provider: info.provider ?? null,
        model: info.model ?? null,
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((prev) => ({ ...prev, status: "offline" }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  return { ...state, refresh };
}
