import { Fragment } from "react";
import { isSafeUrl, parseBlocks, parseInline } from "../lib/markdown.js";
import CopyButton from "./CopyButton.jsx";

function Inline({ text }) {
  return parseInline(text).map((token, index) => {
    const key = `i-${index}`;
    switch (token.type) {
      case "strong":
        return (
          <strong key={key}>
            <Inline text={token.value} />
          </strong>
        );
      case "em":
        return (
          <em key={key}>
            <Inline text={token.value} />
          </em>
        );
      case "del":
        return (
          <del key={key}>
            <Inline text={token.value} />
          </del>
        );
      case "code":
        return (
          <code key={key} className="md__code">
            {token.value}
          </code>
        );
      case "link":
        return isSafeUrl(token.href) ? (
          <a key={key} href={token.href} target="_blank" rel="noreferrer noopener">
            <Inline text={token.value} />
          </a>
        ) : (
          <span key={key}>{token.value}</span>
        );
      default:
        return <Fragment key={key}>{token.value}</Fragment>;
    }
  });
}

function CodeBlock({ lang, text }) {
  return (
    <figure className="code">
      <figcaption className="code__bar">
        <span className="code__lang">{lang || "code"}</span>
        <CopyButton text={text} label="Copy code" className="btn-copy btn-copy--code" />
      </figcaption>
      <pre className="code__pre">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

/**
 * Renders model output as a small, safe Markdown subset.
 * Everything becomes React elements - no HTML string is ever injected.
 */
export default function Markdown({ text }) {
  return (
    <div className="md">
      {parseBlocks(text).map((block, index) => {
        const key = `b-${index}`;
        switch (block.type) {
          case "code":
            return <CodeBlock key={key} lang={block.lang} text={block.text} />;
          case "heading": {
            // Always an h2 so the document outline stays contiguous under the
            // page's single h1; depth is carried by the class, not the tag.
            return (
              <h2 key={key} className={`md__heading md__heading--${block.level}`}>
                <Inline text={block.text} />
              </h2>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="md__quote">
                <Inline text={block.text} />
              </blockquote>
            );
          case "rule":
            return <hr key={key} className="md__rule" />;
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className="md__list">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    <Inline text={item.text} />
                    {item.children.length > 0 ? (
                      <ul className="md__list md__list--nested">
                        {item.children.map((child, childIndex) => (
                          <li key={`${key}-${itemIndex}-${childIndex}`}>
                            <Inline text={child} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </Tag>
            );
          }
          default:
            return (
              <p key={key} className="md__p">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
