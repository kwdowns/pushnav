import { useMemo } from "react";
import { Alert, Button } from "@/components/ui";
import { darknessAt } from "@/lib/astronomy";
import { formatClock } from "./items";

interface Props {
  location: { latitude: number; longitude: number };
  /** Wall-clock time the visibility is computed for. */
  evalAt: Date;
  /** Applied observation-time offset in minutes. */
  appliedOffsetMin: number;
  onApply: (offsetMin: number) => void;
}

/** Warns when the chosen time isn't astronomically dark yet, with a jump to when it is. */
export function DarknessBanner({ location, evalAt, appliedOffsetMin, onApply }: Props) {
  const info = useMemo(
    () => darknessAt({ latDeg: location.latitude, lonDeg: location.longitude, date: evalAt }),
    [location, evalAt],
  );
  if (info.status === "dark") return null;

  const target = "darkFrom" in info ? info.darkFrom : info.darkest;
  // Round up to the slider's 5-minute step so the jump lands in darkness
  const jumpMin =
    appliedOffsetMin + Math.ceil((target.getTime() - evalAt.getTime()) / 60_000 / 5) * 5;

  return (
    <Alert
      variant="warning"
      title={`${info.status === "day" ? "Daytime" : "Twilight"} at ${formatClock(evalAt)}`}
      action={
        <Button variant="secondary" size="sm" onClick={() => onApply(jumpMin)}>
          Show then
        </Button>
      }
    >
      <p className="text-label text-foreground">
        {"darkFrom" in info
          ? `The sky gets dark at ${formatClock(info.darkFrom)}. Until then, most of these objects won't show.`
          : `The sky doesn't get fully dark tonight. It's darkest around ${formatClock(info.darkest)}, with the Sun ${Math.round(-info.darkestSunAltDeg)}° below the horizon.`}
      </p>
    </Alert>
  );
}
