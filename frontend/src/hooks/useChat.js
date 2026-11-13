import { useCallback, useEffect, useRef, useState } from "react";
import { generateTitle, streamChat } from "../lib/api.js";
import { describeError } from "../lib/errors.js";
import { clearStoredChats, loadStore, saveStore } from "../lib/storage.js";

const MAX_MESSAGE_CHARS = 2000;
const MAX_TITLE_CHARS = 60;
const MAX_CHAT_INSTRUCTIONS = 1000;
const MAX_VARIANTS = 5;
const SAVE_DEBOUNCE_MS = 250;

let counter = 0;
function uid() {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

function titleOf(messages) {
  const first = messages.find((m) => m.role === "user")?.text?.trim() ?? "";
  if (!first) return "New chat";
  return first.length > MAX_TITLE_CHARS ? `${first.slice(0, MAX_TITLE_CHARS)}…` : first;
}

function turnOf(message) {
  return {
    role: message.role === "user" ? "user" : "assistant",
    content: message.text,
  };
}

/** Every usable turn, in order, for the provider. */
function historyOf(messages) {
  return messages
    .filter(
      (message) =>
        message.status !== "error" &&
        (message.role === "user" || message.role === "mira") &&
        typeof message.text === "string" &&
        message.text.trim()
    )
    .map(turnOf);
}

/** Pinned turns are sent separately so the server can never trim them away. */
function pinnedOf(messages) {
  return messages
    .filter(
      (message) =>
        message.pinned &&
        message.status !== "error" &&
        typeof message.text === "string" &&
        message.text.trim()
    )
    .map(turnOf);
}

/** Applies a patch to one variant (or the message itself when it has none). */
function withVariant(message, index, patch) {
  if (index === null || index === undefined || !message.variants) {
    return { ...message, ...patch };
  }
  const variants = message.variants.map((variant, position) =>
    position === index ? { ...variant, ...patch } : variant
  );
  return { ...message, variants, ...patch };
}

function revertVariant(message, previousIndex) {
  if (!message.variants || previousIndex === null) return message;
  const variants = message.variants.filter((_, position) => position !== message.variantIndex);
  const index = Math.max(0, Math.min(variants.length - 1, previousIndex));
  const selected = variants[index];
  return {
    ...message,
    variants,
    variantIndex: index,
    text: selected?.text ?? message.text,
    model: selected?.model ?? message.model,
    status: "sent",
  };
}

function errorMessage(text, retry) {
  return {
    id: uid(),
    role: "mira",
    text,
    at: Date.now(),
    status: "error",
    retry,
  };
}

/**
 * Owns every saved conversation. The active chat is what the UI renders;
 * `chats` is what the drawer lists.
 *
 * Chat storage is asynchronous (IndexedDB), so the hook exposes `ready` and
 * writes are debounced - streaming would otherwise write a record per frame.
 */
export function useChat({ onResult, config } = {}) {
  const [state, setState] = useState({ activeId: null, chats: [] });
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const readyRef = useRef(false);
  const abortRef = useRef(null);
  const suppressAbortRef = useRef(false);
  const onResultRef = useRef(onResult);
  const saveTimerRef = useRef(null);
  // Provider/model/key/memory are read at send time, so changing the model
  // mid-thread applies to the next message without restarting anything.
  const configRef = useRef(config);

  useEffect(() => {
    let cancelled = false;
    loadStore()
      .then((store) => {
        if (cancelled) return;
        if (store) setState(store);
        readyRef.current = true;
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        readyRef.current = true;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    stateRef.current = state;
    if (!ready) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveStore(state);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [state, ready]);

  // Flush the newest state if the page goes away mid-debounce. `pagehide`
  // covers navigation and bfcache, while visibilitychange covers a mobile tab
  // switched to the background before the OS freezes it.
  useEffect(() => {
    const flush = () => {
      if (!readyRef.current || !saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void saveStore(stateRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const active = state.chats.find((chat) => chat.id === state.activeId) ?? null;
  const messages = active?.messages ?? [];

  const updateChat = useCallback((chatId, updater) => {
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
    }));
  }, []);

  /** Asks for a title in the background. Any failure keeps the fallback. */
  const maybeTitle = useCallback(
    async (chatId, firstMessage) => {
      const chat = stateRef.current.chats.find((entry) => entry.id === chatId);
      if (chat && chat.titleAuto === false) return;
      try {
        const title = await generateTitle({
          message: firstMessage,
          ...(configRef.current ?? {}),
        });
        if (!title) return;
        updateChat(chatId, (entry) =>
          entry.titleAuto === false
            ? entry
            : { ...entry, title: title.slice(0, MAX_TITLE_CHARS), titleAuto: true }
        );
      } catch {
        // The first-message title is already showing; nothing to do.
      }
    },
    [updateChat]
  );

  /** Shared sender: streams into the placeholder with the given id. */
  const request = useCallback(
    async ({
      chatId,
      message,
      assistantId,
      history,
      pinned,
      summary,
      summaryCount,
      persona,
      chatInstructions,
      variantIndex = null,
      previousVariantIndex = null,
      titleCandidate = null,
    }) => {
      setPending(true);
      pendingRef.current = true;
      suppressAbortRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;

      let full = "";
      let frame = 0;

      const applyText = (text) => {
        updateChat(chatId, (chat) => ({
          ...chat,
          at: Date.now(),
          messages: chat.messages.map((entry) =>
            entry.id === assistantId
              ? withVariant(entry, variantIndex, { text })
              : entry
          ),
        }));
      };

      const cancelFrame = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      };

      try {
        const result = await streamChat({
          ...(configRef.current ?? {}),
          message,
          history,
          pinned,
          summary,
          summaryCount,
          persona,
          chatInstructions,
          signal: controller.signal,
          onToken: (text) => {
            full = text;
            // One render per animation frame, not one per token.
            if (frame) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              applyText(full);
            });
          },
        });

        cancelFrame();
        full = result.reply;
        updateChat(chatId, (chat) => ({
          ...chat,
          at: Date.now(),
          messages: chat.messages.map((entry) => {
            if (entry.id !== assistantId) return entry;
            const next = withVariant(entry, variantIndex, {
              text: result.reply,
              ...(result.model ? { model: result.model } : {}),
            });
            return { ...next, text: result.reply, status: "sent" };
          }),
          ...(result.summary
            ? { summary: result.summary, summaryCount: result.summaryCount }
            : {}),
        }));
        onResultRef.current?.({ ok: true });
        if (titleCandidate) void maybeTitle(chatId, titleCandidate);
      } catch (error) {
        cancelFrame();
        const partial = full.trim();
        const detail = describeError(error);

        if (error.name === "AbortError") {
          if (suppressAbortRef.current) {
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages
                .map((entry) => {
                  if (entry.id !== assistantId) return entry;
                  if (!partial) return null;
                  return withVariant(entry, variantIndex, {
                    text: full,
                    status: "stopped",
                  });
                })
                .filter(Boolean),
            }));
            return;
          }

          if (variantIndex !== null && !partial) {
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages.map((entry) =>
                entry.id === assistantId
                  ? revertVariant(entry, previousVariantIndex)
                  : entry
              ),
            }));
            return;
          }

          updateChat(chatId, (chat) => ({
            ...chat,
            at: Date.now(),
            messages: chat.messages.map((entry) =>
              entry.id === assistantId
                ? withVariant(entry, variantIndex, {
                    text: partial || "Stopped generating.",
                    status: "stopped",
                  })
                : entry
            ),
          }));
          return;
        }

        if (variantIndex !== null && !partial) {
          // Regenerating failed before any token: keep the old answer and
          // show the failure as its own retryable message.
          updateChat(chatId, (chat) => ({
            ...chat,
            at: Date.now(),
            messages: [
              ...chat.messages.map((entry) =>
                entry.id === assistantId
                  ? revertVariant(entry, previousVariantIndex)
                  : entry
              ),
              errorMessage(detail, message),
            ],
          }));
        } else if (partial) {
          updateChat(chatId, (chat) => ({
            ...chat,
            at: Date.now(),
            messages: chat.messages.map((entry) =>
              entry.id === assistantId
                ? {
                    ...withVariant(entry, variantIndex, { text: full }),
                    status: "error",
                    error: detail,
                    retry: message,
                  }
                : entry
            ),
          }));
        } else {
          updateChat(chatId, (chat) => ({
            ...chat,
            at: Date.now(),
            messages: chat.messages.map((entry) =>
              entry.id === assistantId
                ? {
                    ...withVariant(entry, variantIndex, { text: detail }),
                    status: "error",
                    retry: message,
                  }
                : entry
            ),
          }));
        }

        onResultRef.current?.({ ok: false, error });
      } finally {
        cancelFrame();
        if (abortRef.current === controller) abortRef.current = null;
        pendingRef.current = false;
        setPending(false);
      }
    },
    [maybeTitle, updateChat]
  );

  const send = useCallback(
    (raw) => {
      const text = String(raw ?? "").trim();
      if (!text || text.length > MAX_MESSAGE_CHARS || pendingRef.current) return false;

      const prev = stateRef.current;
      let activeId = prev.activeId;
      // No active chat yet (or it was deleted): start one.
      if (!activeId || !prev.chats.some((chat) => chat.id === activeId)) {
        activeId = `c${Date.now().toString(36)}`;
      }
      const target = prev.chats.find((chat) => chat.id === activeId) ?? null;
      const baseMessages = target?.messages ?? [];
      const isFirstUser = !baseMessages.some((message) => message.role === "user");
      const assistantId = uid();

      const nextChat = {
        ...(target ?? {
          id: activeId,
          title: titleOf([{ role: "user", text }]),
          titleAuto: true,
          at: Date.now(),
          messages: [],
        }),
        at: Date.now(),
        messages: [
          ...baseMessages,
          { id: uid(), role: "user", text, at: Date.now(), status: "sent" },
          { id: assistantId, role: "mira", text: "", at: Date.now(), status: "streaming" },
        ],
      };
      if (isFirstUser && nextChat.titleAuto !== false) {
        nextChat.title = titleOf(nextChat.messages);
      }

      setState((current) => ({
        ...current,
        activeId,
        chats: current.chats.some((chat) => chat.id === activeId)
          ? current.chats.map((chat) => (chat.id === activeId ? nextChat : chat))
          : [nextChat, ...current.chats],
      }));

      void request({
        chatId: activeId,
        message: text,
        assistantId,
        history: historyOf(baseMessages),
        pinned: pinnedOf(baseMessages),
        summary: target?.summary ?? "",
        summaryCount: target?.summaryCount ?? 0,
        persona: target?.persona ?? configRef.current?.persona,
        chatInstructions: target?.instructions ?? "",
        titleCandidate: isFirstUser ? text : null,
      });
      return true;
    },
    [request]
  );

  const retry = useCallback(
    (id) => {
      if (pendingRef.current) return;
      const current = stateRef.current;
      const chat = current.chats.find((entry) => entry.id === current.activeId);
      const index = chat?.messages.findIndex((message) => message.id === id) ?? -1;
      if (!chat || index === -1) return;
      const failed = chat.messages[index];
      if (!failed.retry) return;

      const history = chat.messages.slice(0, index);
      const assistantId = uid();
      updateChat(chat.id, (entry) => ({
        ...entry,
        at: Date.now(),
        messages: [
          ...history,
          { id: assistantId, role: "mira", text: "", at: Date.now(), status: "streaming" },
        ],
      }));

      void request({
        chatId: chat.id,
        message: failed.retry,
        assistantId,
        history: historyOf(history),
        pinned: pinnedOf(history),
        summary: chat.summary ?? "",
        summaryCount: chat.summaryCount ?? 0,
        persona: chat.persona ?? configRef.current?.persona,
        chatInstructions: chat.instructions ?? "",
      });
    },
    [request, updateChat]
  );

  /**
   * Adds a new variant to the last reply instead of deleting the old one.
   * Only the selected variant is ever sent as history.
   */
  const regenerate = useCallback(() => {
    if (pendingRef.current) return false;
    const current = stateRef.current;
    const chat = current.chats.find((entry) => entry.id === current.activeId);
    if (!chat || chat.messages.length === 0) return false;

    const last = chat.messages[chat.messages.length - 1];
    if (last.role !== "mira" || last.status === "streaming") return false;

    const userIndex = chat.messages.map((message) => message.role).lastIndexOf("user");
    if (userIndex === -1) return false;
    const question = chat.messages[userIndex].text;

    const existing =
      last.variants?.length > 0
        ? last.variants
        : [{ text: last.text, ...(last.model ? { model: last.model } : {}), at: last.at }];
    const selectedIndex = Number.isFinite(last.variantIndex)
      ? last.variantIndex
      : existing.length - 1;
    const trimmed = existing.length + 1 > MAX_VARIANTS;
    const variants = [
      ...existing,
      { text: "", ...(configRef.current?.model ? { model: configRef.current.model } : {}), at: Date.now() },
    ].slice(-MAX_VARIANTS);
    const variantIndex = variants.length - 1;
    const previousVariantIndex = Math.max(
      0,
      Math.min(variants.length - 2, trimmed ? selectedIndex - 1 : selectedIndex)
    );

    const assistantId = last.id;
    updateChat(chat.id, (entry) => ({
      ...entry,
      at: Date.now(),
      messages: entry.messages.map((message, index) =>
        index === entry.messages.length - 1
          ? {
              ...message,
              variants,
              variantIndex,
              text: "",
              model: configRef.current?.model ?? message.model,
              status: "streaming",
            }
          : message
      ),
    }));

    const before = chat.messages.slice(0, userIndex);
    void request({
      chatId: chat.id,
      message: question,
      assistantId,
      history: historyOf(before),
      pinned: pinnedOf(before),
      summary: chat.summary ?? "",
      summaryCount: chat.summaryCount ?? 0,
      persona: chat.persona ?? configRef.current?.persona,
      chatInstructions: chat.instructions ?? "",
      variantIndex,
      previousVariantIndex,
    });
    return true;
  }, [request, updateChat]);

  const switchVariant = useCallback(
    (id, index) => {
      const current = stateRef.current;
      updateChat(current.activeId, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.id !== id || !message.variants) return message;
          if (!Number.isFinite(index) || index < 0 || index >= message.variants.length) {
            return message;
          }
          const variant = message.variants[index];
          return {
            ...message,
            variantIndex: index,
            text: variant.text,
            model: variant.model ?? message.model,
          };
        }),
      }));
    },
    [updateChat]
  );

  /** Replaces a user message, drops everything after it, and asks again. */
  const editMessage = useCallback(
    (id, raw) => {
      const text = String(raw ?? "").trim();
      if (!text || text.length > MAX_MESSAGE_CHARS || pendingRef.current) return false;
      const current = stateRef.current;
      const chat = current.chats.find((entry) => entry.id === current.activeId);
      const index = chat?.messages.findIndex((message) => message.id === id) ?? -1;
      if (!chat || index === -1 || chat.messages[index].role !== "user") return false;

      const before = chat.messages.slice(0, index);
      const assistantId = uid();
      updateChat(chat.id, (entry) => ({
        ...entry,
        at: Date.now(),
        messages: [
          ...before,
          { ...chat.messages[index], text, at: Date.now(), status: "sent" },
          { id: assistantId, role: "mira", text: "", at: Date.now(), status: "streaming" },
        ],
      }));

      void request({
        chatId: chat.id,
        message: text,
        assistantId,
        history: historyOf(before),
        pinned: pinnedOf(before),
        summary: chat.summary ?? "",
        summaryCount: chat.summaryCount ?? 0,
        persona: chat.persona ?? configRef.current?.persona,
        chatInstructions: chat.instructions ?? "",
      });
      return true;
    },
    [request, updateChat]
  );

  const deleteMessage = useCallback(
    (id) => {
      if (pendingRef.current) return false;
      const current = stateRef.current;
      const chat = current.chats.find((entry) => entry.id === current.activeId);
      if (!chat?.messages.some((message) => message.id === id)) return false;
      updateChat(chat.id, (entry) => ({
        ...entry,
        at: Date.now(),
        messages: entry.messages.filter((message) => message.id !== id),
      }));
      return true;
    },
    [updateChat]
  );

  const togglePin = useCallback(
    (id) => {
      const current = stateRef.current;
      const chat = current.chats.find((entry) => entry.id === current.activeId);
      if (!chat?.messages.some((message) => message.id === id)) return false;
      updateChat(chat.id, (entry) => ({
        ...entry,
        messages: entry.messages.map((message) =>
          message.id === id ? { ...message, pinned: !message.pinned } : message
        ),
      }));
      return true;
    },
    [updateChat]
  );

  const renameChat = useCallback(
    (id, raw) => {
      const title = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_CHARS);
      if (!title) return false;
      updateChat(id, (chat) => ({ ...chat, title, titleAuto: false }));
      return true;
    },
    [updateChat]
  );

  const setChatPersona = useCallback(
    (id, persona) => {
      updateChat(id, (chat) => {
        if (!persona) {
          const next = { ...chat };
          delete next.persona;
          return next;
        }
        return { ...chat, persona };
      });
    },
    [updateChat]
  );

  const setChatInstructions = useCallback(
    (id, raw) => {
      const instructions = String(raw ?? "").slice(0, MAX_CHAT_INSTRUCTIONS);
      updateChat(id, (chat) => ({ ...chat, instructions }));
    },
    [updateChat]
  );

  const clear = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) =>
        chat.id === prev.activeId
          ? { ...chat, messages: [], summary: "", summaryCount: 0 }
          : chat
      ),
    }));
  }, []);

  /** Puts a snapshot back after a clear, so the action can be undone. */
  const restore = useCallback((snapshot) => {
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) =>
        chat.id === prev.activeId ? { ...chat, messages: snapshot } : chat
      ),
    }));
  }, []);

  const newChat = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) => {
      const id = `c${Date.now().toString(36)}`;
      const chats = [
        { id, title: "New chat", titleAuto: true, at: Date.now(), messages: [] },
        ...prev.chats,
      ];
      return { activeId: id, chats };
    });
  }, []);

  const switchChat = useCallback((id) => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    setState((prev) =>
      prev.chats.some((chat) => chat.id === id) ? { ...prev, activeId: id } : prev
    );
  }, []);

  const deleteChat = useCallback((id) => {
    setState((prev) => {
      const chats = prev.chats.filter((chat) => chat.id !== id);
      const activeId = prev.activeId === id ? (chats[0]?.id ?? null) : prev.activeId;
      if (activeId === null) void clearStoredChats();
      return { activeId, chats };
    });
  }, []);

  const clearAll = useCallback(() => {
    suppressAbortRef.current = true;
    abortRef.current?.abort();
    void clearStoredChats();
    setState({ activeId: null, chats: [] });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    chats: state.chats,
    activeId: state.activeId,
    activeChat: active,
    messages,
    pending,
    ready,
    send,
    retry,
    regenerate,
    switchVariant,
    editMessage,
    deleteMessage,
    togglePin,
    renameChat,
    setChatPersona,
    setChatInstructions,
    clear,
    restore,
    newChat,
    switchChat,
    deleteChat,
    clearAll,
    stop,
  };
}
