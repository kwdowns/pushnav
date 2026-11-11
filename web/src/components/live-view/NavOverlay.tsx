import type { EnginePayload, NavData } from "@/lib/types";
import { formatDistance } from "@/lib/screen";

interface Props {
  state: EnginePayload;
}

const LOCKED_THRESHOLD_DEG = 0.15;

type Zone = "PUSH" | "CONVERGE" | "LOCKED";

function pickZone(nav: NavData): Zone {
  if (nav.in_fov && nav.separation_deg !== null && nav.separation_deg <= LOCKED_THRESHOLD_DEG) {
    return "LOCKED";
  }
  if (nav.in_fov) return "CONVERGE";
  return "PUSH";
}

/** Text on a dark rounded label so it reads over stars. */
function Pill({ x, y, text, fontSize }: { x: number; y: number; text: string; fontSize: number }) {
  const w = text.length * (fontSize * 0.6) + 14;
  const h = fontSize + 8;
  return (
    <g>
      <rect
        x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5}
        style={{ fill: "var(--overlay-label-bg)" }}
      />
      <text
        x={x} y={y} textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fontWeight="bold" className="fill-overlay-strong"
      >
        {text}
      </text>
    </g>
  );
}

/** Eyepiece reticle: ring + cross arms. */
function Reticle({
  cx, cy, ringR, armOuter, armInner, strokeW, className,
}: {
  cx: number; cy: number; ringR: number; armOuter: number; armInner: number;
  strokeW: number; className: string;
}) {
  return (
    <g strokeWidth={strokeW} fill="none" className={className}>
      <circle cx={cx} cy={cy} r={ringR} />
      <line x1={cx - armOuter} y1={cy} x2={cx - armInner} y2={cy} />
      <line x1={cx + armInner} y1={cy} x2={cx + armOuter} y2={cy} />
      <line x1={cx} y1={cy - armOuter} x2={cx} y2={cy - armInner} />
      <line x1={cx} y1={cy + armInner} x2={cx} y2={cy + armOuter} />
    </g>
  );
}

/** Comet-style arrow: a solid head with fading copies trailing behind.
 * angleDeg is clockwise from up (the tip points to (0,-22) locally). */
function CometArrow({ cx, cy, angleDeg, scale }: { cx: number; cy: number; angleDeg: number; scale: number }) {
  const ghosts = [4, 3, 2, 1, 0];
  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${angleDeg}) scale(${scale})`} className="fill-overlay-strong">
      {ghosts.map((i) => (
        <polygon
          key={i}
          transform={`translate(0 ${i * 9})`}
          opacity={1 - i * 0.18}
          points="0,-22 -11,0 -3,0 -3,18 3,18 3,0 11,0"
        />
      ))}
    </g>
  );
}

export function NavOverlay({ state }: Props) {
  const nav = state.nav;
  if (!nav || !nav.active) return null;

  const zone = pickZone(nav);
  const ox = state.origin_x;
  const oy = state.origin_y;
  // Sized so text stays >= 12 px on a 1280 px frame shown 360 px wide (a
  // phone); scales with the frame's resolution.
  const k = state.image_w / 1280;
  const fs = 48 * k;

  if (zone === "PUSH") {
    if (nav.edge_x === null || nav.edge_y === null || nav.edge_angle_deg === null) {
      return null;
    }
    const angleRad = (nav.edge_angle_deg * Math.PI) / 180;
    // Arrow tip 68 px in from the frame edge.
    const tipX = nav.edge_x - Math.sin(angleRad) * 90 * k;
    const tipY = nav.edge_y + Math.cos(angleRad) * 90 * k;
    // Distance label sits off to one side of the push line.
    const dx = tipX - ox;
    const dy = tipY - oy;
    const len = Math.hypot(dx, dy) || 1;
    const labelX = tipX + (-dy / len) * 60 * k;
    const labelY = tipY + (dx / len) * 60 * k;
    return (
      <g>
        <Reticle cx={ox} cy={oy} ringR={12} armInner={4} armOuter={20} strokeW={1}
                 className="stroke-overlay-dim" />
        <line x1={ox} y1={oy} x2={nav.edge_x} y2={nav.edge_y}
              strokeWidth={2} strokeDasharray="8 6"
              className="stroke-overlay-strong pushnav-marching-ants" />
        <CometArrow cx={tipX} cy={tipY} angleDeg={nav.edge_angle_deg} scale={1.6 * k} />
        <Pill x={labelX} y={labelY} text={formatDistance(nav.separation_deg)} fontSize={fs} />
      </g>
    );
  }

  if (zone === "CONVERGE") {
    if (nav.pixel_x === null || nav.pixel_y === null) return null;
    const tx = nav.pixel_x;
    const ty = nav.pixel_y;
    // Ring showing the lock zone around the eyepiece centre.
    const scale = state.image_w / (2 * Math.tan((state.fov_h_deg / 2) * (Math.PI / 180)));
    const lockR = Math.tan(LOCKED_THRESHOLD_DEG * (Math.PI / 180)) * scale;
    const dx = tx - ox;
    const dy = ty - oy;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    return (
      <g>
        <Reticle cx={ox} cy={oy} ringR={14} armInner={5} armOuter={24} strokeW={2}
                 className="stroke-overlay" />
        <circle cx={ox} cy={oy} r={lockR} strokeWidth={1} fill="none"
                className="stroke-overlay-dim" />
        <line x1={ox} y1={oy} x2={tx} y2={ty} strokeWidth={1} strokeDasharray="8 6"
              className="stroke-overlay pushnav-marching-ants" />
        {/* Target marker: glides between WebSocket updates. */}
        <g style={{ transform: `translate(${tx}px, ${ty}px)`, transition: "transform 100ms linear" }}>
          <circle cx={0} cy={0} r={18} strokeWidth={2} fill="none" className="stroke-overlay-strong" />
          <circle cx={0} cy={0} r={2} className="fill-overlay-strong" />
        </g>
        <Pill x={tx + perpX * 50 * k} y={ty + perpY * 50 * k} text={formatDistance(nav.separation_deg)} fontSize={fs} />
        {nav.target_name && (
          <Pill x={tx + perpX * 100 * k} y={ty + perpY * 100 * k} text={nav.target_name} fontSize={fs} />
        )}
      </g>
    );
  }

  // LOCKED: concentric rings + centre dot, gently pulsing.
  return (
    <g>
      <g fill="none" className="stroke-overlay-strong animate-pulse">
        <circle cx={ox} cy={oy} r={20} strokeWidth={2} />
        <circle cx={ox} cy={oy} r={14} strokeWidth={3} />
        <circle cx={ox} cy={oy} r={8} strokeWidth={2} />
        <circle cx={ox} cy={oy} r={4} className="fill-overlay-strong" stroke="none" />
      </g>
      {nav.target_name && <Pill x={ox} y={oy - 60 * k} text={nav.target_name} fontSize={fs} />}
      <Pill x={ox} y={oy + 60 * k} text="ON TARGET" fontSize={fs} />
    </g>
  );
}
