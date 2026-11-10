import StatusPill from "./StatusPill.jsx";
import { TrashIcon } from "./Icons.jsx";

export default function Header({ health, canClear, onClear }) {
  return (
    <header className="header">
      <div className="header__brand">
        <img
          className="header__mark"
          src="/mira-mark.jpg"
          alt=""
          width="38"
          height="38"
          fetchPriority="high"
        />
        <div className="header__names">
          <h1 className="header__title" translate="no">
            Mira
          </h1>
          <p className="header__subtitle">AI chat companion</p>
        </div>
      </div>

      <div className="header__actions">
        <StatusPill
          status={health.status}
          provider={health.provider}
          model={health.model}
        />
        {canClear ? (
          <button
            type="button"
            className="icon-btn"
            onClick={onClear}
            disabled={!canClear}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <TrashIcon size={16} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
