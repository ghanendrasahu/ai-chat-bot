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

function matches(chat, query) {
  const needle = query.toLowerCase();
  if ((chat.title || "").toLowerCase().includes(needle)) return true;
  return chat.messages.some((message) => message.text.toLowerCase().includes(needle));
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
  canClear,
  onNewChat,
  onClose,
  onSwitch,
  onDelete,
  onClear,
}) {
  const closeRef = useRef(null);
  const listId = useId();
  const [confirmId, setConfirmId] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) closeRef.current?.focus();
    else setQuery("");
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
