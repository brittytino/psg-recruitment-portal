import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "~/lib/utils";

interface Result {
  id: string;
  referenceNo: string;
  name: string;
  detail: string;
  status: string;
}

/**
 * Staff search: suggestions while typing (reference number, candidate name or e-mail), arrow
 * keys to move, Enter to open, Ctrl+K or "/" to focus from anywhere. "All results" opens the
 * filtered applications list for people who can see the full list.
 */
export function GlobalSearch({ fullList }: { fullList: boolean }) {
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  // Ctrl+K / Cmd+K or "/" focuses the search box (not while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/staff/search.json?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await r.json()) as { results: Result[] };
        setResults(data.results ?? []);
        setActive(-1);
      } catch {
        /* aborted or offline: keep the previous list */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    navigate(`/staff/applications/${r.id}`);
  };
  const all = () => {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    navigate(`/staff?q=${encodeURIComponent(term)}`);
  };
  const showPanel = open && q.trim().length >= 2;

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && results[active]) go(results[active]);
          else if (fullList) all();
          else if (results[0]) go(results[0]);
        }}
      >
        <label htmlFor="top-q" className="sr-only">
          Search applications
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          ref={input}
          id="top-q"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search by reference no., candidate name or e-mail"
          className="field-input h-10 border-transparent bg-soft pr-16 pl-10 hover:border-line focus:bg-paper"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] text-muted sm:block">
          Ctrl K
        </kbd>
      </form>

      {showPanel && (
        <div
          className="ui-pop absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-paper shadow-[var(--shadow-float)]"
          data-state="open"
        >
          {loading && results.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No applications match “{q.trim()}”.</p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching applications"
              className="max-h-96 overflow-y-auto p-1.5"
            >
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    i === active && "bg-soft",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.referenceNo} · {r.detail}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[11px] text-muted">
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {fullList && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                all();
              }}
              className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-soft"
            >
              See all results for “{q.trim()}”
              <CornerDownLeft className="h-4 w-4 text-muted" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
