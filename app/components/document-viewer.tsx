import { Dialog } from "radix-ui";
import { Download, ExternalLink, Eye, FileText, Loader2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * View a private document (PDF or image) in a dialog before downloading it. The file route is
 * called with ?view=1 (shown inline, frameable by this site only); Download uses the normal link.
 * Every request still goes through the route's own permission check.
 */
export interface ViewableFile {
  /** Download address, e.g. /files/documents/<id>. */
  href: string;
  name: string;
  /** "application/pdf", "image/png", "image/jpeg"; anything else is download-only. */
  mimeType?: string;
}

const viewUrl = (href: string) => `${href}${href.includes("?") ? "&" : "?"}view=1`;
const isImage = (m?: string) => !!m && m.startsWith("image/");

export function DocumentViewer({
  file,
  trigger,
  triggerClassName,
}: {
  file: ViewableFile;
  /** Custom trigger content; defaults to an eye icon button. */
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Lists that only know the file name: infer the type from its extension.
  const mime =
    file.mimeType ??
    (/\.png$/i.test(file.name)
      ? "image/png"
      : /\.jpe?g$/i.test(file.name)
        ? "image/jpeg"
        : "application/pdf");
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLoaded(false);
      }}
    >
      <Dialog.Trigger
        className={cn(
          triggerClassName ??
            "inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-paper text-ink transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none",
        )}
        aria-label={`View ${file.name}`}
        title={`View ${file.name}`}
      >
        {trigger ?? <Eye className="h-4 w-4" aria-hidden="true" />}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-fade fixed inset-0 z-50 bg-navy-900/60 backdrop-blur-[2px]" />
        <Dialog.Content
          className="ui-pop fixed top-1/2 left-1/2 z-50 flex h-[min(92dvh,60rem)] w-[min(96vw,64rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl"
          aria-describedby={undefined}
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
            <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
              {file.name}
            </Dialog.Title>
            <a
              href={viewUrl(file.href)}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost btn-sm hidden sm:inline-flex"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in new tab
            </a>
            <a href={file.href} className="btn-primary btn-sm" download>
              <Download className="h-4 w-4" aria-hidden="true" /> Download
            </a>
            <Dialog.Close
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>
          <div className="relative min-h-0 flex-1 bg-soft">
            {!loaded && (
              <p className="absolute inset-0 grid place-items-center text-sm text-muted">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading document…
                </span>
              </p>
            )}
            {isImage(mime) ? (
              <div className="grid h-full place-items-center overflow-auto p-4">
                <img
                  src={viewUrl(file.href)}
                  alt={file.name}
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                  className="max-h-full max-w-full rounded-lg bg-white object-contain shadow"
                />
              </div>
            ) : (
              <iframe
                src={`${viewUrl(file.href)}#view=FitH`}
                title={file.name}
                onLoad={() => setLoaded(true)}
                className="h-full w-full border-0"
              />
            )}
          </div>
          <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
            If the document does not show on this device, use Download.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
