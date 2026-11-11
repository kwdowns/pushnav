import * as React from "react"

import { cn } from "@/lib/utils"

/** 48 px text entry, 16 px text (stops iOS zoom-on-focus). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-touch w-full min-w-0 rounded-lg border-[1.5px] border-input bg-background px-3 text-body text-foreground transition-colors outline-none focus:border-primary disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-dashed aria-invalid:border-primary",
        className
      )}
      {...props}
    />
  )
}

export { Input }
