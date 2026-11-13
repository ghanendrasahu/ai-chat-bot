import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { SendIcon, StopIcon } from "./Icons.jsx";

const MAX_CHARS = 2000;
const MAX_HEIGHT = 176;
const counter = new Intl.NumberFormat();

const Composer = forwardRef(function Composer({ onSend, onStop, pending }, ref) {
  const [value, setValue] = useState("");
  const fieldRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      fieldRef.current?.focus();
    },
  }), []);

  // Grow with the content, up to a cap, then scroll inside the field.
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const text = value.trim();
  const canSend = Boolean(text) && !pending && text.length <= MAX_CHARS;

  const submit = () => {
    if (!canSend) return;
    if (onSend(text)) setValue("");
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const remaining = MAX_CHARS - value.length;
  const showCount = value.length >= MAX_CHARS * 0.9;

  return (
    <div className="composer">
      <form
        className="composer__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="composer__field">
          <label className="sr-only" htmlFor="composer-input">
            Message Mira
          </label>
          <textarea
            id="composer-input"
            ref={fieldRef}
            className="composer__input"
            name="message"
            rows={1}
            placeholder="Message Mira…"
            value={value}
            maxLength={MAX_CHARS}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCapitalize="sentences"
            autoCorrect="on"
            enterKeyHint="send"
            inputMode="text"
            spellCheck="true"
            aria-label="Message Mira"
          />
        </div>

        {pending ? (
          <button
            type="button"
            className="composer__send composer__send--stop"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
          >
            <StopIcon size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className="composer__send"
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
          >
            <SendIcon size={18} />
          </button>
        )}
      </form>

      <div className="composer__foot">
        <p className="composer__hint">
          <kbd>Enter</kbd> sends, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line.
          Mira is an AI model, so check anything important.
        </p>
        <span className="composer__meta">
          {showCount ? (
            <span
              className={`composer__count${remaining < 200 ? " composer__count--near" : ""}`}
              aria-live="polite"
            >
              {counter.format(remaining)} left
            </span>
          ) : null}
          <span className="composer__build" title="Which build this is">
            build {__BUILD_ID__}
          </span>
        </span>
      </div>
    </div>
  );
});

export default Composer;
