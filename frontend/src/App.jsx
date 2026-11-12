import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Composer from "./components/Composer.jsx";
import Drawer from "./components/Drawer.jsx";
import Header from "./components/Header.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";
import Thread from "./components/Thread.jsx";
import Toast from "./components/Toast.jsx";
import { useChat } from "./hooks/useChat.js";
import { deriveStatus, useHealth } from "./hooks/useHealth.js";
import { useSettings } from "./hooks/useSettings.js";
import { shortModelName } from "./lib/providers.js";
import { providerLabel } from "./lib/settings.js";

const UNDO_WINDOW_MS = 8000;
const TOAST_MS = 3500;

export default function App() {
  const {
    settings,
    apiKey,
    requestConfig,
    setProvider,
    setModel,
    setKey,
    addMemory,
    removeMemory,
    clearMemory,
    clearKeys,
    resetAll,
    update,
  } = useSettings();

  const health = useHealth();

  const {
    chats,
    activeId,
    messages,
    pending,
    send,
    retry,
    regenerate,
    clear,
    restore,
    newChat,
    switchChat,
    deleteChat,
    stop,
  } = useChat({
    // A reply that arrives is proof the backend is up, whatever the last
    // health probe said.
    onResult: health.report,
    config: requestConfig,
  });

  const [toast, setToast] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("model");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.ttl ?? TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // A key of the user's own makes the model ready even on a server that has
  // no key configured; without one, fall back to what the server reports.
  const serverHasProvider = health.providers
    ? Boolean(health.providers[settings.provider])
    : Boolean(health.ready);
  const configured = Boolean(apiKey) || serverHasProvider;
  const status = deriveStatus({
    probe: health.probe,
    chat: health.chat,
    ready: configured,
  });

  const handleSend = useCallback((text) => send(text), [send]);

  const handleClear = useCallback(() => {
    const snapshot = messages;
    clear();
    setToast({
      message: "Conversation cleared",
      actionLabel: "Undo",
      onAction: () => restore(snapshot),
      ttl: UNDO_WINDOW_MS,
    });
  }, [clear, messages, restore]);

  const handleSaveMemory = useCallback(
    (text) => {
      const added = addMemory(text);
      setToast({
        message: added
          ? "Saved to shared memory"
          : "That is already in memory (or memory is full)",
      });
    },
    [addMemory]
  );

  const handleModel = useCallback(
    (model) => {
      setModel(model);
      setToast({ message: `Model changed to ${shortModelName(model)}` });
    },
    [setModel]
  );

  const handleProvider = useCallback(
    (provider) => {
      setProvider(provider);
      setToast({ message: `Switched to ${providerLabel(provider)}` });
    },
    [setProvider]
  );

  const openSettings = useCallback((tab = "model") => {
    setModelOpen(false);
    setDrawerOpen(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const toggleDrawer = useCallback(() => {
    setModelOpen(false);
    setDrawerOpen((open) => !open);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleModel = useCallback(() => setModelOpen((open) => !open), []);
  const closeModel = useCallback(() => setModelOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const resetEverything = useCallback(() => {
    resetAll();
    setToast({ message: "Settings and memory reset" });
  }, [resetAll]);

  return (
    <div className="app">
      <a className="skip-link" href="#composer-input">
        Skip to the message box
      </a>
      <div className="chat">
        <Header
          status={status}
          provider={health.provider}
          model={health.model}
          settings={settings}
          serverProviders={health.providers}
          modelOpen={modelOpen}
          onToggleModel={toggleModel}
          onCloseModel={closeModel}
          onOpenSettings={() => openSettings("model")}
          onSetProvider={handleProvider}
          onSetModel={handleModel}
          canClear={messages.length > 0}
          onClear={handleClear}
          onToggleDrawer={toggleDrawer}
        />

        <Thread
          messages={messages}
          pending={pending}
          model={settings.model}
          provider={settings.provider}
          onPick={handleSend}
          onRetry={retry}
          onRegenerate={regenerate}
          onSaveMemory={handleSaveMemory}
          memoryCount={settings.memory.length}
        />

        <Composer onSend={handleSend} onStop={stop} pending={pending} />

        <Toast
          message={toast?.message ?? null}
          actionLabel={toast?.actionLabel}
          onAction={toast?.onAction}
        />

        <Drawer
          open={drawerOpen}
          chats={chats}
          activeId={activeId}
          canClear={messages.length > 0}
          onNewChat={() => {
            newChat();
            closeDrawer();
          }}
          onClose={closeDrawer}
          onSwitch={switchChat}
          onDelete={deleteChat}
          onClear={handleClear}
        />

        <SettingsDialog
          open={settingsOpen}
          initialTab={settingsTab}
          settings={settings}
          serverProviders={health.providers}
          onClose={closeSettings}
          onSetProvider={handleProvider}
          onSetModel={handleModel}
          onSetKey={setKey}
          onAddMemory={(text) => {
            const added = addMemory(text);
            if (added) setToast({ message: "Memory updated" });
            return added;
          }}
          onRemoveMemory={removeMemory}
          onClearMemory={clearMemory}
          onClearKeys={() => {
            clearKeys();
            setToast({ message: "All API keys removed from this browser" });
          }}
          onResetAll={resetEverything}
          onInstructions={(instructions) => update({ instructions })}
          onPersona={(persona) => update({ persona })}
          onTheme={(theme) => update({ theme })}
        />
      </div>
    </div>
  );
}
