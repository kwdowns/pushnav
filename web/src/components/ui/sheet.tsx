import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * Bottom sheet on phones (max 85 % of the viewport, slides up), right side
 * panel at `md+`. A column: header · body (the only scroller) · footer.
 */
function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-overlay bg-scrim duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-overlay flex flex-col bg-popover text-popover-foreground outline-none duration-200",
          // phone: bottom sheet
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border",
          "data-open:animate-in data-closed:animate-out max-md:data-open:slide-in-from-bottom max-md:data-closed:slide-out-to-bottom",
          // md+: right side panel
          "md:inset-x-auto md:top-0 md:right-0 md:h-dvh md:max-h-none md:w-[26rem] md:rounded-none md:border-t-0 md:border-l",
          "md:data-open:slide-in-from-right md:data-closed:slide-out-to-right",
          className
        )}
        {...props}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-input md:hidden"
        />
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

/** Title row with a 44 px close button on the right. */
function SheetHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 items-start gap-2 border-b border-border py-2 pr-2 pl-4 md:pt-safe",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2">{children}</div>
      <SheetPrimitive.Close asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Close">
          <XIcon />
        </Button>
      </SheetPrimitive.Close>
    </div>
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-title text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-label text-muted-foreground", className)}
      {...props}
    />
  )
}

/** The only scrolling region inside a sheet. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 pushnav-scrollbar",
        className
      )}
      {...props}
    />
  )
}

/** Pinned to the bottom of the sheet; holds the sheet's action. */
function SheetFooter({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("shrink-0 border-t border-border bg-popover pb-safe", className)}
      {...props}
    >
      <div className="flex gap-2 p-3 *:flex-1 md:p-4">{children}</div>
    </div>
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
}
