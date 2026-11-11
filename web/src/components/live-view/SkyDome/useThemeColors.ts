import { useState } from "react";
import type { ThemeColors } from "./types";

// Red-only fallbacks matching the --overlay-* tokens in index.css.
const DEFAULTS: ThemeColors = {
  gridLines: "#8a0000",
  gridLabels: "#cc0000",
  horizon: "#cc0000",
  ground: "#2e0000",
  pointing: "#ff0000",
  target: "#ff0000",
  line: "#cc0000",
};

/**
 * Resolve a CSS custom property to "#rrggbb". Reading the property directly
 * would return the unresolved `var(--red-…)`, so let the browser compute it
 * as a colour on a throwaway element.
 */
function cssColor(varName: string, fallback: string): string {
  const el = document.createElement("div");
  el.style.color = `var(${varName})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return fallback;
  return "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function read(): ThemeColors {
  if (typeof document === "undefined") return DEFAULTS;
  return {
    gridLines: cssColor("--overlay-dim", DEFAULTS.gridLines),
    gridLabels: cssColor("--overlay", DEFAULTS.gridLabels),
    horizon: cssColor("--overlay", DEFAULTS.horizon),
    ground: cssColor("--accent", DEFAULTS.ground),
    // Pointing and target share the brightest red; they differ by shape
    // (solid dot vs hollow ring), not by hue.
    pointing: cssColor("--overlay-strong", DEFAULTS.pointing),
    target: cssColor("--overlay-strong", DEFAULTS.target),
    line: cssColor("--overlay", DEFAULTS.line),
  };
}

/** Dome colours from the design tokens. The theme never changes at runtime. */
export function useThemeColors(): ThemeColors {
  const [colors] = useState(read);
  return colors;
}
