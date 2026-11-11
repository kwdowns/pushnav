import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type StepsProps = Omit<React.ComponentProps<"nav">, "children"> & {
  steps: readonly { label: string }[]
  /** Zero-based index of the current step. */
  current: number
}

/**
 * Wizard progress. Phones: a row of short bars + "Step 2 of 4 · Sync scope".
 * `md+`: numbered, labelled segments.
 */
function Steps({ steps, current, className, ...props }: StepsProps) {
  const n = steps.length
  const cur = Math.min(Math.max(current, 0), n - 1)
  return (
    <nav
      data-slot="steps"
      aria-label="Progress"
      className={cn("w-full", className)}
      {...props}
    >
      {/* Phone */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                "flex-1 rounded-full",
                i === cur ? "h-1.5 bg-primary" : "h-1",
                i < cur && "bg-primary",
                i > cur && "bg-input"
              )}
            />
          ))}
        </div>
        <p className="text-label text-foreground">
          <span className="text-muted-foreground">
            Step {cur + 1} of {n} ·{" "}
          </span>
          <span className="font-semibold">{steps[cur]?.label}</span>
        </p>
      </div>

      {/* Tablet / desktop */}
      <ol className="hidden gap-2 md:flex">
        {steps.map((s, i) => {
          const done = i < cur
          const isCur = i === cur
          return (
            <li
              key={s.label}
              aria-current={isCur ? "step" : undefined}
              className={cn(
                "flex h-touch-sm min-w-0 flex-1 items-center gap-2 rounded-lg border-[1.5px] px-3 text-label",
                isCur && "border-primary bg-accent font-semibold text-foreground",
                done && "border-border text-foreground",
                !isCur && !done && "border-border text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "readout flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  isCur && "border-primary",
                  done && "border-primary bg-primary text-primary-foreground",
                  !isCur && !done && "border-input"
                )}
              >
                {done ? (
                  <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  i + 1
                )}
              </span>
              <span className="truncate">{s.label}</span>
              {done && <span className="sr-only">(done)</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Steps }
export type { StepsProps }
