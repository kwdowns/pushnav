import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Label + description on the left, one control on the right. The whole row
 * is a <label>, so tapping anywhere on it operates the control.
 */
function SettingRow({
  label,
  description,
  htmlFor,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"label">, "children"> & {
  label: React.ReactNode
  description?: React.ReactNode
  /** The control. Exactly one labelable element (Switch, Checkbox, …). */
  children: React.ReactNode
}) {
  return (
    <label
      data-slot="setting-row"
      htmlFor={htmlFor}
      className={cn(
        "flex min-h-touch-lg cursor-pointer items-center gap-3 py-2 has-disabled:pointer-events-none has-disabled:opacity-40",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-foreground">{label}</span>
        {description && (
          <span className="text-label text-muted-foreground">{description}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center">{children}</span>
    </label>
  )
}

export { SettingRow }
