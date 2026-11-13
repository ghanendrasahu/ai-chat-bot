/**
 * A deliberately small heuristic for "this sounds worth remembering".
 *
 * It only offers a suggestion - nothing is ever saved without a tap. The
 * patterns cover durable personal facts (where someone lives, what they do)
 * and preferences, which are the things a remembered fact is useful for.
 */

const DURABLE = [
  /\b(?:i live in|i'?m based in|i am based in|i'?m from|i am from|i grew up in)\b/i,
  /\b(?:i work (?:at|for|with)|i'?m working (?:at|for|with)|i study|i'?m studying)\b/i,
  /\b(?:i'?m a|i am a|my name is|call me|my pronouns are)\b/i,
  /\b(?:i prefer|i like|i love|i hate|i don'?t like|i always|i never|i usually)\b/i,
  /\b(?:i use|i'?m learning|i am learning|i want to learn|my stack is)\b/i,
  /\bmy (?:birthday|time ?zone|job|role|team|dog|cat|kid|partner|wife|husband)\b/i,
];

const SENSITIVE =
  /\b(?:password|passcode|api[ -]?key|secret|token|credit card|card number|ssn|social security|seed phrase|private key)\b/i;

const QUESTION_START =
  /^(?:do|does|did|can|could|would|will|should|what|why|how|when|where|who|is|are|am|have|has)\b/i;

function normalize(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim()
    .slice(0, 300);
}

/**
 * Returns a fact worth offering to remember, or null. The caller shows a
 * dismissible chip; this function never writes anything.
 */
export function suggestMemory(text, { memory = [], maxItems = 40 } = {}) {
  const clean = normalize(text);
  if (clean.length < 12 || clean.length > 180) return null;
  if (clean.endsWith("?")) return null;
  if (QUESTION_START.test(clean)) return null;
  if (SENSITIVE.test(clean)) return null;
  if (!DURABLE.some((pattern) => pattern.test(clean))) return null;

  const fingerprint = clean.toLowerCase();
  if (memory.some((item) => item.toLowerCase() === fingerprint)) return null;
  if (memory.length >= maxItems) return null;

  return clean;
}
