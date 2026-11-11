import type { ControlDescriptor } from "@/lib/types";

// Convert a raw camera-control value to a human-readable label using its
// per-OS unit. Exposure controls report platform-specific raw units (issue
// #26); the slider keeps operating on raw min/max/step, only the displayed
// label is converted.
//   "100us"  (Linux/macOS UVC): milliseconds = value * 0.1
//   "log2s"  (Windows DirectShow): milliseconds = 2^value * 1000
//   "x10"    (gain in tenths of x, e.g. the Innomaker U20CAM): 45 -> "4.5×"
// Anything else (e.g. gain's "raw", or no unit) shows the raw value unchanged.
// displayScale multiplies a time, for a camera whose real exposure differs
// from the value it reports (the U20CAM's is about 2x).
export function formatControlValue(value: number, unit?: string, displayScale = 1): string {
  if (unit === "x10") return `${(value / 10).toFixed(1)}×`;
  let ms: number | null = null;
  if (unit === "100us") ms = value * 0.1;
  else if (unit === "log2s") ms = Math.pow(2, value) * 1000;
  if (ms === null) return String(value);
  ms *= displayScale;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(1)} ms`;
}

/** A control's current value as reported by the engine. */
export function controlValue(c: ControlDescriptor): number {
  return c.cur ?? c.value ?? c.min;
}

/** formatControlValue with the control's own unit and display scale. */
export function formatControl(c: ControlDescriptor, v: number): string {
  return formatControlValue(v, c.unit, c.display_scale ?? 1);
}

/** "120 ms · 4.5×": the controls' current values, for a collapsed summary. */
export function cameraControlsSummary(controls: ControlDescriptor[]): string {
  return controls.map((c) => formatControl(c, controlValue(c))).join(" · ");
}
