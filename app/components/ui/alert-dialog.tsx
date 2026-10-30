import { AlertDialog as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/utils";

/** shadcn/ui alert dialog (Radix): asks before anything that cannot be undone. */
export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;
export const AlertDialogCancel = Primitive.Cancel;
export const AlertDialogAction = Primitive.Action;

export function AlertDialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="ui-fade fixed inset-0 z-50 bg-navy-900/45 backdrop-blur-[2px]" />
      <Primitive.Content
        className={cn(
          "ui-pop fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-paper p-6 shadow-2xl",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function AlertDialogHeader({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full">{icon}</span>}
      <div className="min-w-0 space-y-1.5">
        <Primitive.Title className="font-display text-xl font-semibold text-ink">{title}</Primitive.Title>
        <Primitive.Description asChild>
          <div className="text-sm leading-relaxed text-muted">{children}</div>
        </Primitive.Description>
      </div>
    </div>
  );
}

export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}
