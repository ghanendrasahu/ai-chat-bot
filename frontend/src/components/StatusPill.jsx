const LABELS = {
  checking: "Checking",
  online: "Ready",
  degraded: "No model key",
  offline: "Offline",
};

export default function StatusPill({ status, provider, model }) {
  const label = LABELS[status] ?? "Unknown";
  const detail =
    status === "online" && model
      ? `Running ${model}${provider ? ` via ${provider}` : ""}`
      : undefined;

  return (
    <span className={`status status--${status}`} title={detail} role="status">
      <span className="status__dot" aria-hidden="true" />
      <span className="status__label">{label}</span>
    </span>
  );
}
