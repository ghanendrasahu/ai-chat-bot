import { useEffect, useId, useRef, useState } from "react";
import {
  ChatIcon,
  CheckIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "./Icons.jsx";
import { formatChatTime } from "../lib/time.js";
import { PERSONAS } from "../lib/providers.js";

const MAX_TITLE_CHARS = 60;
const MAX_CHAT_INSTRUCTIONS = 1000;

function matches(chat, query) {
  const needle = query.toLowerCase();
  if ((chat.title || "").toLowerCase().includes(needle)) return true;
  return chat.messages.some((message) => message.text.toLowerCase().includes(needle));
}

/**
 * Rename and per-chat behaviour. Mounted with the chat id as its key, so
 * switching chats resets the fields without an effect that could overwrite
 * what the user is typing.
 */
function ChatSettings({ chat, onRename, onSetPersona, onSetInstructions }) {
  const id = useId();
  const [title, setTitle] = useState(chat.title === "New chat" ? "" : chat.title);
  const [persona, setPersona] = useState(chat.persona ?? "");
  const [instructions, setInstructions] = useState(chat.instructions ?? "");
  const [saved, setSaved] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    if (title.trim()) onRename(chat.id, title);
    onSetPersona(chat.id, persona || null);
    onSetInstructions(chat.id, instructions);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form className="drawer__chatSettings" onSubmit={submit}>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-title`}>
          Conversation title
        </label>
        <input
          id={`${id}-title`}
          className="field__input"
          value={title}
          maxLength={MAX_TITLE_CHARS}
          placeholder="New chat"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-persona`}>
          Tone for this conversation
        </label>
        <select
          id={`${id}-persona`}
          className="field__input"
          value={persona}
          onChange={(event) => setPersona(event.target.value)}
        >
          <option value="">Use the global tone</option>
          {PERSONAS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-instructions`}>
          Instructions for this conversation
        </label>
        <textarea
          id={`${id}-instructions`}
          className="field__input field__textarea"
          rows={3}
          value={instructions}
          maxLength={MAX_CHAT_INSTRUCTIONS}
          placeholder="e.g. Only use SQL examples"
          onChange={(event) => setInstructions(event.target.value)}
        />
        <span className="field__count">
          {instructions.length} / {MAX_CHAT_INSTRUCTIONS}
        </span>
      </div>

      <div className="drawer__chatSettingsFoot">
        {saved ? (
          <span className="drawer__saved" role="status">
            <CheckIcon size={13} />
            Saved
          </span>
        ) : (
          <span className="drawer__saved" />
        )}
        <button type="submit" className="btn btn--sm btn--primary">
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * Slide-in history for conversations. On small screens it owns the screen; on
 * desktop it overlays the chat area. Closed by the scrim, Escape, the close
 * button, or picking a chat. Deleting a chat takes a second tap to confirm,
 * so it is never a one-mis-tap accident.
 */
export default function Drawer({
  open,
  chats,
  activeId,
  activeChat,
  canClear,
  onNewChat,
  onClose,
  onSwitch,
  onDelete,
  onClear,
  onRename,
  onSetChatPersona,
  onSetChatInstructions,
}) {
  const closeRef = useRef(null);
  const listId = useId();
  const [confirmId, setConfirmId] = useState(null);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (open) closeRef.current?.focus();
    else {
      setQuery("");
      setSettingsOpen(false);
    }
  }, [open]);

  // Cancel the pending delete after a few seconds or on Escape/close.
  useEffect(() => {
    if (!confirmId) return undefined;
    const timer = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Escape" && confirmId) {
        setConfirmId(null);
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, confirmId]);

  if (!open) return null;

  const searching = query.trim().length > 0;
  const visible = searching ? chats.filter((chat) => matches(chat, query.trim())) : chats;

  return (
    <div className="drawer-root" role="presentation">
      <button
        type="button"
        className="drawer-scrim"
        aria-label="Close conversations"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Conversations"
      >
        <div className="drawer__head">
          <h2 className="drawer__title">Conversations</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close conversations"
          >
            <XIcon size={18} />
          </button>
        </div>

        <button type="button" className="drawer__new" onClick={onNewChat}>
          <PlusIcon size={16} />
          New conversation
        </button>

        {activeChat ? (
          <div className="drawer__settingsBlock">
            <button
              type="button"
              className="drawer__action"
              aria-expanded={settingsOpen}
              aria-controls={`${listId}-settings`}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <ChatIcon size={15} />
              Conversation settings
            </button>
            {settingsOpen ? (
              <div id={`${listId}-settings`}>
                <ChatSettings
                  key={activeChat.id}
                  chat={activeChat}
                  onRename={onRename}
                  onSetPersona={onSetChatPersona}
                  onSetInstructions={onSetChatInstructions}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {chats.length > 0 ? (
          <div className="drawer__search">
            <SearchIcon size={15} className="drawer__searchIcon" />
            <label className="sr-only" htmlFor={`${listId}-search`}>
              Search conversations
            </label>
            <input
              id={`${listId}-search`}
              className="drawer__searchInput"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages"
              autoComplete="off"
              enterKeyHint="search"
            />
            {searching ? (
              <button
                type="button"
                className="drawer__searchClear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <XIcon size={13} />
              </button>
            ) : null}
          </div>
        ) : null}

        {canClear ? (
          <button type="button" className="drawer__action" onClick={onClear}>
            <TrashIcon size={15} />
            Clear this conversation
          </button>
        ) : null}

        {chats.length === 0 ? (
          <p className="drawer__empty">
            No conversations yet. Start one and it will show up here.
          </p>
        ) : visible.length === 0 ? (
          <p className="drawer__empty">Nothing matches “{query.trim()}”.</p>
        ) : (
          <ul className="drawer__list" id={listId}>
            {visible.map((chat) => {
              const isActive = chat.id === activeId;
              const count = chat.messages.length;
              return (
                <li key={chat.id} className={`drawer__item${isActive ? " is-active" : ""}`}>
                  <button
                    type="button"
                    className="drawer__select"
                    onClick={() => {
                      onSwitch(chat.id);
                      onClose();
                    }}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <ChatIcon size={16} className="drawer__itemIcon" />
                    <span className="drawer__meta">
                      <span className="drawer__chatTitle">{chat.title || "New chat"}</span>
                      <span className="drawer__chatInfo">
                        {count} {count === 1 ? "message" : "messages"} ·{" "}
                        {formatChatTime(chat.at)}
                      </span>
                    </span>
                  </button>
                  {confirmId === chat.id ? (
                    <button
                      type="button"
                      className="drawer__delete drawer__delete--confirm"
                      onClick={() => {
                        onDelete(chat.id);
                        setConfirmId(null);
                      }}
                      aria-label="Confirm delete"
                      autoFocus
                    >
                      <CheckIcon size={16} />
                      <span>Delete?</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="drawer__delete"
                      onClick={() => setConfirmId(chat.id)}
                      aria-label={`Delete conversation: ${chat.title || "New chat"}`}
                    >
                      <TrashIcon size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
