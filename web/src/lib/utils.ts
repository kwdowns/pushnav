import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the design-system names from src/index.css so that
// e.g. `text-label` (a size) is not mistaken for a colour and dropped when
// merged with `text-muted-foreground`, and `h-touch` overrides `h-12`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title", "heading", "body", "label", "caption"],
      spacing: ["touch-sm", "touch", "touch-lg", "app-bar"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
