import type { EnginePayload } from "@/lib/types";
import { api } from "@/lib/api";

interface Props {
  state: EnginePayload;
}

/**
 * Renders clickable markers over each sync candidate so the user can pick
 * which star they actually centred in the eyepiece. Selected candidate gets
 * a brighter, larger ring + filled inner dot; unselected get a dim ring.
 */
export function SyncCandidatesOverlay({ state }: Props) {
  const candidates = state.sync.candidates;
  const selectedIdx = state.sync.selected_idx;
  if (!candidates.length) return null;
  // Sized for a 1280 px frame; scale so the rings and numbers stay legible
  // whatever the camera resolution.
  const k = state.image_w / 1280;

  return (
    <g>
      {candidates.map((c, i) => {
        const isSelected = c.idx === selectedIdx;
        const ringRadius = (isSelected ? 34 : 24) * k;
        const ringClass = isSelected ? "stroke-overlay-strong" : "stroke-overlay";
        const strokeWidth = (isSelected ? 4 : 3) * k;
        const labelNum = i + 1;
        const labelOffset = ringRadius + 14 * k;
        return (
          <g
            key={c.idx}
            style={{ cursor: "pointer" }}
            onClick={() => api.syncSelect(c.idx)}
          >
            {/* Transparent hit target, >= 44 px on a phone-width frame */}
            <circle
              cx={c.pixel_x}
              cy={c.pixel_y}
              r={80 * k}
              fill="transparent"
              stroke="none"
            />
            <circle
              cx={c.pixel_x}
              cy={c.pixel_y}
              r={ringRadius}
              fill="none"
              className={ringClass}
              strokeWidth={strokeWidth}
            />
            {isSelected && (
              <circle
                cx={c.pixel_x}
                cy={c.pixel_y}
                r={6 * k}
                className="fill-overlay-strong"
              />
            )}
            <text
              x={c.pixel_x + labelOffset}
              y={c.pixel_y - labelOffset / 2}
              className={isSelected ? "fill-overlay-strong" : "fill-overlay"}
              fontSize={44 * k}
              fontWeight="bold"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {labelNum}
            </text>
          </g>
        );
      })}
    </g>
  );
}
