import { memo, useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton.jsx";
import Markdown from "./Markdown.jsx";
import {
  AlertIcon,
  BookmarkIcon,
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  EditIcon,
  MoreIcon,
  PinIcon,
  RefreshIcon,
  TrashIcon,
  XIcon,
} from "./Icons.jsx";
import { formatTime } from "../lib/time.js";
import { shortModelName } from "../lib/providers.js";

const MAX_EDIT_CHARS = 2000;

function MenuItem({ icon, children, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      className={`msg-menu__item${danger ? " msg-menu__item--danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Message({
  message,
  onRetry,
  onRegenerate,
  onSaveMemory,
  onEdit,
  onDelete,
  onPin,
  onSwitchVariant,
  onEditSaved,
  isLast,
  pending,
}) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";
  const isStopped = message.status === "stopped";

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const editRef = useRef(null);
  const copiedTimer = useRef(null);
  const variants = message.variants ?? [];
  const variantIndex = Number.isFinite(message.variantIndex) ? message.variantIndex : 0;

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Close the actions menu on an outside tap or Escape, and put focus back on
  // the button that opened it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    menuRef.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!editing) return;
    editRef.current?.focus();
    editRef.current?.select();
  }, [editing]);

  if (isStopped && message.text === "Stopped generating.") {
    return (
      <p className="notice">
        <span>{message.text}</span>
      </p>
    );
  }

  const closeMenu = () => setMenuOpen(false);

  const copy = async () => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const startEdit = () => {
    closeMenu();
    setDraft(message.text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    triggerRef.current?.focus();
  };

  const saveEdit = () => {
    if (!draft.trim() || draft.length > MAX_EDIT_CHARS) return;
    if (onEdit(message.id, draft)) {
      setEditing(false);
      onEditSaved?.();
    }
  };

  const remove = () => {
    closeMenu();
    onDelete(message.id);
  };

  const pin = () => {
    closeMenu();
    onPin(message.id);
  };

  const regenerate = () => {
    closeMenu();
    onRegenerate();
  };

  const menu = (
    <div className="msg__actions">
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn icon-btn--sm msg__menuBtn"
        aria-label="Message actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        disabled={isStreaming}
      >
        <MoreIcon size={16} />
      </button>
      {menuOpen ? (
        <div
          className="msg-menu"
          role="menu"
          aria-label="Message actions"
          ref={menuRef}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = [...menuRef.current.querySelectorAll("button:not(:disabled)")];
            const current = items.indexOf(document.activeElement);
            const next =
              event.key === "ArrowDown"
                ? (current + 1) % items.length
                : (current - 1 + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          <MenuItem
            icon={copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy"}
          </MenuItem>
          {isUser ? (
            <MenuItem icon={<EditIcon size={14} />} onClick={startEdit} disabled={pending}>
              Edit and resend
            </MenuItem>
          ) : null}
          {isLast && !isUser && !isError ? (
            <MenuItem
              icon={<RefreshIcon size={14} />}
              onClick={regenerate}
              disabled={pending || isStreaming}
            >
              Regenerate
            </MenuItem>
          ) : null}
          {!isStreaming ? (
            <MenuItem icon={<PinIcon size={14} />} onClick={pin}>
              {message.pinned ? "Unpin" : "Pin"}
            </MenuItem>
          ) : null}
          <MenuItem
            icon={<TrashIcon size={14} />}
            onClick={remove}
            disabled={pending}
            danger
          >
            Delete message
          </MenuItem>
        </div>
      ) : null}
    </div>
  );

  const bubble = editing ? (
    <div className="msg-edit">
      <label className="sr-only" htmlFor={`edit-${message.id}`}>
        Edit your message
      </label>
      <textarea
        id={`edit-${message.id}`}
        ref={editRef}
        className="field__input field__textarea msg-edit__input"
        value={draft}
        maxLength={MAX_EDIT_CHARS}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            saveEdit();
          }
        }}
      />
      <div className="msg-edit__actions">
        <span className="msg-edit__count">
          {draft.length} / {MAX_EDIT_CHARS}
        </span>
        <button type="button" className="btn btn--sm" onClick={cancelEdit}>
          <XIcon size={13} />
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={saveEdit}
          disabled={!draft.trim() || draft.length > MAX_EDIT_CHARS || pending}
        >
          <CheckIcon size={13} />
          Save and resend
        </button>
      </div>
    </div>
  ) : (
    <div className={`bubble${isError ? " bubble--error" : ""}`}>
      {isError && !message.error ? (
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
        <>
          <Markdown text={message.text} />
          {isStreaming ? <span className="stream-caret" aria-hidden="true" /> : null}
          {isError && message.error ? (
            <div className="bubble__recover" role="status">
              <AlertIcon size={14} />
              <span>{message.error}</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onRetry(message.id)}
              >
                <RefreshIcon size={13} />
                Try again
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <article
      className={`msg ${isUser ? "msg--user" : "msg--mira"}`}
      aria-busy={isStreaming || undefined}
    >
      {isUser ? null : (
        <span className="msg__avatar" aria-hidden="true">
          <BotIcon size={16} />
        </span>
      )}

      <div className="msg__body">
        {bubble}

        {editing ? null : (
          <div className="msg__meta">
            <span className="msg__time">{formatTime(message.at)}</span>

            {isStopped ? <span className="msg__flag">Stopped</span> : null}

            {message.pinned ? (
              <span className="msg__flag" title="Always kept in context">
                <PinIcon size={11} />
                Pinned
              </span>
            ) : null}

            {isUser && onSaveMemory ? (
              <button
                type="button"
                className="btn-copy btn-copy--icon"
                onClick={() => onSaveMemory(message.text)}
                aria-label="Save this message to memory"
                title="Save to memory"
              >
                <BookmarkIcon size={13} />
              </button>
            ) : null}

            {!isUser && !isError ? (
              <>
                {message.model ? (
                  <span className="msg__model" title={`Written by ${message.model}`}>
                    {shortModelName(message.model)}
                  </span>
                ) : null}
                <CopyButton text={message.text} label="Copy" />
              </>
            ) : null}

            {isLast && !isUser && variants.length > 1 ? (
              <div className="variants" role="group" aria-label="Reply versions">
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => onSwitchVariant(message.id, variantIndex - 1)}
                  disabled={variantIndex <= 0 || pending}
                  aria-label="Previous reply version"
                >
                  <ChevronLeftIcon size={15} />
                </button>
                <span className="variants__count" aria-live="polite">
                  {variantIndex + 1}/{variants.length}
                </span>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => onSwitchVariant(message.id, variantIndex + 1)}
                  disabled={variantIndex >= variants.length - 1 || pending}
                  aria-label="Next reply version"
                >
                  <ChevronRightIcon size={15} />
                </button>
              </div>
            ) : null}

            {menu}
          </div>
        )}
      </div>
    </article>
  );
}

// Finished messages keep their object identity while a reply streams, so memo
// stops the whole thread from re-rendering once per animation frame.
export default memo(Message);
