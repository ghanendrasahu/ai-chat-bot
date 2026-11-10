import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons.jsx";

export default function CopyButton({ text, label = "Copy", className = "btn-copy" }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
