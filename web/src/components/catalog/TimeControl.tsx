import { useState } from "react";
import { Button, SliderField } from "@/components/ui";
import { formatClock } from "./items";

interface Props {
  /** Wall-clock "now" in ms; the slider offsets from it. */
  now: number;
  /** Applied offset in minutes. */
  appliedOffsetMin: number;
  /** Called with the new offset when the slider is released or nudged. */
  onApply: (offsetMin: number) => void;
}

const MAX_MIN = 360; // 6 hours (stretched when "Show then" jumps further)

function formatOffset(min: number): string {
  if (min === 0) return "Now";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `+${h}h ${m}m` : `+${m}m`;
}

/**
 * Observation-time slider. Dragging only previews the value; the list
 * re-evaluates when the thumb is released (or −/+ is tapped).
 */
export function TimeControl({ now, appliedOffsetMin, onApply }: Props) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? appliedOffsetMin;

  return (
    <div className="flex flex-col gap-2">
      <SliderField
        label="Observation time"
        value={shown}
        min={0}
        max={Math.max(MAX_MIN, appliedOffsetMin)}
        step={5}
        formatValue={(v) => `${formatOffset(v)} · ${formatClock(new Date(now + v * 60_000))}`}
        onValueChange={setDraft}
        onValueCommit={(v) => {
          onApply(v);
          setDraft(null);
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={shown === 0}
        onClick={() => {
          setDraft(null);
          onApply(0);
        }}
      >
        Reset to now
      </Button>
    </div>
  );
}
