/**
 * Turns a failure into something worth showing a person.
 *
 * The branch is chosen by HTTP status, not by matching the error text - the
 * server's wording is free to change without silently breaking the UI.
 */
export function describeError(error) {
  if (!error) return "The reply didn’t come through. Try again in a moment.";

  if (error.name === "AbortError") {
    return "That took longer than expected. Try again.";
  }

  const status = error.status;
  if (typeof status !== "number") {
    if (/failed to fetch|networkerror|load failed/i.test(error.message || "")) {
      return "Couldn’t reach the server. Check your connection and try again.";
    }
    return "The reply didn’t come through. Try again in a moment.";
  }

  switch (status) {
    case 400:
      return "That message couldn’t be sent. Keep it under 2000 characters and try again.";
    case 401:
      return "This chat is locked — the server hasn’t been given an access token.";
    case 403:
      return "This chat can’t be reached from this address.";
    case 413:
      return "That message is too long to send. Shorten it and try again.";
    case 429:
      return "You’ve sent a lot of messages. Wait a minute, then try again.";
    case 502:
      return "Mira’s AI service didn’t answer. Try again in a moment.";
    case 503:
      return "Mira isn’t available right now. Please try again later.";
    default:
      return status >= 500
        ? "Mira is having trouble answering. Try again in a moment."
        : "The reply didn’t come through. Try again in a moment.";
  }
}
