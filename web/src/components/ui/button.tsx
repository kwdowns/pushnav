import * as React from "react"
import { cva } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-transparent whitespace-nowrap text-foreground transition-colors select-none disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-action font-semibold active:bg-action-pressed",
        secondary:
          "border-input bg-secondary font-medium active:bg-accent active:border-primary",
        ghost: "font-medium active:bg-accent",
        danger:
          "border-dashed border-primary bg-background font-semibold active:bg-accent",
      },
      size: {
        md: "h-touch px-4 text-body",
        sm: "h-touch-sm px-3 text-label",
        lg: "h-touch-lg px-5 text-heading",
        icon: "size-touch",
        "icon-sm": "size-touch-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonSize = "md" | "sm" | "lg" | "icon" | "icon-sm"

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  asChild?: boolean
  /** Shows a spinner in place of the leading content and disables the button. */
  loading?: boolean
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const v: ButtonVariant = variant ?? "primary"
  const s: ButtonSize = size ?? "md"
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={v}
      data-size={s}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant: v, size: s }), className)}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Spinner label="Working" />
          {s === "icon" || s === "icon-sm" ? null : children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }
