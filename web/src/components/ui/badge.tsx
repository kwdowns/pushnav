import * as React from "react"
import { cva } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-2.5 text-caption whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "border-primary bg-primary text-primary-foreground",
        outline: "border-primary bg-background text-foreground",
        muted: "border-input bg-background text-muted-foreground",
      },
    },
    defaultVariants: { variant: "outline" },
  }
)

type BadgeVariant = "solid" | "outline" | "muted"
/** Status pill. `solid` is the brightest thing on screen — one per view. */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant | null
  asChild?: boolean
}) {
  const v: BadgeVariant = variant ?? "outline"
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      data-variant={v}
      className={cn(badgeVariants({ variant: v }), className)}
      {...props}
    />
  )
}

export { Badge }
export type { BadgeVariant }
