const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTime(timestamp) {
  if (!timestamp) return "";
  try {
    return time.format(new Date(timestamp));
  } catch {
    return "";
  }
}
