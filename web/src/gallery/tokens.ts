// Mirror of the values in src/index.css, for display in the gallery only.

export const RAMP = [
  { token: "--red-950", hex: "#0a0000", role: "page" },
  { token: "--red-900", hex: "#140000", role: "surface (cards, bars)" },
  { token: "--red-850", hex: "#1f0000", role: "raised surface, resting control" },
  { token: "--red-800", hex: "#2e0000", role: "pressed / selected fill" },
  { token: "--red-750", hex: "#380000", role: "primary action fill" },
  { token: "--red-700", hex: "#4d0000", role: "hairlines, dividers" },
  { token: "--red-600", hex: "#8a0000", role: "control outlines, tracks" },
  { token: "--red-500", hex: "#a80000", role: "placeholder, disabled text" },
  { token: "--red-400", hex: "#cc0000", role: "secondary text" },
  { token: "--red-300", hex: "#ff0000", role: "text, icons, emphasis" },
] as const

/** Semantic fills: utility class (literal so Tailwind sees it) + source. */
export const SEMANTIC_FILLS = [
  { cls: "bg-background", name: "background", src: "950", use: "page" },
  { cls: "bg-card", name: "card", src: "900", use: "cards, app bar, action bar" },
  { cls: "bg-popover", name: "popover", src: "850", use: "sheets, dialogs, popovers" },
  { cls: "bg-secondary", name: "secondary / muted", src: "850", use: "resting control fill" },
  { cls: "bg-accent", name: "accent", src: "800", use: "pressed and selected fill" },
  { cls: "bg-action", name: "action", src: "750", use: "primary action fill" },
  { cls: "bg-action-pressed", name: "action-pressed", src: "700", use: "primary action, pressed" },
  { cls: "bg-primary", name: "primary", src: "300", use: "small emphasis only (≤ 32 px)" },
] as const

export const SEMANTIC_TEXT = [
  { cls: "text-foreground", name: "foreground", src: "300", use: "primary text and icons" },
  { cls: "text-muted-foreground", name: "muted-foreground", src: "400", use: "secondary text (14 px+)" },
  { cls: "text-subtle-foreground", name: "subtle-foreground", src: "500", use: "placeholder / disabled only" },
] as const

export const SEMANTIC_BORDERS = [
  { cls: "border-border", name: "border", src: "700", use: "dividers, card outlines" },
  { cls: "border-input", name: "input", src: "600", use: "control outlines" },
  { cls: "border-primary", name: "primary", src: "300", use: "selected border" },
] as const

export const TYPE_ROLES = [
  { cls: "text-display", name: "text-display", spec: "28 / 32 · 600", sample: "12.4°" },
  { cls: "text-title", name: "text-title", spec: "20 / 28 · 600", sample: "Orion Nebula" },
  { cls: "text-heading", name: "text-heading", spec: "17 / 24 · 600", sample: "Camera settings" },
  { cls: "text-body", name: "text-body", spec: "16 / 24 · 400", sample: "Point the scope at a bright star and press Sync." },
  { cls: "text-label", name: "text-label", spec: "14 / 20 · 500", sample: "Exposure · Gain · Location" },
  { cls: "text-caption uppercase", name: "text-caption", spec: "12 / 16 · 600 · +0.06em", sample: "RA · Dec · Alt · Az" },
] as const
