import ModelChip from "./ModelChip.jsx";
import ModelMenu from "./ModelMenu.jsx";
import StatusPill from "./StatusPill.jsx";
import { MenuIcon, SettingsIcon, TrashIcon } from "./Icons.jsx";

export default function Header({
  status,
  provider,
  model,
  settings,
  serverProviders,
  modelOpen,
  onToggleModel,
  onCloseModel,
  onOpenSettings,
  onSetProvider,
  onSetModel,
  canClear,
  onClear,
  onToggleDrawer,
}) {
  return (
    <header className="header">
      <div className="header__brand">
        <button
          type="button"
          className="icon-btn header__menu"
          onClick={onToggleDrawer}
          aria-label="Open conversations"
          title="Conversations"
        >
          <MenuIcon size={20} />
        </button>
        <img
          className="header__mark"
          src="/mira-mark-96.jpg"
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
        <StatusPill status={status} provider={provider} model={model} />
        <ModelChip
          model={settings.model}
          open={modelOpen}
          onClick={onToggleModel}
          controls="model-menu"
        />
        {canClear ? (
          <button
            type="button"
            className="icon-btn header__clear"
            onClick={onClear}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <TrashIcon size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      <ModelMenu
        open={modelOpen}
        onClose={onCloseModel}
        provider={settings.provider}
        model={settings.model}
        keys={settings.keys}
        serverProviders={serverProviders}
        onProvider={onSetProvider}
        onModel={onSetModel}
        onOpenSettings={onOpenSettings}
      />
    </header>
  );
}
