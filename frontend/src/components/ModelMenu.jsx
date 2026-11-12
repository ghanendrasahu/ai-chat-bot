import { useEffect, useId, useRef, useState } from "react";
import {
  ExternalLinkIcon,
  SettingsIcon,
  XIcon,
} from "./Icons.jsx";
import ModelList from "./ModelList.jsx";
import { PROVIDERS, getProvider } from "../lib/providers.js";

/**
 * Quick model switch, anchored under the header chip. Switching providers
 * here restores the model that provider was last used with; the conversation
 * and the shared memory are untouched.
 */
export default function ModelMenu({
  open,
  onClose,
  provider,
  model,
  keys,
  serverProviders,
  onProvider,
  onModel,
  onOpenSettings,
}) {
  const menuRef = useRef(null);
  const firstItemRef = useRef(null);
  const [custom, setCustom] = useState("");
  const listId = useId();

  // Only one of these can be open at a time; Escape and an outside press
  // both close it, and the trigger itself is excluded so clicking it toggles.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (event.target.closest(".model-menu, .model-chip")) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setCustom("");
  }, [open, provider]);

  if (!open) return null;

  const active = getProvider(provider);
  const hasKey = (id) => Boolean(keys?.[id]) || Boolean(serverProviders?.[id]);
  const suggested = active.models.some((entry) => entry.id === model);

  const commitCustom = () => {
    const next = custom.trim();
    if (!next) return;
    onModel(next);
    setCustom("");
    onClose();
  };

  return (
    <div
      className="model-menu"
      id={listId}
      role="dialog"
      aria-modal="false"
      aria-label="Choose a model"
      ref={menuRef}
    >
      <div className="model-menu__head">
        <p className="model-menu__title">Model</p>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={onClose}
          aria-label="Close model menu"
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className="seg" role="group" aria-label="Provider">
        {PROVIDERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`seg__btn${entry.id === provider ? " is-active" : ""}`}
            aria-pressed={entry.id === provider}
            onClick={() => onProvider(entry.id)}
          >
            {entry.label}
            {hasKey(entry.id) ? null : (
              <span className="seg__flag" title="No key yet">
                !
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="model-menu__note">
        {hasKey(provider) ? (
          <>Ready to chat</>
        ) : (
          <>
            No key for {active.label} yet.{" "}
            <a href={active.keysUrl} target="_blank" rel="noreferrer noopener">
              Get one
              <ExternalLinkIcon size={11} />
            </a>
          </>
        )}
        <span className="model-menu__sep">·</span>
        {active.note}
      </p>

      <ModelList
        providerId={provider}
        model={model}
        firstItemRef={firstItemRef}
        onModel={(next) => {
          onModel(next);
          onClose();
        }}
      />

      <div className="model-menu__custom">
        <label className="field__label" htmlFor="custom-model">
          Custom model id
        </label>
        <div className="model-menu__row">
          <input
            id="custom-model"
            className="field__input"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCustom();
              }
            }}
            placeholder={suggested ? "Any id this provider offers" : model}
            autoComplete="off"
            spellCheck="false"
            maxLength={120}
          />
          <button
            type="button"
            className="btn btn--sm"
            onClick={commitCustom}
            disabled={!custom.trim()}
          >
            Use
          </button>
        </div>
      </div>

      <button
        type="button"
        className="model-menu__more"
        onClick={onOpenSettings}
      >
        <SettingsIcon size={15} />
        Keys, memory and appearance
      </button>
    </div>
  );
}
