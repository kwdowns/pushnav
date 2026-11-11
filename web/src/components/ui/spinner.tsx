import * as React from "react"
import { LoaderCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Indeterminate busy indicator. `label` is announced to screen readers. */
function Spinner({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("size-5 shrink-0 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
