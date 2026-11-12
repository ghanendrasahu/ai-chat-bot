import { CheckIcon } from "./Icons.jsx";
import { getProvider } from "../lib/providers.js";

/**
 * Suggested models for one provider. A hand-typed id that is not in the
 * catalog is shown as its own selected row, so the active model is never
 * invisible.
 */
export default function ModelList({ providerId, model, onModel, firstItemRef }) {
  const suggested = getProvider(providerId).models;
  const isSuggested = suggested.some((entry) => entry.id === model);

  const rows = isSuggested
    ? suggested
    : [{ id: model, note: "Custom id" }, ...suggested];

  return (
    <ul className="model-list">
      {rows.map((entry, index) => {
        const isActive = entry.id === model;
        return (
          <li key={entry.id}>
            <button
              type="button"
              ref={index === 0 ? firstItemRef : undefined}
              className={`model-item${isActive ? " is-active" : ""}`}
              onClick={() => onModel(entry.id)}
              aria-pressed={isActive}
            >
              <span className="model-item__text">
                <span className="model-item__id">{entry.id}</span>
                {entry.note ? (
                  <span className="model-item__note">{entry.note}</span>
                ) : null}
              </span>
              {isActive ? <CheckIcon size={15} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
