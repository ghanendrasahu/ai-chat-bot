import CopyButton from "./CopyButton.jsx";
import Markdown from "./Markdown.jsx";
import { AlertIcon, BotIcon, RefreshIcon } from "./Icons.jsx";
import { formatTime } from "../lib/time.js";

export default function Message({ message, onRetry }) {
  const isUser = message.role === "user";
  const isError = message.status === "error";

  if (message.status === "stopped") {
    return (
      <p className="notice">
        <span>{message.text}</span>
      </p>
    );
  }

  return (
    <article className={`msg ${isUser ? "msg--user" : "msg--mira"}`}>
      {isUser ? null : (
        <span className="msg__avatar" aria-hidden="true">
          <BotIcon size={16} />
        </span>
      )}

      <div className="msg__body">
        <div className={`bubble${isError ? " bubble--error" : ""}`}>
          {isError ? (
            <>
              <p className="bubble__title">
                <AlertIcon size={14} />
                Couldn’t reply
              </p>
              <p className="bubble__text">{message.text}</p>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onRetry(message.id)}
              >
                <RefreshIcon size={13} />
                Try again
              </button>
            </>
          ) : isUser ? (
            <p className="bubble__text">{message.text}</p>
          ) : (
            <Markdown text={message.text} />
          )}
        </div>

        <div className="msg__meta">
          <span className="msg__time">{formatTime(message.at)}</span>
          {isUser || isError ? null : (
            <CopyButton text={message.text} label="Copy reply" />
          )}
        </div>
      </div>
    </article>
  );
}
