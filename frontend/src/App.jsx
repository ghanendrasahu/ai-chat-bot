import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Composer from "./components/Composer.jsx";
import Header from "./components/Header.jsx";
import Thread from "./components/Thread.jsx";
import Toast from "./components/Toast.jsx";
import { useChat } from "./hooks/useChat.js";
import { useHealth } from "./hooks/useHealth.js";

const UNDO_WINDOW_MS = 8000;

export default function App() {
  const { messages, pending, send, retry, clear, restore, stop } = useChat();
  const health = useHealth();
  const [cleared, setCleared] = useState(null);

  const handleSend = useCallback((text) => send(text), [send]);

  // Clearing is destructive, so keep the thread around for an undo window.
  const handleClear = useCallback(() => {
    setCleared(messages);
    clear();
  }, [clear, messages]);

  const handleUndo = useCallback(() => {
    if (cleared) restore(cleared);
    setCleared(null);
  }, [cleared, restore]);

  useEffect(() => {
    if (!cleared) return undefined;
    const timer = setTimeout(() => setCleared(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [cleared]);

  return (
    <div className="app">
      <a className="skip-link" href="#composer-input">
        Skip to the message box
      </a>
      <div className="chat">
        <Header
          health={health}
          canClear={messages.length > 0}
          onClear={handleClear}
        />
        <Thread
          messages={messages}
          pending={pending}
          model={health.model}
          onPick={handleSend}
          onRetry={retry}
        />
        <Composer onSend={handleSend} onStop={stop} pending={pending} />
        <Toast
          message={cleared ? "Conversation cleared" : null}
          actionLabel="Undo"
          onAction={handleUndo}
        />
      </div>
    </div>
  );
}
