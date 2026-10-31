import { Star } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "~/lib/utils";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;

/**
 * 1–5 star rating input. Built on native radio buttons (arrow keys, screen readers, form posts all
 * work), styled as stars. Posts `name` = "1".."5", or "" when cleared.
 */
export function StarRatingInput({
  name = "rating",
  defaultValue,
  label = "Rating",
  error,
}: {
  name?: string;
  defaultValue?: number | null;
  label?: string;
  error?: string;
}) {
  const id = useId();
  const [value, setValue] = useState<number>(defaultValue ?? 0);
  const [hover, setHover] = useState<number>(0);
  const shown = hover || value;
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-sm font-semibold">
        {label} <span className="font-normal text-muted">(optional)</span>
      </legend>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="group cursor-pointer rounded-md p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand-600"
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => setValue(n)}
                className="sr-only"
                aria-label={`${n} of 5 stars, ${WORDS[n]}`}
              />
              <Star
                aria-hidden="true"
                className={cn(
                  "h-7 w-7 transition-transform duration-100 group-active:scale-90",
                  n <= shown ? "fill-gold-400 text-gold-400" : "fill-transparent text-line-strong",
                )}
                strokeWidth={1.5}
              />
            </label>
          ))}
        </div>
        <span className="min-w-[5.5rem] text-sm text-muted" aria-live="polite">
          {shown ? `${shown}/5 · ${WORDS[shown]}` : "Not rated"}
        </span>
        {value > 0 && (
          <button
            type="button"
            className="text-xs text-muted underline underline-offset-2 hover:text-ink"
            onClick={() => setValue(0)}
          >
            Clear
          </button>
        )}
      </div>
      {value === 0 && <input type="hidden" name={name} value="" />}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Read-only star display, e.g. "★★★★☆ 4/5". */
export function StarRatingView({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="flex" role="img" aria-label={`${value} of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              "h-4 w-4",
              n <= value ? "fill-gold-400 text-gold-400" : "fill-transparent text-line-strong",
            )}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-muted tabular-nums">{value}/5</span>
    </span>
  );
}
