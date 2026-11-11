# PushNav design system — "Night Red"

PushNav is used outdoors, in the dark, on a phone or tablet at minimum
brightness, by someone with one hand on a telescope. Every rule here follows
from that.

- Tokens live in `src/index.css`.
- Components live in `src/components/ui/`.
- A live reference of every token and component is built into the app:
  open it with `?gallery` on the URL (e.g. `http://localhost:5173/static/?gallery`).

## Principles

1. **Red channel only.** Every colour is `rgb(N 0 0)`. No white, no yellow,
   no pink, no grey. Rod cells barely respond to deep red, so a red-only
   screen does not reset dark adaptation. This includes the camera frame
   (`night-frame`), SVG overlays, the 3D dome, QR codes and icons.
   The one exception is opt-in: a button on the camera frame switches it to
   the camera's own white-light image, for when faint detail matters more
   than dark adaptation. Red is the default.
2. **Spend light on information, not on area.** Light output is roughly
   brightness × area. Text, icons and thin strokes are bright; large fills
   are near-black. A primary button is a *dark* fill with a bright border
   and bright text, not a bright slab.
3. **One hue, so state is shape.** With a single hue, colour cannot mean
   "selected", "error" or "on". State is always carried by at least two of:
   fill step, border brightness, font weight, an icon, a text label.
   Errors and destructive actions always have an icon.
4. **Thumb-sized.** Nothing tappable is smaller than 44 × 44 px; the default
   control is 48 px; neighbouring targets are at least 8 px apart.
5. **Cause and effect on one screen.** A control and the thing it changes
   must be visible together (exposure slider ↔ camera frame). If the user
   has to scroll to see the result, the layout is wrong.
6. **The page is the only scroller.** No scrollable panels inside the page.
   Lists flow in the page; things that must stay visible are `sticky`.
   The only exceptions are modal surfaces (Sheet, Dialog) and horizontally
   wide tables.
7. **The action lives where the decision is made.** A list row carries its
   own action button ("Go to"). Never select-then-scroll-to-a-button.
8. **Borders and fills mean "tap me".** With one hue, a bordered or filled
   shape is the only cue that something is a control. Status and legends
   are therefore plain icon + text, and drawings are labelled directly
   (the dome's markers say "Scope" and the target's name) rather than
   explained by a key of dots that look like radio buttons.

## Colour

Primitive ramp (never use these directly in components — use the semantic
names):

| Token | Value | Role | #ff0000 text on it |
|---|---|---|---|
| `--red-950` | `#0a0000` | page | 5.2 : 1 |
| `--red-900` | `#140000` | surface (cards, bars) | 5.1 : 1 |
| `--red-850` | `#1f0000` | raised surface, resting control fill | 5.0 : 1 |
| `--red-800` | `#2e0000` | pressed / selected fill | 4.7 : 1 |
| `--red-750` | `#380000` | primary action fill | 4.5 : 1 |
| `--red-700` | `#4d0000` | hairlines, dividers | — |
| `--red-600` | `#8a0000` | control outlines, inactive tracks | — |
| `--red-500` | `#a80000` | placeholder, disabled text (2.6 : 1) | — |
| `--red-400` | `#cc0000` | secondary text (3.5 : 1) | — |
| `--red-300` | `#ff0000` | text, icons, emphasis | — |

A red-only palette cannot exceed 5.25 : 1 against black, so body text always
uses the top of the ramp. Secondary text (`muted-foreground`) is 3.5 : 1 and
therefore only used at 14 px medium or larger. `subtle-foreground` is for
placeholders and disabled labels only — never for information.

Semantic utilities (Tailwind): 

| Utility | Use |
|---|---|
| `bg-background` | page |
| `bg-card` | cards, app bar, action bar |
| `bg-popover` | sheets, dialogs, popovers |
| `bg-secondary` / `bg-muted` | resting control fill |
| `bg-accent` | pressed and selected fill |
| `bg-action`, `bg-action-pressed` | primary action fill |
| `text-foreground` | primary text and icons |
| `text-muted-foreground` | secondary text |
| `text-subtle-foreground` | placeholder / disabled |
| `border-border` | dividers, card outlines |
| `border-input` | control outlines |
| `border-primary`, `text-primary`, `bg-primary` | emphasis: selected border, slider range, "on" thumb. `bg-primary` only on small things (≤ 32 px) |
| `text-primary-foreground` | text on a `bg-primary` chip |
| `bg-scrim` | behind modals |
| `stroke-overlay-strong`, `stroke-overlay`, `stroke-overlay-dim` (also `fill-*`) | drawings over the camera frame / dome |

There are no shadows (invisible on black). Elevation is one step up the fill
ramp plus a border.

## Type

System fonts only (no web fonts). Use the role utilities, not `text-xs…2xl`:

| Utility | Size / line | Weight | Use |
|---|---|---|---|
| `text-display` | 28 / 32 | 600 | the one number that matters (distance to target) |
| `text-title` | 20 / 28 | 600 | screen and sheet titles |
| `text-heading` | 17 / 24 | 600 | card titles, list row titles |
| `text-body` | 16 / 24 | 400 | body copy, inputs (16 px stops iOS zoom-on-focus) |
| `text-label` | 14 / 20 | 500 | control labels, secondary lines |
| `text-caption` | 12 / 16 | 600, +0.06em | UPPERCASE overlines and units only |

- Nothing below 12 px. Sentences are never set in `text-caption`.
- Changing numbers use `readout` (monospace, tabular figures).
- Sentence case everywhere except `text-caption` overlines.

## Size, spacing, shape

| Token | Value | Use |
|---|---|---|
| `touch-sm` | 44 px | minimum target; dense rows |
| `touch` | 48 px | default control height |
| `touch-lg` | 56 px | the single primary action of a step |

Used as `h-touch`, `min-h-touch-sm`, `size-touch`, …

- A visual smaller than 44 px (checkbox, close ✕) uses `hit-slop` to extend
  its touch area.
- Spacing is the Tailwind 4 px grid. Inside a card: `gap-3`, `p-3` (phone) /
  `p-4` (tablet). Between cards: `gap-3`. Page gutter: `px-gutter`.
- Radius: `rounded-lg` (12 px) controls, `rounded-xl` (16 px) cards and
  sheets, `rounded-full` pills and thumbs.
- Layers: `z-sticky` (20) < `z-bar` (30) < `z-overlay` (50).
- Edges that touch the screen border pad with `pt-safe` / `pb-safe` /
  `px-safe`.

## Layout

Phone-first, three widths:

| Width | Layout |
|---|---|
| < 768 px (phone) | one column; camera frame sticky under the app bar |
| ≥ 768 px (`md`, tablet / desktop) | two columns; left column (camera, step) sticky, right column flows |
| max | content capped at `max-w-app` (1200 px), centred |

Landscape phones use the tablet layout when ≥ 768 px wide, otherwise the
phone layout.

### Scrolling

`body` is the only vertical scroller. Do not put `overflow-y-auto` on a
panel inside the page. To keep something on screen, make it `sticky`.
Sheets and dialogs scroll internally with `overscroll-contain`.

## Components (`src/components/ui/`)

| Component | Purpose |
|---|---|
| `Button` | variants `primary` · `secondary` · `ghost` · `danger`; sizes `md` (48) · `sm` (44) · `lg` (56) · `icon` (48²) · `icon-sm` (44²) |
| `SegmentedControl` | 2–4 mutually exclusive views or modes |
| `Chip` | toggleable filter chip (selected = fill + bright border + check) |
| `Input`, `Label`, `Field` | text entry; `Field` adds label, hint and error |
| `Slider` | 28 px thumb, 8 px track, 48 px touch height |
| `SliderField` | label + live value + slider + − / + nudge buttons |
| `Switch`, `Checkbox` | binary settings |
| `SettingRow` | label + description on the left, control on the right; whole row is the label |
| `Card` (+ parts) | grouped content |
| `Disclosure` | collapsible section with a 48 px header (title, summary, chevron) |
| `Sheet` (+ parts) | bottom sheet on phones, right side panel at `md+`; sticky footer for its action |
| `Dialog` | confirmations |
| `Popover` | small anchored panels |
| `List`, `ListRow` | rows with title / subtitle / meta and an optional trailing action button |
| `Readout`, `ReadoutGrid` | label + monospace value pairs (RA, Dec, Alt, Az) |
| `Badge` | status pill: `solid` · `outline` · `muted`, optional icon |
| `StatusDot` | on = filled, off = hollow ring |
| `Alert` | `info` · `warning` · `error`, each with its own icon |
| `Steps` | wizard progress; compact on phones, labelled at `md+` |
| `Progress`, `Spinner`, `EmptyState`, `Separator` | feedback and structure |
| `AppBar`, `ActionBar` | sticky top / bottom bars with safe-area padding |

Rules of use:

- One `primary` button per view. Everything else is `secondary` or `ghost`.
- `danger` always has a leading icon and, if irreversible, a `Dialog`.
- `Badge` is for small inline tags only. App-level status (Locked, Setup)
  is plain icon + text, because a pill reads as a button.
- A `ListRow` with an `action` renders two sibling buttons (row body and
  action) — never a button inside a button.
- Icons are `lucide-react`, 20 px in controls, `currentColor`.

## Screen structure

One screen, no top-level tabs.

```
AppBar      logo · status (icon + text) · audio · full-screen · settings (opens a Sheet)
Camera      live frame + overlays — sticky (top on phone, left column at md+)
Step area   depends on engine state:
              SETUP / SYNC / SYNC_CONFIRM / CALIBRATE / WARMING_UP
                 Steps · instruction card with the step's primary action ·
                 camera SliderFields (exposure, gain) open, right under the frame
              TRACKING
                 target readout (name, distance, direction, Clear) ·
                 camera controls collapsed in a Disclosure ·
                 sky dome in a Disclosure
Targets     always below the step area; primary content once tracking.
              SegmentedControl: Tonight · Search · Manual
              filter Chips · time control
              ListRows — tap row → detail Sheet; trailing "Go to" button
              sets the target without opening anything
```

Settings, connectivity (QR code, client status) and observer location live in
the settings Sheet, not on the main screen.

## Installed app (PWA)

The app ships a web manifest and icons so it can be added to the home screen
and run without browser chrome. `viewport-fit=cover` is on, so anything at a
screen edge uses the safe-area utilities. Manifest `theme_color` and
`background_color` are `--red-950` (`#0a0000`).
