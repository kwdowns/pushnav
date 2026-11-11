import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type SegmentedOption<T extends string> = {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Stretch to the container and split it evenly. */
  fullWidth?: boolean
  /** `md`: 44 px segments (52 px overall). `lg`: 48 px segments. */
  size?: "md" | "lg"
  disabled?: boolean
  className?: string
  "aria-label": string
}

/**
 * 2–4 mutually exclusive views or modes. Selected segment: raised fill,
 * bright border, semibold, bright text. Tapping the selected segment again
 * does nothing (there is always exactly one selection).
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  fullWidth = false,
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="segmented-control"
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as T)
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full gap-1 rounded-lg border border-input bg-secondary p-1",
        fullWidth && "flex w-full",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          data-slot="segmented-control-item"
          className={cn(
            "inline-flex min-w-0 items-center justify-center gap-2 rounded-md border-[1.5px] border-transparent px-3 text-label whitespace-nowrap text-muted-foreground transition-colors active:bg-accent disabled:pointer-events-none disabled:opacity-40 data-on:border-primary data-on:bg-accent data-on:font-semibold data-on:text-foreground [&_svg]:size-5 [&_svg]:shrink-0",
            size === "lg" ? "h-touch" : "h-touch-sm",
            fullWidth && "flex-1"
          )}
        >
          {o.icon}
          <span className="truncate">{o.label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

export { SegmentedControl }
export type { SegmentedOption, SegmentedControlProps }
