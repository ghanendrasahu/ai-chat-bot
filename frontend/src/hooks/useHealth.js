import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPing } from "../lib/api.js";

const HEALTHY_INTERVAL_MS = 30_000;
// A failed check is retried in seconds, not in a minute - one blip should
// not leave the badge wrong for a whole poll cycle.
const RETRY_INTERVAL_MS = 4_000;

/**
 * What the badge is allowed to claim, given what we actually know.
 *
 * A health probe that fails on its own is not enough to call the app
 * "Offline" - ad blockers and proxies commonly block health endpoints, so
 * the probe can be unreachable while the chat works perfectly. "Offline" is
 * only shown when both the probe and a chat attempt have failed.
 */
function deriveStatus({ probe, chat, ready }) {
  if (chat === "ok") return "online";
  if (probe === "ok") return ready ? "online" : "degraded";
  if (chat === "failed" && probe === "failed") return "offline";
  return "checking";
}

export { deriveStatus };

export function useHealth() {
  const [state, setState] = useState({
    probe: "checking",
    chat: "unknown",
    ready: null,
    provider: null,
    model: null,
    providers: null,
  });
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestIdRef.current;
    try {
      const info = await fetchPing();
      if (id !== requestIdRef.current) return true;
      setState((prev) => ({
        ...prev,
        probe: "ok",
        ready: Boolean(info.ready),
        provider: info.provider ?? null,
        model: info.model ?? null,
        providers: info.providers ?? null,
      }));
      return true;
    } catch (error) {
      if (id !== requestIdRef.current) return true;
      console.warn("health probe failed:", error?.message ?? error);
      setState((prev) => ({ ...prev, probe: "failed" }));
      return false;
    }
  }, []);

  /**
   * A reply that came back is the strongest evidence the app can chat, so
   * it flips the badge to ready whatever the probe last said. A failure
   * marks the chat as unreachable and re-checks the server.
   */
  const report = useCallback(
    (result) => {
      setState((prev) => ({
        ...prev,
        chat: result?.ok ? "ok" : "failed",
      }));
      if (!result?.ok) void refresh();
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

  return {
    status: deriveStatus(state),
    // Raw signals, so the UI can factor in a user-supplied key before
    // deciding whether the model is ready.
    probe: state.probe,
    chat: state.chat,
    ready: state.ready,
    providers: state.providers,
    provider: state.provider,
    model: state.model,
    refresh,
    report,
  };
}
