import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type DisclosureProps = Omit<
  React.ComponentProps<typeof CollapsiblePrimitive.Root>,
  "title"
> & {
  title: React.ReactNode
  /** Short state shown at the right of the header, e.g. "120 ms · 12 dB". */
  summary?: React.ReactNode
  icon?: React.ReactNode
}

/** Collapsible card-like section with a full-width 48 px header. */
function Disclosure({
  title,
  summary,
  icon,
  className,
  children,
  ...props
}: DisclosureProps) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="disclosure"
      className={cn(
        "group/disclosure rounded-xl border border-border bg-card text-card-foreground",
        className
      )}
      {...props}
    >
      <CollapsiblePrimitive.Trigger
        data-slot="disclosure-trigger"
        className="flex h-touch w-full items-center gap-2 rounded-xl px-3 text-left transition-colors active:bg-accent md:px-4 [&_svg]:size-5 [&_svg]:shrink-0"
      >
        {icon}
        <span className="min-w-0 shrink-0 text-heading">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-label text-muted-foreground">
          {summary}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="transition-transform group-data-open/disclosure:rotate-180"
        />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content
        data-slot="disclosure-content"
        className="flex flex-col gap-3 px-3 pb-3 md:px-4 md:pb-4"
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}

export { Disclosure }
export type { DisclosureProps }
