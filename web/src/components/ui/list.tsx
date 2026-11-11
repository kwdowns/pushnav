import * as React from "react"

import { cn } from "@/lib/utils"

/** Rows inside one rounded outline, separated by hairlines. Flows in the page. */
function List({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="list"
      className={cn(
        "flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
      {...props}
    />
  )
}

type ListRowProps = Omit<React.ComponentProps<"li">, "title"> & {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-aligned short value, e.g. "54° SE". */
  meta?: React.ReactNode
  leading?: React.ReactNode
  /** Trailing control (e.g. a "Go to" button) — a sibling of the row body. */
  action?: React.ReactNode
  /** Makes the row body a button. */
  onPress?: () => void
  selected?: boolean
}

/**
 * One row. With `onPress` the body is a <button>; `action` sits beside it,
 * never inside it, so there is no button-in-a-button.
 */
function ListRow({
  title,
  subtitle,
  meta,
  leading,
  action,
  onPress,
  selected = false,
  className,
  ...props
}: ListRowProps) {
  const bodyClass = cn(
    "flex min-h-touch-lg min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left",
    onPress && "transition-colors active:bg-accent"
  )
  const body = (
    <>
      {leading != null && (
        <span className="flex shrink-0 items-center [&_svg]:size-5">{leading}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-heading text-foreground">{title}</span>
        {subtitle != null && (
          <span className="truncate text-label text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {meta != null && (
        <span className="readout shrink-0 text-right text-label text-foreground">
          {meta}
        </span>
      )}
    </>
  )

  return (
    <li
      data-slot="list-row"
      data-selected={selected ? "" : undefined}
      aria-current={selected || undefined}
      className={cn(
        "relative flex items-stretch",
        selected &&
          "bg-accent before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
        className
      )}
      {...props}
    >
      {onPress ? (
        <button
          type="button"
          data-slot="list-row-body"
          className={bodyClass}
          onClick={onPress}
        >
          {body}
        </button>
      ) : (
        <div data-slot="list-row-body" className={bodyClass}>
          {body}
        </div>
      )}
      {action != null && (
        <div data-slot="list-row-action" className="flex shrink-0 items-center pr-2">
          {action}
        </div>
      )}
    </li>
  )
}

export { List, ListRow }
export type { ListRowProps }
