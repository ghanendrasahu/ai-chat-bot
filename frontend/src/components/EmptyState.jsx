import { MessageIcon, SparkIcon } from "./Icons.jsx";

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

export default function EmptyState({ onPick, model }) {
  return (
    <div className="empty">
      <span className="empty__badge" aria-hidden="true">
        <MessageIcon size={24} />
      </span>
      <h2 className="empty__title">Start a conversation</h2>
      <p className="empty__text">
        Ask a question, think through a decision, or draft something together.
        Mira remembers the thread while this tab stays open.
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
          Mira is running <span translate="no">{model}</span>
        </p>
      ) : null}
    </div>
  );
}
