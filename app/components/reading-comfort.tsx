import { Popover } from "radix-ui";
import { Check, Contrast, RotateCcw, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

/**
 * Reading comfort: larger text and high contrast for anyone who finds the default hard to read.
 * Stored in this browser only; applied before first paint by READING_SCRIPT (no flash).
 */
const SIZES = [
  { value: "normal", label: "Default", sample: "text-[13px]" },
  { value: "large", label: "Large", sample: "text-[15px]" },
  { value: "larger", label: "Larger", sample: "text-[17px]" },
  { value: "largest", label: "Largest", sample: "text-[19px]" },
] as const;
type Size = (typeof SIZES)[number]["value"];
const KEY = "psg-reading";

/** Inline, pre-paint: applies the saved preference to <html>. */
export const READING_SCRIPT = `try{var r=JSON.parse(localStorage.getItem("${KEY}")||"{}");if(r.text&&r.text!=="normal")document.documentElement.dataset.text=r.text;if(r.contrast)document.documentElement.dataset.contrast="high"}catch(e){}`;

function read(): { text: Size; contrast: boolean } {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { text?: Size; contrast?: boolean };
    return { text: SIZES.some((s) => s.value === r.text) ? r.text! : "normal", contrast: !!r.contrast };
  } catch {
    return { text: "normal", contrast: false };
  }
}

function apply(p: { text: Size; contrast: boolean }) {
  const el = document.documentElement;
  if (p.text === "normal") delete el.dataset.text;
  else el.dataset.text = p.text;
  if (p.contrast) el.dataset.contrast = "high";
  else delete el.dataset.contrast;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: applies for this page only */
  }
}

export function ReadingComfort({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [pref, setPref] = useState<{ text: Size; contrast: boolean }>({ text: "normal", contrast: false });
  useEffect(() => setPref(read()), []);
  const update = (p: Partial<typeof pref>) => {
    const next = { ...pref, ...p };
    setPref(next);
    apply(next);
  };
  const active = pref.text !== "normal" || pref.contrast;

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Reading comfort: text size and contrast"
        title="Text size and contrast"
        className={cn(
          "relative grid h-10 w-10 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none",
          tone === "dark"
            ? "border-white/15 text-white hover:bg-white/10"
            : "border-line bg-paper text-ink hover:border-line-strong hover:bg-soft",
        )}
      >
        <span className="font-display text-[15px] leading-none font-semibold" aria-hidden="true">
          A<span className="text-[11px]">a</span>
        </span>
        {active && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-paper" />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="ui-pop z-50 w-80 rounded-2xl border border-line bg-paper p-4 text-ink shadow-[var(--shadow-float)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Type className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">Reading comfort</p>
              <p className="text-xs text-muted">Saved on this device</p>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Text size</p>
          <div role="radiogroup" aria-label="Text size" className="mt-2 grid grid-cols-4 gap-1.5">
            {SIZES.map((s) => {
              const on = pref.text === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => update({ text: s.value })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-colors",
                    on
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-line hover:border-line-strong hover:bg-soft",
                  )}
                >
                  <span
                    className={cn("font-display leading-none font-semibold", s.sample)}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span className="text-[11px]">{s.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={pref.contrast}
            onClick={() => update({ contrast: !pref.contrast })}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:bg-soft"
          >
            <Contrast className="h-4 w-4 text-muted" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-sm font-medium">High contrast</span>
              <span className="block text-xs text-muted">Darker text and stronger borders</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative h-6 w-10 rounded-full transition-colors",
                pref.contrast ? "bg-brand-600" : "bg-line-strong",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-[left] duration-200",
                  pref.contrast ? "left-[1.125rem]" : "left-0.5",
                )}
              >
                {pref.contrast && <Check className="h-3 w-3 text-brand-700" />}
              </span>
            </span>
          </button>

          {active && (
            <button
              type="button"
              onClick={() => update({ text: "normal", contrast: false })}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset to default
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
