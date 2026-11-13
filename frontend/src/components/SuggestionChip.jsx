import { SparkIcon, XIcon, PlusIcon } from "./Icons.jsx";

/**
 * A suggestion, never an action: the user decides whether a fact is worth
 * remembering. Dismissing it keeps it out of the way for the rest of the
 * session; accepting adds it to the shared memory list.
 */
export default function SuggestionChip({ fact, onAccept, onDismiss }) {
  return (
    <div className="suggest-chip" role="status">
      <SparkIcon size={15} className="suggest-chip__icon" />
      <span className="suggest-chip__text">
        <span className="suggest-chip__label">Remember this?</span>
        <span className="suggest-chip__fact">{fact}</span>
      </span>
      <button type="button" className="btn btn--sm" onClick={onAccept}>
        <PlusIcon size={13} />
        Remember
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        onClick={onDismiss}
        aria-label="Dismiss memory suggestion"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}
