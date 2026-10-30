import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

/** shadcn/ui dropdown menu (Radix), styled with the project's tokens. */
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuPortal = Primitive.Portal;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "ui-pop z-50 min-w-56 overflow-hidden rounded-xl border border-line bg-paper p-1.5 text-ink shadow-[var(--shadow-float)]",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof Primitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
        variant === "destructive"
          ? "text-danger data-[highlighted]:bg-danger-50"
          : "data-[highlighted]:bg-soft [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-2.5 py-2", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("-mx-1.5 my-1.5 h-px bg-line", className)} {...props} />;
}
