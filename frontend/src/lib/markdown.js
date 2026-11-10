/**
 * A deliberately small Markdown subset parser.
 *
 * It returns plain data (no JSX) so it can be reasoned about and unit tested
 * on its own. The renderer in components/Markdown.jsx turns these tokens into
 * React elements - it never touches dangerouslySetInnerHTML, so model output
 * can never inject markup.
 */

const FENCE = /^```([A-Za-z0-9_+-]*)\s*$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;

/** Split raw model output into block-level structures. */
export function parseBlocks(source) {
  const lines = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(FENCE);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang: fence[1] || "", text: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      const body = [];
      while (i < lines.length) {
        const m = lines[i].match(QUOTE);
        if (!m) break;
        body.push(m[1]);
        i += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n") });
      continue;
    }

    const isOrdered = ORDERED.test(line);
    if (isOrdered || BULLET.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = isOrdered ? lines[i].match(ORDERED) : lines[i].match(BULLET);
        if (!m) break;
        const indent = m[1].length;
        const text = m[3];
        if (indent === 0) {
          items.push({ text, children: [] });
        } else {
          const last = items[items.length - 1];
          if (last) last.children.push(text);
          else items.push({ text, children: [] });
        }
        i += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    const body = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current.trim()) break;
      if (
        FENCE.test(current) ||
        HEADING.test(current) ||
        RULE.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        ORDERED.test(current)
      ) {
        break;
      }
      body.push(current);
      i += 1;
    }
    if (body.length === 0) {
      i += 1;
      continue;
    }
    blocks.push({ type: "paragraph", text: body.join("\n") });
  }

  return blocks;
}

/** Split one line of text into inline tokens. */
export function parseInline(text) {
  const tokens = [];
  const source = String(text ?? "");
  INLINE.lastIndex = 0;
  let last = 0;
  let match;

  while ((match = INLINE.exec(source)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", value: source.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      tokens.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      tokens.push({ type: "strong", value: token.slice(2, -2) });
    } else if (token.startsWith("~~")) {
      tokens.push({ type: "del", value: token.slice(2, -2) });
    } else if (token.startsWith("[")) {
      const parts = token.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      tokens.push({ type: "link", value: parts?.[1] ?? token, href: parts?.[2] ?? "" });
    } else {
      tokens.push({ type: "em", value: token.slice(1, -1) });
    }
    last = match.index + token.length;
  }

  if (last < source.length) {
    tokens.push({ type: "text", value: source.slice(last) });
  }
  return tokens;
}

/** Only real web and mail links become anchors - never javascript: URLs. */
export function isSafeUrl(href) {
  return /^(https?:\/\/|mailto:)/i.test(String(href ?? ""));
}
