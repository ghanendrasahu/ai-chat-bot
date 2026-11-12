import { useEffect, useId, useRef, useState } from "react";
import {
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SparkIcon,
  SunIcon,
  TrashIcon,
  XIcon,
} from "./Icons.jsx";
import ModelList from "./ModelList.jsx";
import { PERSONAS, PROVIDERS, getProvider } from "../lib/providers.js";
import {
  MAX_INSTRUCTIONS_CHARS,
  MAX_MEMORY_CHARS,
  MAX_MEMORY_ITEMS,
} from "../lib/settings.js";

const TABS = [
  { id: "model", label: "Model" },
  { id: "memory", label: "Memory" },
  { id: "appearance", label: "Appearance" },
];

const THEMES = [
  { id: "system", label: "System", icon: MonitorIcon },
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function SettingsDialog({
  open,
  initialTab = "model",
  settings,
  serverProviders,
  onClose,
  onSetProvider,
  onSetModel,
  onSetKey,
  onAddMemory,
  onRemoveMemory,
  onClearMemory,
  onClearKeys,
  onResetAll,
  onInstructions,
  onPersona,
  onTheme,
}) {
  const [tab, setTab] = useState(initialTab);
  const [reveal, setReveal] = useState(false);
  const [fact, setFact] = useState("");
  const [confirm, setConfirm] = useState(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const tabRefs = useRef({});
  const id = useId();

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setReveal(false);
    setFact("");
    setConfirm(null);
    closeRef.current?.focus();
  }, [open, initialTab]);

  // A destructive button stays armed for a few seconds, then disarms.
  useEffect(() => {
    if (!confirm) return undefined;
    const timer = setTimeout(() => setConfirm(null), 4000);
    return () => clearTimeout(timer);
  }, [confirm]);

  // Keep focus inside the dialog, and let Escape close it.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const active = getProvider(settings.provider);
  const apiKey = settings.keys[settings.provider] ?? "";
  const hasKey = Boolean(apiKey) || Boolean(serverProviders?.[settings.provider]);
  const usingOwnKey = Boolean(apiKey);

  const submitFact = (event) => {
    event.preventDefault();
    if (onAddMemory(fact)) setFact("");
  };

  const selectTab = (next) => {
    setTab(next);
    setConfirm(null);
  };

  const onTabKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : (index - 1 + TABS.length) % TABS.length;
    selectTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <div className="dialog-root">
      <button
        type="button"
        className="dialog-scrim"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        ref={panelRef}
      >
        <div className="dialog__head">
          <h2 className="dialog__title" id={`${id}-title`}>
            Settings
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close settings"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div
          className="tabs"
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={onTabKeyDown}
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${id}-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`${id}-panel-${entry.id}`}
              tabIndex={tab === entry.id ? 0 : -1}
              ref={(node) => {
                tabRefs.current[entry.id] = node;
              }}
              className={`tabs__btn${tab === entry.id ? " is-active" : ""}`}
              onClick={() => selectTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="dialog__body">
          {tab === "model" ? (
            <section
              role="tabpanel"
              id={`${id}-panel-model`}
              aria-labelledby={`${id}-tab-model`}
              className="pane"
            >
              <div className="pane__block">
                <h3 className="pane__title">Provider</h3>
                <div className="seg seg--wide" role="group" aria-label="Provider">
                  {PROVIDERS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`seg__btn${
                        entry.id === settings.provider ? " is-active" : ""
                      }`}
                      aria-pressed={entry.id === settings.provider}
                      onClick={() => onSetProvider(entry.id)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <p className="pane__hint">
                  Switching providers keeps this conversation and your memory.
                  Only the model that answers changes.
                </p>
              </div>

              <div className="pane__block">
                <div className="field__row">
                  <label className="field__label" htmlFor={`${id}-key`}>
                    {active.label} API key
                  </label>
                  <a
                    className="field__link"
                    href={active.keysUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Get a key
                    <ExternalLinkIcon size={11} />
                  </a>
                </div>
                <div className="field__group">
                  <KeyIcon size={15} className="field__icon" />
                  <input
                    id={`${id}-key`}
                    className="field__input"
                    type={reveal ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => onSetKey(settings.provider, event.target.value)}
                    placeholder={active.keyPlaceholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    maxLength={512}
                  />
                  <button
                    type="button"
                    className="field__action"
                    onClick={() => setReveal((value) => !value)}
                    aria-label={reveal ? "Hide key" : "Show key"}
                    title={reveal ? "Hide key" : "Show key"}
                  >
                    {reveal ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
                <p className="pane__hint">
                  {usingOwnKey ? (
                    <>Saved in this browser only and sent with each message.</>
                  ) : hasKey ? (
                    <>This site already has a {active.label} key — you don't need one.</>
                  ) : (
                    <>
                      No key here yet, so {active.label} can't answer. Paste one
                      above.
                    </>
                  )}
                </p>
                {usingOwnKey ? (
                  <div className="pane__between pane__between--start">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onSetKey(settings.provider, "")}
                    >
                      <TrashIcon size={14} />
                      Remove {active.label} key
                    </button>
                  </div>
                ) : null}
                <p className="pane__note">
                  Keys never leave this device except in the request to{" "}
                  {active.label}. Anyone with access to this browser can read
                  them, so don't use a shared computer.
                </p>
              </div>

              <div className="pane__block">
                <h3 className="pane__title">Model</h3>
                <p className="pane__hint">
                  The running model: <code className="code-inline">{settings.model}</code>
                </p>
                <ModelList
                  providerId={settings.provider}
                  model={settings.model}
                  onModel={onSetModel}
                />
              </div>
            </section>
          ) : null}

          {tab === "memory" ? (
            <section
              role="tabpanel"
              id={`${id}-panel-memory`}
              aria-labelledby={`${id}-tab-memory`}
              className="pane"
            >
              <div className="pane__block">
                <h3 className="pane__title">
                  <SparkIcon size={15} />
                  One memory, every model
                </h3>
                <p className="pane__hint">
                  Short facts Mira should always know. They are sent with every
                  message, so Groq, OpenAI and OpenRouter all read the same list.
                </p>

                <form className="memory-add" onSubmit={submitFact}>
                  <label className="sr-only" htmlFor={`${id}-fact`}>
                    Add a fact
                  </label>
                  <input
                    id={`${id}-fact`}
                    className="field__input"
                    value={fact}
                    onChange={(event) => setFact(event.target.value)}
                    placeholder="e.g. I live in India and prefer TypeScript"
                    maxLength={MAX_MEMORY_CHARS}
                  />
                  <button
                    type="submit"
                    className="btn btn--sm"
                    disabled={!fact.trim() || settings.memory.length >= MAX_MEMORY_ITEMS}
                  >
                    <PlusIcon size={14} />
                    Add
                  </button>
                </form>

                {settings.memory.length === 0 ? (
                  <p className="memory-empty">
                    Nothing remembered yet. Add a fact, or tap the bookmark on
                    any message you send.
                  </p>
                ) : (
                  <ul className="memory-list">
                    {settings.memory.map((item, index) => (
                      <li key={`${item}-${index}`} className="memory-item">
                        <span className="memory-item__text">{item}</span>
                        <button
                          type="button"
                          className="icon-btn icon-btn--sm"
                          onClick={() => onRemoveMemory(index)}
                          aria-label={`Forget: ${item}`}
                        >
                          <XIcon size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pane__between">
                  <span className="pane__count">
                    {settings.memory.length} of {MAX_MEMORY_ITEMS}
                  </span>
                  {settings.memory.length > 0 ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={onClearMemory}
                    >
                      Forget everything
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pane__block">
                <h3 className="pane__title">How Mira responds</h3>
                <div className="chips" role="group" aria-label="Tone">
                  {PERSONAS.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      className={`chip${settings.persona === persona.id ? " is-active" : ""}`}
                      aria-pressed={settings.persona === persona.id}
                      onClick={() => onPersona(persona.id)}
                      title={persona.note}
                    >
                      {settings.persona === persona.id ? (
                        <CheckIcon size={13} />
                      ) : null}
                      {persona.label}
                    </button>
                  ))}
                </div>

                <label className="field__label" htmlFor={`${id}-instructions`}>
                  Custom instructions
                </label>
                <textarea
                  id={`${id}-instructions`}
                  className="field__input field__textarea"
                  value={settings.instructions}
                  onChange={(event) => onInstructions(event.target.value)}
                  placeholder="e.g. Answer in bullet points. I'm a backend engineer, skip the basics."
                  rows={3}
                  maxLength={MAX_INSTRUCTIONS_CHARS}
                />
                <p className="pane__count">
                  {settings.instructions.length} / {MAX_INSTRUCTIONS_CHARS}
                </p>
              </div>
            </section>
          ) : null}

          {tab === "appearance" ? (
            <section
              role="tabpanel"
              id={`${id}-panel-appearance`}
              aria-labelledby={`${id}-tab-appearance`}
              className="pane"
            >
              <div className="pane__block">
                <h3 className="pane__title">Theme</h3>
                <div className="theme-grid" role="group" aria-label="Theme">
                  {THEMES.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`theme-card${
                          settings.theme === entry.id ? " is-active" : ""
                        }`}
                        aria-pressed={settings.theme === entry.id}
                        onClick={() => onTheme(entry.id)}
                      >
                        <Icon size={18} />
                        <span>{entry.label}</span>
                        {settings.theme === entry.id ? (
                          <CheckIcon size={14} className="theme-card__check" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <p className="pane__hint">
                  System follows your phone or laptop setting and changes live.
                </p>
              </div>

              <div className="pane__block">
                <h3 className="pane__title">Your data</h3>
                <div className="stack">
                  {confirm === "keys" ? (
                    <button
                      type="button"
                      className="btn btn--wide btn--danger"
                      onClick={() => {
                        onClearKeys();
                        setConfirm(null);
                      }}
                    >
                      <CheckIcon size={15} />
                      Tap again to remove all keys
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--wide"
                      onClick={() => setConfirm("keys")}
                    >
                      <KeyIcon size={15} />
                      Remove all API keys
                    </button>
                  )}

                  {confirm === "reset" ? (
                    <button
                      type="button"
                      className="btn btn--wide btn--danger"
                      onClick={() => {
                        onResetAll();
                        setConfirm(null);
                      }}
                    >
                      <CheckIcon size={15} />
                      Tap again to reset everything
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--wide btn--danger"
                      onClick={() => setConfirm("reset")}
                    >
                      <TrashIcon size={15} />
                      Reset settings and memory
                    </button>
                  )}
                </div>
                <p className="pane__hint" aria-live="polite">
                  {confirm
                    ? "Nothing is deleted until you tap the red button again."
                    : "Conversations are not deleted here — use the bin in the header or the conversations drawer for those."}
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
