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
      {/*
        The trigger is a wrapper, not the child itself: merging props into a NavLink would turn its
        className function into text and drop its styles.
      */}
      <Primitive.Trigger asChild>
        <span className="block">{children}</span>
      </Primitive.Trigger>
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
