import { Tooltip as Primitive } from "radix-ui";
import type { ReactNode } from "react";

/** shadcn/ui tooltip (Radix). Used for the collapsed sidebar's icon-only links. */
export const TooltipProvider = Primitive.Provider;

export function Tooltip({
  label,
  side = "right",
  disabled,
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  children: ReactNode;
}) {
  if (disabled) return <>{children}</>;
  return (
    <Primitive.Root delayDuration={150}>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={10}
          className="ui-pop z-50 rounded-md bg-navy-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
