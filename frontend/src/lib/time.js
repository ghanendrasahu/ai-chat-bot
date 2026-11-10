const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

export function formatTime(timestamp) {
  if (!timestamp) return "";
  try {
    return time.format(new Date(timestamp));
  } catch {
    return "";
  }
}

/** "Today, 3:24 PM" / "Yesterday, 9:10 AM" / "Mar 12, 8:00 PM" */
export function formatChatTime(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const stamp = time.format(d);
  if (sameDay) return `Today, ${stamp}`;
  if (isYesterday) return `Yesterday, ${stamp}`;
  return `${date.format(d)}, ${stamp}`;
}
