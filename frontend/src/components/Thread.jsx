import { useCallback, useEffect, useRef, useState } from "react";
import EmptyState from "./EmptyState.jsx";
import Message from "./Message.jsx";
import { BotIcon, ChevronDownIcon } from "./Icons.jsx";

function TypingIndicator() {
  return (
    <article className="msg msg--mira">
      <span className="msg__avatar" aria-hidden="true">
        <BotIcon size={16} />
      </span>
      <div className="msg__body">
        <div className="bubble bubble--typing">
          <span className="typing" role="status" aria-label="Mira is typing">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </article>
  );
}

export default function Thread({
  messages,
  pending,
  loading,
  model,
  provider,
  memoryCount,
  onPick,
  onRetry,
  onRegenerate,
  onSaveMemory,
  onEdit,
  onDelete,
  onPin,
  onSwitchVariant,
  onEditSaved,
}) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const wasPending = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const next = distance < 64;
    atBottomRef.current = next;
    setAtBottom(next);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // Follow new messages only while the reader is already at the bottom.
  // On mount with an empty thread there is nothing to pin to the bottom,
  // so don't yank the empty state out of view.
  useEffect(() => {
    if (!atBottomRef.current) return;
    if (messages.length === 0 && !pending) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  // Announce the end of a reply once - never every streamed token.
  useEffect(() => {
    if (wasPending.current && !pending) setAnnouncement("Mira finished replying.");
    wasPending.current = pending;
  }, [pending]);

  const isEmpty = messages.length === 0 && !pending && !loading;
  const lastIndex = messages.length - 1;
  const hasStreamingText = messages.some(
    (message) => message.status === "streaming" && message.text?.trim()
  );

  return (
    <main className="main" ref={scrollRef} onScroll={handleScroll}>
      <div className="thread">
        {loading && messages.length === 0 ? (
          <p className="thread__loading" role="status">
            Loading conversations…
          </p>
        ) : null}

        {isEmpty ? (
          <EmptyState
            onPick={onPick}
            model={model}
            provider={provider}
            memoryCount={memoryCount}
          />
        ) : null}

        <div
          className="thread__log"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
        >
          {messages.map((message, index) => {
            // The placeholder exists from the moment Send is pressed, but it
            // should not render as an empty bubble while waiting for token 1.
            if (message.status === "streaming" && !message.text?.trim()) return null;
            return (
              <Message
                key={message.id}
                message={message}
                onRetry={onRetry}
                onRegenerate={onRegenerate}
                onSaveMemory={onSaveMemory}
                onEdit={onEdit}
                onDelete={onDelete}
                onPin={onPin}
                onSwitchVariant={onSwitchVariant}
                onEditSaved={onEditSaved}
                isLast={index === lastIndex}
                pending={pending}
              />
            );
          })}
          {pending && !hasStreamingText ? <TypingIndicator /> : null}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {atBottom ? null : (
        <button
          type="button"
          className="to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to the latest message"
        >
          <ChevronDownIcon size={16} />
        </button>
      )}
    </main>
  );
}
