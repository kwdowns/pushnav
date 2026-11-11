import * as React from "react"
import { Toggle as TogglePrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Toggleable filter chip. Selected = raised fill + bright border + bright
 * text + a leading check; unselected = outline only, dimmer text, no icon.
 */
function Chip({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      data-slot="chip"
      className={cn(
        "group/chip inline-flex h-touch-sm shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-input bg-background px-4 text-label whitespace-nowrap text-muted-foreground transition-colors active:bg-accent disabled:pointer-events-none disabled:opacity-40 data-on:border-primary data-on:bg-accent data-on:pl-3 data-on:font-semibold data-on:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      <CheckIcon
        aria-hidden
        strokeWidth={3}
        className="hidden group-data-on/chip:block"
      />
      {children}
    </TogglePrimitive.Root>
  )
}

export { Chip }
