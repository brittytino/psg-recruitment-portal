import { Bold, Eye, Italic, Link2, List, ListOrdered, Pencil } from "lucide-react";
import { useRef, useState, type TextareaHTMLAttributes } from "react";
import { RichText } from "~/components/rich-text";
import { cn } from "~/lib/utils";

/**
 * Text box with a formatting toolbar (bold, italic, lists, link) and a preview. It stores plain
 * text with simple marks (**bold**, _italic_, "- " lists), shown by <RichText>. Works as a normal
 * form field: the value is submitted under `name`. Ctrl/Cmd+B and Ctrl/Cmd+I also work.
 */
type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "defaultValue"> & {
  name: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  invalid?: boolean;
};

export function RichTextEditor({
  name,
  defaultValue = "",
  value,
  onValueChange,
  invalid,
  className,
  ...rest
}: Props) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const [tab, setTab] = useState<"write" | "preview">("write");
  const ta = useRef<HTMLTextAreaElement>(null);

  /** Wraps the selection (or a placeholder word) with marks, keeping the selection on the text. */
  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const chosen = text.slice(s, e) || placeholder;
    const next = text.slice(0, s) + before + chosen + after + text.slice(e);
    set(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + chosen.length);
    });
  };

  /** Turns the selected lines into a list (or adds a first item). */
  const list = (numbered: boolean) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const start = text.lastIndexOf("\n", s - 1) + 1;
    const end = e > start ? e : start + (text.slice(start).indexOf("\n") + 1 || text.length - start + 1) - 1;
    const lines = text.slice(start, end).split("\n");
    const body = lines
      .map((l, i) => `${numbered ? `${i + 1}.` : "-"} ${l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}`)
      .join("\n");
    set(text.slice(0, start) + body + text.slice(end));
    requestAnimationFrame(() => el.focus());
  };

  const link = () => {
    const url = window.prompt("Link address (starting with https://)", "https://");
    if (!url || !/^(https?:\/\/|mailto:)\S+$/.test(url)) return;
    wrap("[", `](${url})`, "link text");
  };

  const btn =
    "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-paper focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15",
        invalid ? "border-danger" : "border-line-strong",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-1.5 py-1">
        <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5">
          <button
            type="button"
            className={btn}
            onClick={() => wrap("**")}
            aria-label="Bold (Ctrl+B)"
            title="Bold (Ctrl+B)"
            disabled={tab === "preview"}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => wrap("_")}
            aria-label="Italic (Ctrl+I)"
            title="Italic (Ctrl+I)"
            disabled={tab === "preview"}
          >
            <Italic className="h-4 w-4" />
          </button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-strong" />
          <button
            type="button"
            className={btn}
            onClick={() => list(false)}
            aria-label="Bulleted list"
            title="Bulleted list"
            disabled={tab === "preview"}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => list(true)}
            aria-label="Numbered list"
            title="Numbered list"
            disabled={tab === "preview"}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={btn}
            onClick={link}
            aria-label="Insert link"
            title="Insert link"
            disabled={tab === "preview"}
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
        <div role="tablist" aria-label="Editor mode" className="flex items-center gap-0.5 text-xs">
          {(
            [
              ["write", "Write", Pencil],
              ["preview", "Preview", Eye],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium",
                tab === k ? "bg-paper text-ink shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        ref={ta}
        name={name}
        value={text}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key.toLowerCase() === "b") {
            e.preventDefault();
            wrap("**");
          } else if (e.key.toLowerCase() === "i") {
            e.preventDefault();
            wrap("_");
          }
        }}
        aria-invalid={invalid || undefined}
        className={cn(
          "block w-full resize-y border-0 bg-transparent px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:ring-0",
          tab === "preview" && "sr-only",
        )}
        {...rest}
      />
      {tab === "preview" && (
        <div className="min-h-32 px-3.5 py-2.5 text-[15px] text-ink">
          {text.trim() ? <RichText text={text} /> : <p className="text-muted">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
