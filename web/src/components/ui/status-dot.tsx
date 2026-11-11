import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * On = filled bright dot, off = hollow ring. With `label` the text is shown
 * beside the dot; the on/off state is always announced to screen readers.
 */
function StatusDot({
  active,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  active: boolean
  label?: React.ReactNode
}) {
  const state = active ? "on" : "off"
  return (
    <span
      data-slot="status-dot"
      data-active={active ? "" : undefined}
      className={cn("inline-flex items-center gap-2 text-label", className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full border-[1.5px]",
          active ? "border-primary bg-primary" : "border-input bg-transparent"
        )}
      />
      {label != null && (
        <span className={active ? "text-foreground" : "text-muted-foreground"}>
          {label}
        </span>
      )}
      <span className="sr-only">{label != null ? `(${state})` : state}</span>
    </span>
  )
}

export { StatusDot }
