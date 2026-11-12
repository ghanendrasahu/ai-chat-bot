import { ChevronDownIcon } from "./Icons.jsx";
import { shortModelName } from "../lib/providers.js";

/**
 * The header control that names the active model and opens the picker. It is
 * the one place a model change starts, mirroring how ChatGPT and Gemini put
 * the model at the top of the conversation.
 */
export default function ModelChip({ model, open, onClick, controls }) {
  return (
    <button
      type="button"
      className={`model-chip${open ? " is-open" : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-haspopup="dialog"
      title={`Model: ${model}. Change it.`}
    >
      <span className="model-chip__name">{shortModelName(model)}</span>
      <ChevronDownIcon size={14} />
    </button>
  );
}
