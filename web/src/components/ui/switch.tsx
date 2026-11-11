import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * 52 × 32 track, 24 px thumb. Off: dim track, hollow ring thumb on the left.
 * On: raised fill, bright border, bright thumb on the right.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer hit-slop relative inline-flex h-8 w-13 shrink-0 items-center rounded-full border-[1.5px] border-input bg-secondary px-0.5 transition-colors disabled:pointer-events-none disabled:opacity-40 data-checked:border-primary data-checked:bg-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-6 rounded-full border-2 border-input bg-transparent transition-transform data-checked:translate-x-[1.3125rem] data-checked:border-primary data-checked:bg-primary"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
