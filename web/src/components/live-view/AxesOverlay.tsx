import type { EnginePayload } from "@/lib/types";

interface Props {
  state: EnginePayload;
}

/**
 * Coordinate cross axes through the sync-offset origin, rotated by
 * finder_rotation. Mirrors the DPG _draw_coordinate_axes function in
 * window.py (1227-1300).
 */
export function AxesOverlay({ state }: Props) {
  if (!["CALIBRATE", "WARMING_UP", "TRACKING"].includes(state.state)) return null;
  if (!state.pointing.valid) return null;
  if (state.failures >= 3) return null;

  const cx = state.origin_x;
  const cy = state.origin_y;
  const phi = (state.finder_rotation * Math.PI) / 180;
  const upDx = Math.sin(phi);
  const upDy = -Math.cos(phi);
  const rightDx = Math.cos(phi);
  const rightDy = Math.sin(phi);

  const halfDiag = Math.sqrt(state.image_w ** 2 + state.image_h ** 2) / 2;
  // Label size tracks the frame width so it stays legible on a phone.
  const k = state.image_w / 1280;
  const labelDist = 200 * k;

  // SVG (CW) rotation needed so each label's baseline runs along the axis
  // it sits on. UP/DOWN sit on the mount-right axis at angle finder_rotation;
  // RIGHT/LEFT sit on the mount-up axis (perpendicular, finder_rotation - 90).
  // Normalised so letters never end up upside-down: when the raw rotation
  // would land in (90°, 270°), flip by 180° — the axis line is symmetric so
  // reading it the other way is fine, but the text needs to stay right-side up.
  const readable = (deg: number): number => {
    const r = ((deg % 360) + 360) % 360;
    return r > 90 && r < 270 ? (r + 180) % 360 : r;
  };
  const upDownRot = readable(state.finder_rotation);
  const leftRightRot = readable(state.finder_rotation - 90);
  const labels = [
    { text: "UP",    x: cx - rightDx * labelDist, y: cy - rightDy * labelDist, rot: upDownRot },
    { text: "DOWN",  x: cx + rightDx * labelDist, y: cy + rightDy * labelDist, rot: upDownRot },
    { text: "RIGHT", x: cx + upDx * labelDist,    y: cy + upDy * labelDist,    rot: leftRightRot },
    { text: "LEFT",  x: cx - upDx * labelDist,    y: cy - upDy * labelDist,    rot: leftRightRot },
  ];

  return (
    <g className="stroke-overlay-dim fill-overlay">
      {/* Cross axis 1 (mount-up direction) — solid, darker so it's not
          confused with the marching-ants nav line. */}
      <line
        x1={cx - rightDx * halfDiag} y1={cy - rightDy * halfDiag}
        x2={cx + rightDx * halfDiag} y2={cy + rightDy * halfDiag}
        strokeWidth={1}
      />
      {/* Cross axis 2 (mount-right direction) */}
      <line
        x1={cx - upDx * halfDiag} y1={cy - upDy * halfDiag}
        x2={cx + upDx * halfDiag} y2={cy + upDy * halfDiag}
        strokeWidth={1}
      />
      {labels.map((l) => (
        <text
          key={l.text}
          x={l.x}
          y={l.y}
          transform={`rotate(${l.rot} ${l.x} ${l.y})`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={48 * k}
          fontWeight="bold"
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}
