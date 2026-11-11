import * as React from "react"

import { cn } from "@/lib/utils"

/** Sticky top bar, clears the notch with `pt-safe`. */
function AppBar({
  className,
  children,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-bar"
      className={cn(
        "sticky top-0 z-bar border-b border-border bg-card pt-safe",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-app-bar w-full max-w-app items-center gap-2 px-gutter">
        {children}
      </div>
    </header>
  )
}

/** Sticky bottom bar, clears the home indicator with `pb-safe`. */
function ActionBar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        "sticky bottom-0 z-bar border-t border-border bg-card pb-safe",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-app gap-2 px-gutter py-2">
        {children}
      </div>
    </div>
  )
}

export { AppBar, ActionBar }
