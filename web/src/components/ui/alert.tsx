import * as React from "react"
import { InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type AlertVariant = "info" | "warning" | "error"
const STYLES: Record<AlertVariant, string> = {
  info: "border-border bg-card",
  warning: "border-input bg-card",
  error: "border-primary bg-accent",
}

const ICONS: Record<AlertVariant, typeof InfoIcon> = {
  info: InfoIcon,
  warning: TriangleAlertIcon,
  error: OctagonAlertIcon,
}

/**
 * Inline message. Each variant carries its own icon (state is shape, not
 * hue); `error` also gets the bright border and a raised fill.
 */
function Alert({
  className,
  variant,
  title,
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: AlertVariant | null
  title?: React.ReactNode
  /** Trailing control, e.g. a "Retry" button. */
  action?: React.ReactNode
}) {
  const v: AlertVariant = variant ?? "info"
  const Icon = ICONS[v]
  return (
    <div
      data-slot="alert"
      data-variant={v}
      role={v === "info" ? "status" : "alert"}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border-[1.5px] p-3 text-left text-foreground",
        STYLES[v],
        className
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title != null && <div data-slot="alert-title" className="text-heading">{title}</div>}
        {typeof children === "string" ? (
          <div data-slot="alert-description" className="text-label text-foreground">{children}</div>
        ) : (
          children
        )}
      </div>
      {action != null && (
        <div data-slot="alert-action" className="shrink-0 self-center">
          {action}
        </div>
      )}
    </div>
  )
}

export { Alert }
export type { AlertVariant }
