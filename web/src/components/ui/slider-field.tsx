import * as React from "react"
import { MinusIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

type SliderFieldProps = {
  label: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  formatValue?: (v: number) => string
  onValueChange?: (v: number) => void
  onValueCommit?: (v: number) => void
  disabled?: boolean
  className?: string
}

/** Round onto the step grid so repeated nudges don't accumulate float error. */
function snap(v: number, min: number, step: number) {
  const n = Math.round((v - min) / step)
  const decimals = (String(step).split(".")[1] ?? "").length
  return Number((min + n * step).toFixed(decimals))
}

/** Label + live value, then [−] slider [+]. −/+ move by one `step`. */
function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  formatValue = String,
  onValueChange,
  onValueCommit,
  disabled,
  className,
}: SliderFieldProps) {
  const id = React.useId()
  const labelId = `${id}-label`

  const nudge = (dir: -1 | 1) => {
    const next = Math.min(
      max,
      Math.max(min, snap(value + dir * step, min, step))
    )
    if (next === value) return
    onValueChange?.(next)
    onValueCommit?.(next)
  }

  return (
    <div
      data-slot="slider-field"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "flex flex-col gap-1",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-label text-foreground">
          {label}
        </span>
        <output aria-live="polite" className="readout text-body text-foreground">
          {formatValue(value)}
        </output>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="Decrease"
          disabled={disabled || value <= min}
          onClick={() => nudge(-1)}
        >
          <MinusIcon />
        </Button>
        <Slider
          aria-labelledby={labelId}
          className="flex-1"
          min={min}
          max={max}
          step={step}
          value={[value]}
          disabled={disabled}
          onValueChange={(v) => onValueChange?.(v[0])}
          onValueCommit={(v) => onValueCommit?.(v[0])}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="Increase"
          disabled={disabled || value >= max}
          onClick={() => nudge(1)}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

export { SliderField }
export type { SliderFieldProps }
