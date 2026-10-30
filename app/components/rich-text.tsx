import { Fragment, type ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * Safe rendering of a small formatting syntax used in descriptions, tickets and replies:
 *   **bold**   *italic* or _italic_   - bullet item   1. numbered item   [text](https://link)
 * The text is turned into React elements (never HTML), so nothing a user types can run as code.
 * Plain text without these marks shows exactly as typed (line breaks kept).
 */
const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)$/.exec(part);
    if (link)
      return (
        <a key={k} href={link[2]} target="_blank" rel="noopener noreferrer nofollow" className="underline">
          {link[1]}
        </a>
      );
    // Keep single line breaks inside a paragraph.
    return part.split("\n").map((line, j, all) => (
      <Fragment key={`${k}-${j}`}>
        {line}
        {j < all.length - 1 && <br />}
      </Fragment>
    ));
  });
}

type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw);
    const number = /^\s*\d+[.)]\s+(.*)$/.exec(raw);
    const kind = bullet ? "ul" : number ? "ol" : null;
    if (kind) {
      flush();
      const last = out[out.length - 1];
      const item = (bullet ?? number)![1]!;
      if (last && last.kind === kind) last.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (!raw.trim()) flush();
    else para.push(raw);
  }
  flush();
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 [overflow-wrap:anywhere]", className)}>
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{inline(b.text, `p${i}`)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `u${i}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `o${i}-${j}`)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
