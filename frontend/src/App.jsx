import { useState } from "react";
import "./App.css";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { sender: "You", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await res.json();
      const miraMsg = { sender: "Mira", text: data.reply };
      setMessages(prev => [...prev, miraMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        { sender: "Mira", text: "Oops! Something went wrong. 😅" },
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
