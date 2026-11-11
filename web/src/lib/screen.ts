// Pure helpers for the main screen: which step the engine is on, what the
// status badge says, and number formatting for the readouts.
import type { BadgeVariant } from "@/components/ui/badge";
import type { EnginePayload, EngineState } from "@/lib/types";

/** The four wizard steps shown by <Steps>. */
export const SETUP_STEPS = [
  { label: "Camera" },
  { label: "Sync" },
  { label: "Calibrate" },
  { label: "Track" },
] as const;

const STEP_INDEX: Partial<Record<EngineState, number>> = {
  SETUP: 0,
  SYNC: 1,
  SYNC_CONFIRM: 1,
  CALIBRATE: 2,
  WARMING_UP: 3,
  TRACKING: 3,
};

/** Zero-based wizard step for an engine state; null when it has none. */
export function stepIndexFor(state: EngineState): number | null {
  return STEP_INDEX[state] ?? null;
}

/**
 * Setup phase: the step area shows Steps, an instruction card and the camera
 * sliders open. Everything else (tracking, camera trouble) tucks them away.
 */
export function isSetupPhase(state: EngineState): boolean {
  return (
    state === "SETUP" ||
    state === "SYNC" ||
    state === "SYNC_CONFIRM" ||
    state === "CALIBRATE" ||
    state === "WARMING_UP"
  );
}

export type StatusBadge = {
  label: string;
  variant: BadgeVariant;
  /** Shape cue for a problem state (state is never carried by colour). */
  alert?: boolean;
};

/** The app bar's status pill. `solid` only for a live lock. */
export function statusBadgeFor(s: EnginePayload): StatusBadge {
  switch (s.state) {
    case "TRACKING":
      return s.pointing.valid
        ? { label: "Locked", variant: "solid" }
        : { label: "No lock", variant: "outline", alert: true };
    case "WARMING_UP":
      return { label: "Acquiring", variant: "outline" };
    case "RECONNECTING":
      return { label: "Reconnecting", variant: "outline", alert: true };
    case "ERROR":
      return { label: "Camera lost", variant: "outline", alert: true };
    case "SETUP":
      return s.camera.connected
        ? { label: "Setup", variant: "muted" }
        : { label: "No camera", variant: "outline", alert: true };
    case "SYNC":
    case "SYNC_CONFIRM":
      return { label: "Sync", variant: "muted" };
    case "CALIBRATE":
      return { label: "Calibrate", variant: "muted" };
    default:
      return { label: s.state, variant: "muted" };
  }
}

/** Solve failures in a row after which the frame shows "No stars". */
export const NO_STARS_FAILURES = 3;

/** True when a solve-dependent state has lost the stars. */
export function hasNoStars(s: EnginePayload): boolean {
  return (
    (s.state === "CALIBRATE" || s.state === "WARMING_UP" || s.state === "TRACKING") &&
    s.failures >= NO_STARS_FAILURES
  );
}

export function formatRa(deg: number): string {
  const raH = (((deg % 360) + 360) % 360) / 15;
  let h = Math.floor(raH);
  let m = Math.floor((raH - h) * 60);
  let s = Math.round((raH - h - m / 60) * 36000) / 10;
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; h = (h + 1) % 24; }
  return `${h}h ${String(m).padStart(2, "0")}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDec(deg: number): string {
  const sign = deg < 0 ? "−" : "+";
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = Math.round((abs - d - m / 60) * 3600);
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${sign}${d}° ${String(m).padStart(2, "0")}′ ${String(s).padStart(2, "0")}″`;
}

/** Angular distance: degrees from 1° up, arcminutes below. */
export function formatDistance(sep: number | null): string {
  if (sep === null) return "—";
  if (sep >= 1) return `${sep.toFixed(1)}°`;
  return `${(sep * 60).toFixed(1)}′`;
}

/**
 * Offset of an in-frame target from the eyepiece origin, in degrees along the
 * mount's axes (right / up), undoing the finder rotation.
 */
export function mountDeltas(
  s: Pick<EnginePayload, "origin_x" | "origin_y" | "fov_h_deg" | "image_w" | "finder_rotation">,
  pixelX: number,
  pixelY: number,
): { right: number; up: number } {
  const scale = s.image_w / (2 * Math.tan(((s.fov_h_deg / 2) * Math.PI) / 180));
  const dx = (pixelX - s.origin_x) / scale;
  const dy = (s.origin_y - pixelY) / scale;
  const phi = (-s.finder_rotation * Math.PI) / 180;
  return {
    right: dx * Math.cos(phi) - dy * Math.sin(phi),
    up: dx * Math.sin(phi) + dy * Math.cos(phi),
  };
}
