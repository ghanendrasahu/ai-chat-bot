import { useCallback, useEffect, useRef, useState } from "react";
import { sendChat } from "../lib/api.js";
import { describeError } from "../lib/errors.js";
import {
  clearStoredMessages,
  loadMessages,
  saveMessages,
} from "../lib/storage.js";

/** How many past messages are sent back to the model as context. */
const HISTORY_LIMIT = 10;

let counter = 0;
function uid() {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

function buildHistory(messages) {
  return messages
    .filter((m) => m.status !== "error" && (m.role === "user" || m.role === "mira"))
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));
}

export function useChat({ onResult } = {}) {
  const [messages, setMessages] = useState(loadMessages);
  const [pending, setPending] = useState(false);

  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
  const abortRef = useRef(null);
  const suppressAbortRef = useRef(false);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    messagesRef.current = messages;
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const request = useCallback(async (text, history) => {
    setPending(true);
    suppressAbortRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await sendChat({
        message: text,
        history,
        signal: controller.signal,
      });
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "mira", text: reply, at: Date.now(), status: "sent" },
      ]);
      onResultRef.current?.({ ok: true });
    } catch (error) {
      if (error.name === "AbortError") {
        // The reader stopped it on purpose - say so instead of showing a fault.
        if (!suppressAbortRef.current) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "mira",
              text: "Stopped generating.",
              at: Date.now(),
              status: "stopped",
            },
          ]);
        }
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "mira",
          text: describeError(error),
          at: Date.now(),
          status: "error",
          retry: text,
        },
      ]);
      onResultRef.current?.({ ok: false, error });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  }, []);

  const send = useCallback(
    (raw) => {
      const text = String(raw ?? "").trim();
      if (!text || pendingRef.current) return false;

      const history = buildHistory(messagesRef.current);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", text, at: Date.now(), status: "sent" },
      ]);
      void request(text, history);
      return true;
    },
    [request]
  );

  const retry = useCallback(
    (id) => {
      if (pendingRef.current) return;
      const current = messagesRef.current;
      const index = current.findIndex((m) => m.id === id);
      if (index === -1) return;
      const failed = current[index];
      if (!failed.retry) return;

      const history = buildHistory(current.slice(0, index));
      setMessages((prev) => prev.filter((m) => m.id !== id));
      void request(failed.retry, history);
    },
    [request]
  );

  const clear = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setMessages([]);
    clearStoredMessages();
  }, []);

  /** Puts a snapshot back after a clear, so the action can be undone. */
  const restore = useCallback((snapshot) => {
    setMessages(snapshot);
    saveMessages(snapshot);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, pending, send, retry, clear, restore, stop };
}
