import { useState } from "react";
import { Crosshair, RotateCcw, X } from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Readout,
  ReadoutGrid,
  Separator,
} from "@/components/ui";
import { useNearestObject } from "@/hooks/useNearestObject";
import { api } from "@/lib/api";
import { CENTERED_DEG } from "@/lib/nearest";
import { formatDec, formatDistance, formatRa, mountDeltas } from "@/lib/screen";
import type { EnginePayload } from "@/lib/types";

type Props = { state: EnginePayload };

function TargetReadout({ state }: Props) {
  const nav = state.nav!;
  const p = state.pointing;
  const deltas =
    p.valid && nav.in_fov && nav.pixel_x !== null && nav.pixel_y !== null
      ? mountDeltas(state, nav.pixel_x, nav.pixel_y)
      : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-caption text-muted-foreground uppercase">Target</span>
          <span className="truncate text-heading">{nav.target_name ?? "Custom position"}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => api.clearGoto().catch(console.error)}
        >
          <X aria-hidden />
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="readout text-display" aria-label="Distance to target">
          {formatDistance(nav.separation_deg)}
        </span>
        {!p.valid ? (
          <span className="text-body text-muted-foreground">Waiting for a solve…</span>
        ) : deltas ? (
          <span className="readout text-body">
            {deltas.right >= 0 ? "Right" : "Left"} {Math.abs(deltas.right).toFixed(2)}° ·{" "}
            {deltas.up >= 0 ? "Up" : "Down"} {Math.abs(deltas.up).toFixed(2)}°
          </span>
        ) : (
          nav.direction_text && <span className="text-body">{nav.direction_text}</span>
        )}
      </div>
      <p className="text-label text-muted-foreground">1° is about two full moons wide.</p>
    </div>
  );
}

/** Names what the scope is on, or the closest named object to it. */
function NearestObject({ state }: Props) {
  const p = state.pointing;
  const nearest = useNearestObject(p.valid ? p.ra_deg : null, p.valid ? p.dec_deg : null);
  if (!nearest) return null;
  const centered = nearest.sep_deg <= CENTERED_DEG;
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-caption text-muted-foreground uppercase">
        {centered ? "Centered on" : "Nearest object"}
      </span>
      <span className="text-heading">{nearest.place.name}</span>
      <span className="text-label text-muted-foreground">
        {nearest.place.kind}
        {!centered && (
          <>
            {" · "}
            <span className="readout">{formatDistance(nearest.sep_deg)}</span> away
          </>
        )}
      </span>
    </div>
  );
}

function PointingReadouts({ state }: Props) {
  const p = state.pointing;
  const dash = "—";
  return (
    <ReadoutGrid cols={2} className="lg:grid-cols-3">
      <Readout label="RA" value={p.valid ? formatRa(p.ra_deg) : dash} />
      <Readout label="Dec" value={p.valid ? formatDec(p.dec_deg) : dash} />
      <Readout label="Roll" value={p.valid ? `${p.roll_deg.toFixed(1)}°` : dash} />
      <Readout label="Matches" value={p.valid ? p.matches : dash} />
      <Readout label="Prob" value={p.valid ? p.prob.toExponential(1) : dash} />
      <Readout
        label="Age"
        value={p.solve_age_s !== null ? `${p.solve_age_s.toFixed(1)} s` : dash}
      />
    </ReadoutGrid>
  );
}

/** Tracking: where the target is, and where the scope points. */
export function TrackingPanel({ state }: Props) {
  const hasTarget = !!state.nav?.active;
  return (
    <Card aria-label="Tracking">
      {hasTarget ? (
        <TargetReadout state={state} />
      ) : (
        <EmptyState
          className="py-3"
          icon={<Crosshair />}
          title="No target"
          description={
            <>
              Pick one from <span className="md:hidden">the list below</span>
              <span className="hidden md:inline">the list</span>, or send one
              from SkySafari or Stellarium.
            </>
          }
        />
      )}
      <Separator />
      <NearestObject state={state} />
      <PointingReadouts state={state} />
    </Card>
  );
}

/** Stops tracking and starts the wizard over, after a confirmation. */
export function RestartSetupButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        <RotateCcw aria-hidden />
        Restart setup
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restart setup?</DialogTitle>
          <DialogDescription>
            Tracking stops and the wizard starts again from camera setup. You
            can reuse this calibration at the sync step.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep tracking</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              setOpen(false);
              api.wizardAdvance().catch(console.error);
            }}
          >
            <RotateCcw aria-hidden />
            Restart setup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
