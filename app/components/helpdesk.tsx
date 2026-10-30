import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { formatDateTime } from "~/components/forms";
import { cn } from "~/lib/utils";
import {
  ATTACHMENT_TYPES_LABEL,
  PRIORITY_LABEL,
  STAFF_STATUS_LABEL,
  STATUS_LABEL,
  TICKET_LIMITS,
  type Priority,
  type TicketStatus,
} from "~/modules/helpdesk/definitions";

/** Reusable help desk pieces: badges, conversation, attachments, pagination, candidate navigation. */

const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-danger-50 text-danger ring-danger/20",
  IN_PROGRESS: "bg-info-50 text-info ring-info/20",
  AWAITING_CANDIDATE: "bg-warning-50 text-warning ring-warning/25",
  RESOLVED: "bg-success-50 text-success ring-success/20",
  CLOSED: "bg-soft text-muted ring-line",
};

export function TicketStatusBadge({ status, staff = false }: { status: TicketStatus; staff?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STATUS_STYLE[status],
      )}
    >
      {(staff ? STAFF_STATUS_LABEL : STATUS_LABEL)[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "text-muted",
  NORMAL: "text-ink",
  HIGH: "text-warning font-semibold",
  URGENT: "text-danger font-semibold",
};
export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", PRIORITY_STYLE[priority])}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          priority === "URGENT"
            ? "bg-danger"
            : priority === "HIGH"
              ? "bg-warning"
              : priority === "LOW"
                ? "bg-line-strong"
                : "bg-navy-600",
        )}
      />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const size = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

export function AttachmentList({
  files,
  base,
}: {
  files: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
  base: string;
}) {
  if (!files.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`${base}/${f.id}`}
            className="inline-flex max-w-72 items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink no-underline hover:border-line-strong hover:bg-soft"
          >
            {f.mimeType === "application/pdf" ? (
              <FileText className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            )}
            <span className="truncate">{f.originalName}</span>
            <span className="shrink-0 text-muted">{size(f.sizeBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One conversation entry. Text is rendered as text (never HTML); line breaks are kept. */
export function TicketMessage({
  author,
  role,
  createdAt,
  body,
  internal,
  mine,
  children,
}: {
  author: string;
  role?: string;
  createdAt: string | Date;
  body: string;
  internal?: boolean;
  mine?: boolean;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        internal
          ? "border-warning/40 bg-warning-50/50"
          : mine
            ? "border-line bg-paper"
            : "border-navy-100 bg-navy-50/40",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm">
          <span className="font-semibold text-ink">{author}</span>
          {role && <span className="text-muted"> · {role}</span>}
          {internal && (
            <span className="ml-2 rounded bg-warning px-1.5 py-0.5 text-[11px] font-semibold text-white">
              Internal note — staff only
            </span>
          )}
        </p>
        <time className="text-xs text-muted" dateTime={new Date(createdAt).toISOString()}>
          {formatDateTime(createdAt)}
        </time>
      </header>
      <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {body}
      </p>
      {children}
    </article>
  );
}

/** File picker with the accepted types and size shown before choosing; lists and removes files. */
export function AttachmentInput({ error }: { error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const max = TICKET_LIMITS.attachmentMb * 1024 * 1024;
  const sync = (next: File[]) => {
    setFiles(next);
    if (input.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      input.current.files = dt.files;
    }
  };
  const tooBig = files.filter((f) => f.size > max);
  return (
    <div>
      <label htmlFor="hd-files" className="block text-sm font-medium">
        Attachments <span className="font-normal text-muted">(optional)</span>
      </label>
      <p id="hd-files-hint" className="mt-0.5 text-xs text-muted">
        Screenshots or PDFs that show the problem. {ATTACHMENT_TYPES_LABEL}, up to{" "}
        {TICKET_LIMITS.attachmentMb} MB each, at most {TICKET_LIMITS.attachments} files.
      </p>
      <label
        htmlFor="hd-files"
        className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-3 py-2.5 text-sm text-muted hover:border-brand-600 hover:text-ink"
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" /> Choose files
      </label>
      <input
        ref={input}
        id="hd-files"
        name="files"
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        aria-describedby="hd-files-hint"
        className="sr-only"
        onChange={(e) =>
          sync([...files, ...Array.from(e.target.files ?? [])].slice(0, TICKET_LIMITS.attachments))
        }
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-soft px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span
                className={cn("shrink-0 text-xs", f.size > max ? "font-semibold text-danger" : "text-muted")}
              >
                {size(f.size)}
              </span>
              <button
                type="button"
                onClick={() => sync(files.filter((_, j) => j !== i))}
                aria-label={`Remove ${f.name}`}
                className="rounded p-0.5 text-muted hover:bg-paper hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {tooBig.length > 0 && (
        <p className="mt-1 text-sm text-danger">
          Remove files over {TICKET_LIMITS.attachmentMb} MB before sending.
        </p>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      {page > 1 && (
        <Link to={href(page - 1)} className="btn-secondary btn-sm">
          Previous
        </Link>
      )}
      <span className="px-2 text-sm text-muted">
        Page {page} of {pages}
      </span>
      {page < pages && (
        <Link to={href(page + 1)} className="btn-secondary btn-sm">
          Next
        </Link>
      )}
    </nav>
  );
}

/** Candidate help desk layout: compact side navigation (desktop) or tabs (mobile). */
export function CandidateHelpDeskShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const items: [string, string, boolean?][] = [
    ["/help-desk", "Overview", true],
    ...(signedIn
      ? ([
          ["/help-desk/tickets", "My tickets"],
          ["/help-desk/new", "Create ticket"],
        ] as [string, string][])
      : []),
    ["/help-desk/articles", "Help articles"],
  ];
  const cls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "block rounded-lg px-3 py-2 text-sm no-underline transition-colors",
      isActive ? "bg-brand-50 font-semibold text-brand-800" : "text-ink hover:bg-soft",
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav aria-label="Help desk" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <p className="mb-2 hidden px-3 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase lg:block">
            Help desk
          </p>
          <ul className="flex gap-1 lg:flex-col">
            {items.map(([to, label, end]) => (
              <li key={to} className="shrink-0">
                <NavLink to={to} end={end} className={cls}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          {signedIn && (
            <div className="mt-6 hidden border-t border-line pt-4 lg:block">
              <Link
                to="/account"
                className="block rounded-lg px-3 py-2 text-sm text-muted no-underline hover:bg-soft hover:text-ink"
              >
                ← My applications
              </Link>
            </div>
          )}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
