import { useCallback, useEffect, useRef, useState } from "react";
import { sendChat } from "../lib/api.js";
import { describeError } from "../lib/errors.js";
import { clearStoredChats, loadStore, saveStore } from "../lib/storage.js";

/** How many past messages are sent back to the model as context. */
const HISTORY_LIMIT = 10;

let counter = 0;
function uid() {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

function titleOf(messages) {
  const first = messages.find((m) => m.role === "user")?.text?.trim() ?? "";
  if (!first) return "New chat";
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
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

/**
 * Owns every saved conversation. The active chat is what the UI renders;
 * `chats` is what the drawer lists. The store is written on every change.
 */
export function useChat({ onResult } = {}) {
  const [state, setState] = useState(() => {
    const store = loadStore();
    if (!store) return { activeId: null, chats: [] };
    return store;
  });
  const [pending, setPending] = useState(false);

  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const abortRef = useRef(null);
  const suppressAbortRef = useRef(false);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    stateRef.current = state;
    if (state.activeId) saveStore(state);
  }, [state]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const active =
    state.chats.find((chat) => chat.id === state.activeId) ?? null;
  const messages = active?.messages ?? [];

  /** Shared sender: writes to the given chat id. */
  const request = useCallback(async (text, history, chatId) => {
    setPending(true);
    suppressAbortRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const targetId = chatId;

    try {
      const reply = await sendChat({
        message: text,
        history,
        signal: controller.signal,
      });
      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === targetId
            ? {
                ...c,
                at: Date.now(),
                messages: [
                  ...c.messages,
                  { id: uid(), role: "mira", text: reply, at: Date.now(), status: "sent" },
                ],
              }
            : c
        ),
      }));
      onResultRef.current?.({ ok: true });
    } catch (error) {
      if (error.name === "AbortError") {
        if (!suppressAbortRef.current) {
          setState((prev) => ({
            ...prev,
            chats: prev.chats.map((c) =>
              c.id === targetId
                ? {
                    ...c,
                    at: Date.now(),
                    messages: [
                      ...c.messages,
                      { id: uid(), role: "mira", text: "Stopped generating.", at: Date.now(), status: "stopped" },
                    ],
                  }
                : c
            ),
          }));
        }
        return;
      }
      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === targetId
            ? {
                ...c,
                at: Date.now(),
                messages: [
                  ...c.messages,
                  {
                    id: uid(),
                    role: "mira",
                    text: describeError(error),
                    at: Date.now(),
                    status: "error",
                    retry: text,
                  },
                ],
              }
            : c
        ),
      }));
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

      const prev = stateRef.current;
      let chats = prev.chats;
      let activeId = prev.activeId;
      // No active chat yet (or it was deleted): start one.
      if (!activeId || !chats.some((c) => c.id === activeId)) {
        const id = `c${Date.now().toString(36)}`;
        activeId = id;
        chats = [
          { id, title: titleOf([{ role: "user", text }]), at: Date.now(), messages: [] },
          ...chats,
        ];
      }
      const target = chats.find((c) => c.id === activeId);
      const history = buildHistory(target?.messages ?? []);
      const nextChat = {
        ...target,
        at: Date.now(),
        messages: [
          ...(target?.messages ?? []),
          { id: uid(), role: "user", text, at: Date.now(), status: "sent" },
        ],
      };
      nextChat.title = nextChat.messages.filter((m) => m.role === "user").length === 1
        ? titleOf(nextChat.messages)
        : target.title;

      setState((prevState) => ({
        ...prevState,
        activeId,
        chats: (prevState.chats.some((c) => c.id === activeId) ? prevState.chats : chats).map(
          (c) => (c.id === activeId ? nextChat : c)
        ),
      }));
      void request(text, history, activeId);
      return true;
    },
    [request]
  );

  const retry = useCallback(
    (id) => {
      if (pendingRef.current) return;
      const current = stateRef.current;
      const index = current.chats
        .find((c) => c.id === current.activeId)
        ?.messages.findIndex((m) => m.id === id) ?? -1;
      if (index === -1) return;
      const failed = current.chats
        .find((c) => c.id === current.activeId)
        .messages[index];
      if (!failed.retry) return;

      const history = buildHistory(
        current.chats.find((c) => c.id === current.activeId).messages.slice(0, index)
      );
      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) =>
          c.id === prev.activeId
            ? { ...c, messages: c.messages.filter((m) => m.id !== id) }
            : c
        ),
      }));
      void request(failed.retry, history, current.activeId);
    },
    [request]
  );

  const clear = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) =>
        c.id === prev.activeId ? { ...c, messages: [] } : c
      ),
    }));
  }, []);

  /** Puts a snapshot back after a clear, so the action can be undone. */
  const restore = useCallback((snapshot) => {
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((c) =>
        c.id === prev.activeId ? { ...c, messages: snapshot } : c
      ),
    }));
  }, []);

  const newChat = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) => {
      const id = `c${Date.now().toString(36)}`;
      const chats = [
        { id, title: "New chat", at: Date.now(), messages: [] },
        ...prev.chats,
      ];
      return { activeId: id, chats };
    });
  }, []);

  const switchChat = useCallback((id) => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) => (prev.chats.some((c) => c.id === id) ? { ...prev, activeId: id } : prev));
  }, []);

  const deleteChat = useCallback((id) => {
    setState((prev) => {
      const chats = prev.chats.filter((c) => c.id !== id);
      const activeId =
        prev.activeId === id ? (chats[0]?.id ?? null) : prev.activeId;
      if (activeId === null) clearStoredChats();
      return { activeId, chats };
    });
  }, []);

  const clearAll = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    clearStoredChats();
    setState({ activeId: null, chats: [] });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    chats: state.chats,
    activeId: state.activeId,
    messages,
    pending,
    send,
    retry,
    clear,
    restore,
    newChat,
    switchChat,
    deleteChat,
    clearAll,
    stop,
  };
}
