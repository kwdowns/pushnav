import * as React from "react"

import { cn } from "@/lib/utils"

/** Caption label above a monospace value (RA, Dec, Alt, Az …). */
function Readout({
  label,
  value,
  size = "md",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  value: React.ReactNode
  size?: "md" | "lg"
}) {
  return (
    <div
      data-slot="readout"
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <span className="text-caption text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          "readout truncate text-foreground",
          size === "lg" ? "text-title" : "text-body"
        )}
      >
        {value}
      </span>
    </div>
  )
}

const COLS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const

function ReadoutGrid({
  cols = 2,
  className,
  ...props
}: React.ComponentProps<"div"> & { cols?: 1 | 2 | 3 | 4 }) {
  return (
    <div
      data-slot="readout-grid"
      className={cn("grid gap-x-4 gap-y-2", COLS[cols], className)}
      {...props}
    />
  )
}

export { Readout, ReadoutGrid }
