import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActionData, useNavigation } from "react-router";
import { cn } from "~/lib/utils";

/**
 * Modal dialog (Radix): focus trap, Escape to close, scroll lock, labelled title. Forms inside it
 * post normally; with `closeOnSuccess` the modal closes after an action returns `{ message }` with
 * no error, and stays open (showing the error) otherwise.
 */
export function Modal({
  trigger,
  triggerClassName = "btn-primary",
  triggerLabel,
  title,
  description,
  icon,
  size = "md",
  closeOnSuccess = true,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  /** Accessible name when the trigger is an icon only. */
  triggerLabel?: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnSuccess?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const action = useActionData() as { message?: string; formError?: string } | undefined;
  const submitted = useRef(false);

  // Remember that a form inside this modal was submitted, then close when it succeeded.
  useEffect(() => {
    if (open && nav.state === "submitting") submitted.current = true;
    if (nav.state === "idle" && submitted.current) {
      submitted.current = false;
      if (closeOnSuccess && action && !action.formError) setOpen(false);
    }
  }, [nav.state, open, action, closeOnSuccess]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={triggerClassName} aria-label={triggerLabel}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-fade fixed inset-0 z-50 bg-navy-900/55 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "ui-pop fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-paper shadow-2xl",
            "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-lg",
            size === "lg" && "sm:max-w-2xl",
            size === "xl" && "sm:max-w-5xl",
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
            {icon && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {typeof children === "function" ? children(() => setOpen(false)) : children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Footer row for buttons inside a modal form. */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-line bg-soft/60 px-5 py-4 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
      {children}
    </div>
  );
}

export const ModalClose = Dialog.Close;
