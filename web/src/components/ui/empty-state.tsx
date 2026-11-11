import * as React from "react"

import { cn } from "@/lib/utils"

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground",
        className
      )}
      {...props}
    >
      {icon != null && (
        <div className="mb-1 [&_svg]:size-8" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-heading">{title}</p>
      {description != null && (
        <p className="max-w-sm text-label">{description}</p>
      )}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
