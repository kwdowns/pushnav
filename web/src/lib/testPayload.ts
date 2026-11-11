// Shared engine payload for component tests. Not imported by app code.
import type { EnginePayload } from "@/lib/types";

export const basePayload: EnginePayload = {
  state: "SETUP",
  failures: 0,
  pointing: { valid: false, ra_deg: 0, dec_deg: 0, roll_deg: 0, matches: 0, prob: 1, solve_age_s: null },
  nav: null,
  origin_x: 640, origin_y: 360, image_w: 1280, image_h: 720,
  finder_rotation: 0, fov_h_deg: 8.86,
  has_calibration: false, image_size: null,
  controls: [],
  sync: { in_progress: false, candidates: [], selected_idx: null, error: null },
  stellarium: { active: false, address: null },
  lx200: { active: false, address: null },
  webserver: { url: null },
  audio_enabled: true,
  power: { available: false, cpu_cap: false, max_freq_mhz: null },
  camera: { connected: true, frame_id: null, all_centroids: null, matched_centroids: null },
  location: { latitude: null, longitude: null, source: null },
  dev_mode: false, min_matches: 8, max_prob: 0.2, sample_active: null,
};

export function payload(over: Partial<EnginePayload> = {}): EnginePayload {
  return { ...basePayload, ...over };
}
