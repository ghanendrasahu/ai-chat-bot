import { useState } from "react";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // VITE_API_URL overrides the chat API origin at build time.
  // It ships empty for the single-service deployment (same-origin "/chat")
  // and stays undefined for local dev, where the backend runs on :3001.
  const apiBase =
    import.meta.env.VITE_API_URL !== undefined
      ? import.meta.env.VITE_API_URL
      : "http://localhost:3001";

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { sender: "You", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `The server returned ${res.status}`);
      }
      const miraMsg = { sender: "Mira", text: data.reply };
      setMessages(prev => [...prev, miraMsg]);
    } catch (err) {
      console.error(err);
      const detail = err && err.message ? err.message : "Something went wrong.";
      setMessages(prev => [
        ...prev,
        { sender: "Mira", text: `Sorry - I couldn't reply. ${detail}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <h1>Mira Chat 💬</h1>
      <div className="chat-box">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message ${msg.sender === "Mira" ? "mira" : "user"}`}
          >
            {msg.sender === "Mira" && <div className="avatar">🤖</div>}
            <div className="message-text">{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-message mira">
            <div className="avatar">🤖</div>
            <div className="message-text typing">Mira is typing...</div>
          </div>
        )}
      </div>

      <div className="input-container">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
