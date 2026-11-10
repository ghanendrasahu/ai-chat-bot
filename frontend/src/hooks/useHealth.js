import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth } from "../lib/api.js";

const HEALTHY_INTERVAL_MS = 30_000;
// A failed check is retried in seconds, not in a minute - one blip should
// not leave the badge lying for a whole poll cycle.
const RETRY_INTERVAL_MS = 4_000;

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
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestIdRef.current;
    try {
      const info = await fetchHealth();
      // A newer check has already answered; let it decide.
      if (id !== requestIdRef.current) return true;
      setState({
        status: info.ready ? "online" : "degraded",
        provider: info.provider ?? null,
        model: info.model ?? null,
      });
      return true;
    } catch {
      if (id !== requestIdRef.current) return true;
      setState((prev) => ({ ...prev, status: "offline" }));
      return false;
    }
  }, []);

  /**
   * A reply that came back proves the backend is reachable, whatever the
   * last health probe said. A failed request asks for a fresh check.
   */
  const report = useCallback(
    (result) => {
      if (result?.ok) {
        setState((prev) =>
          prev.status === "online" ? prev : { ...prev, status: "online" }
        );
        return;
      }
      void refresh();
    },
    [refresh]
  );

  useEffect(() => {
    let timer = null;
    let stopped = false;

    // Checks are chained rather than set on an interval: a request that
    // fails schedules the next one quickly, and one that succeeds waits.
    const tick = async () => {
      if (stopped) return;
      const ok = await refresh();
      if (stopped) return;
      timer = setTimeout(tick, ok ? HEALTHY_INTERVAL_MS : RETRY_INTERVAL_MS);
    };

    void tick();

    const onFocus = () => {
      clearTimeout(timer);
      void tick();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { ...state, refresh, report };
}
