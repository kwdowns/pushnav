import * as React from "react"
import { AlertCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

type ControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
}

/**
 * Label + control + hint / error. The single child control receives `id`,
 * `aria-describedby` and `aria-invalid` automatically.
 */
function Field({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactElement<ControlProps>
}) {
  const autoId = React.useId()
  const controlId = children.props.id ?? `${autoId}-control`
  const hintId = `${autoId}-hint`
  const errorId = `${autoId}-error`
  const describedBy =
    [
      children.props["aria-describedby"],
      hint ? hintId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <div
      data-slot="field"
      data-invalid={error ? "" : undefined}
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      <Label htmlFor={controlId}>{label}</Label>
      {React.cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {hint && (
        <p
          id={hintId}
          className={cn("text-label text-muted-foreground", error && "sr-only")}
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-label font-semibold text-foreground"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

export { Field }
