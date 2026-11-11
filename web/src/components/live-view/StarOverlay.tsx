import type { EnginePayload } from "@/lib/types";

interface Props {
  state: EnginePayload;
}

/**
 * All detected centroids (dim red) and matched centroids (bright red).
 * Mirrors window.py _draw_star_overlay (~1828).
 */
export function StarOverlay({ state }: Props) {
  const all = state.camera.all_centroids ?? [];
  const matched = state.camera.matched_centroids ?? [];
  const matchedKeys = new Set(
    matched.map(([y, x]) => `${y.toFixed(1)}:${x.toFixed(1)}`),
  );
  return (
    <g>
      {all.map(([y, x], i) => {
        const isMatched = matchedKeys.has(`${y.toFixed(1)}:${x.toFixed(1)}`);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isMatched ? 8 : 6}
            fill="none"
            className={isMatched ? "stroke-overlay-strong" : "stroke-overlay-dim"}
            strokeWidth={isMatched ? 2 : 1}
          />
        );
      })}
    </g>
  );
}
