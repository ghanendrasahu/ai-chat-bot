import { MessageIcon, SparkIcon } from "./Icons.jsx";
import { providerLabel } from "../lib/settings.js";

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

export default function EmptyState({ onPick, model, provider, memoryCount = 0 }) {
  return (
    <div className="empty">
      <span className="empty__badge" aria-hidden="true">
        <MessageIcon size={24} />
      </span>
      <h2 className="empty__title">Start a conversation</h2>
      <p className="empty__text">
        Ask a question, think through a decision, or draft something together.
        Your conversations stay on this device.
      </p>

      <ul className="empty__prompts">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion.label}>
            <button
              type="button"
              className="prompt"
              onClick={() => onPick(suggestion.prompt)}
            >
              <SparkIcon size={14} />
              {suggestion.label}
            </button>
          </li>
        ))}
      </ul>

      {model ? (
        <p className="empty__model">
          Running <span translate="no">{model}</span>
          {provider ? <> via {providerLabel(provider)}</> : null}
          {memoryCount > 0 ? (
            <>
              {" · "}
              {memoryCount} {memoryCount === 1 ? "memory" : "memories"} shared by
              every model
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
