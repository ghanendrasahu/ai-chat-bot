import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : "http://localhost:3001";

const SUGGESTIONS = [
  {
    label: "Plan my week",
    prompt: "Help me plan a focused week around my top three priorities.",
  },
  {
    label: "Explain a concept",
    prompt: "Explain how large language models work, in plain language.",
  },
  {
    label: "Draft an email",
    prompt: "Draft a short, friendly email asking a colleague for feedback.",
  },
];

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "I couldn't reach the server. Check your connection and try again.";
  }
  if (/503|no llm key/i.test(message)) {
    return "Mira isn't available right now. Please try again later.";
  }
  if (/502|provider/i.test(message)) {
    return "Mira is having trouble answering. Try again in a moment.";
  }
  if (/429|rate/i.test(message)) {
    return "Too many messages at once. Wait a few seconds and try again.";
  }
  return "The reply didn't come through. Try again in a moment.";
}

function SparkIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function BotIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, loading]);

  const requestReply = async (text) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `The server returned ${res.status}.`);
      }

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "mira", text: data.reply },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "mira",
          failed: true,
          retry: text,
          text: friendlyError(error),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const sendMessage = (value) => {
    const text = (value ?? input).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
    setInput("");
    void requestReply(text);
  };

  const retryMessage = (id, text) => {
    if (loading) return;
    setMessages((prev) => prev.filter((message) => message.id !== id));
    void requestReply(text);
  };

  const clearConversation = () => {
    if (loading) return;
    setMessages([]);
    inputRef.current?.focus();
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="app">
      <div className="shell">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <div>
              <h1>Mira</h1>
              <p>AI chat companion</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="status">
              <span className="status-dot" aria-hidden="true" />
              Ready
            </span>
            {hasMessages && (
              <button
                type="button"
                className="icon-button"
                onClick={clearConversation}
                disabled={loading}
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </header>

        <div className="chat-scroll" ref={listRef} aria-live="polite">
          {!hasMessages && !loading && (
            <section className="empty">
              <span className="empty-icon" aria-hidden="true">
                <MessageIcon />
              </span>
              <h2>Start a conversation</h2>
              <p>
                Ask a question, think through a decision, or draft something
                together. Mira keeps the thread while this tab stays open.
              </p>
              <div className="prompts">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="prompt"
                    onClick={() => sendMessage(suggestion.prompt)}
                  >
                    <SparkIcon />
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {messages.map((message) =>
            message.role === "mira" ? (
              <article key={message.id} className="msg mira">
                <span className="msg-avatar" aria-hidden="true">
                  <BotIcon />
                </span>
                <div className={`bubble ${message.failed ? "failed" : ""}`}>
                  {message.failed ? (
                    <>
                      <span className="bubble-title">
                        <AlertIcon />
                        Couldn't reply
                      </span>
                      <span className="bubble-text">{message.text}</span>
                      <button
                        type="button"
                        className="retry"
                        onClick={() =>
                          retryMessage(message.id, message.retry)
                        }
                      >
                        <RefreshIcon />
                        Try again
                      </button>
                    </>
                  ) : (
                    <span className="bubble-text">{message.text}</span>
                  )}
                </div>
              </article>
            ) : (
              <article key={message.id} className="msg user">
                <div className="bubble">
                  <span className="bubble-text">{message.text}</span>
                </div>
              </article>
            )
          )}

          {loading && (
            <article className="msg mira">
              <span className="msg-avatar" aria-hidden="true">
                <BotIcon />
              </span>
              <div className="bubble">
                <span className="typing" role="status" aria-label="Mira is typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </article>
          )}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <label className="sr-only" htmlFor="message">
            Message Mira
          </label>
          <input
            id="message"
            ref={inputRef}
            type="text"
            placeholder="Message Mira..."
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoFocus
          />
          <button
            type="submit"
            aria-label="Send message"
            title="Send message"
            disabled={!input.trim() || loading}
          >
            <SendIcon />
          </button>
        </form>
        <p className="composer-note">
          Mira is an AI model. Replies can be inaccurate, so check anything
          important.
        </p>
      </div>
    </div>
  );
}
