import { useState, type CSSProperties } from "react";
import { CameraOff, Moon, OctagonAlert, Sun } from "lucide-react";
import { Button } from "@/components/ui";
import type { EnginePayload } from "@/lib/types";
import { useLatestFrame } from "@/hooks/useLatestFrame";
import { hasNoStars } from "@/lib/screen";
import { cn } from "@/lib/utils";
import { StarOverlay } from "./StarOverlay";
import { NavOverlay } from "./NavOverlay";
import { SyncCandidatesOverlay } from "./SyncCandidatesOverlay";
import { AxesOverlay } from "./AxesOverlay";

interface Props {
  state: EnginePayload;
  showStars: boolean;
  className?: string;
}

/**
 * Camera frame + overlays. The box is sized to the frame's aspect ratio and
 * capped in height (`--frame-max-h`, default 40svh) by narrowing it, so the
 * image always fills it exactly: no letterbox strips.
 */
const TINT_KEY = "pushnav.frame_tint";

function loadNatural(): boolean {
  try {
    return window.localStorage.getItem(TINT_KEY) === "natural";
  } catch {
    return false;
  }
}

// Display-only stretch of the camera frame (see the <filter> below).
const FRAME_GAIN = 6;
const FRAME_BLACK = 0.05; // ~13/255, a typical dark-sky background

export function LiveView({ state, showStars, className }: Props) {
  const { image_w, image_h } = state;
  const noStars = hasNoStars(state);
  // Red (night vision, the default) or the camera's own white-light image.
  const [natural, setNatural] = useState(loadNatural);
  const toggleNatural = () => {
    const next = !natural;
    setNatural(next);
    try {
      window.localStorage.setItem(TINT_KEY, next ? "natural" : "red");
    } catch {
      // Storage unavailable: the choice just lasts for this visit.
    }
  };
  const frameUrl = useLatestFrame(state.camera?.frame_id);
  const style = {
    aspectRatio: `${image_w} / ${image_h}`,
    "--frame-ar": String(image_w / image_h),
  } as CSSProperties;

  return (
    <div
      data-slot="live-view"
      className={cn(
        "relative mx-auto w-[min(100%,calc(var(--frame-max-h,40svh)*var(--frame-ar)))] overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
      style={style}
    >
      {frameUrl ? (
        // Greyscale frame multiplied onto red: only the red channel is lit.
        // Red carries about a fifth of white's brightness, and a real night
        // frame is a ~14/255 sky with a few faint points, so the frame is
        // stretched first: sky level to black, 6x gain, points fattened.
        <div className={cn("absolute inset-0", !natural && "night-frame")}>
          <svg aria-hidden width="0" height="0" className="absolute">
            <filter id="pushnav-frame-stretch" colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="linear" slope={FRAME_GAIN} intercept={-FRAME_GAIN * FRAME_BLACK} />
                <feFuncG type="linear" slope={FRAME_GAIN} intercept={-FRAME_GAIN * FRAME_BLACK} />
                <feFuncB type="linear" slope={FRAME_GAIN} intercept={-FRAME_GAIN * FRAME_BLACK} />
              </feComponentTransfer>
              {/* Stars are 1-2 px points; fatten them so they survive a phone screen. */}
              <feMorphology operator="dilate" radius="1" />
            </filter>
          </svg>
          <img
            src={frameUrl}
            alt="Live camera frame"
            className="h-full w-full object-cover"
            style={natural ? undefined : { filter: "url(#pushnav-frame-stretch)" }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <CameraOff className="size-8" aria-hidden />
          <span className="text-label">
            {state.camera.connected ? "Waiting for a frame…" : "No camera"}
          </span>
        </div>
      )}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${image_w} ${image_h}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {showStars && <StarOverlay state={state} />}
        {!noStars && <AxesOverlay state={state} />}
        {!noStars && <NavOverlay state={state} />}
        {state.state === "SYNC_CONFIRM" && <SyncCandidatesOverlay state={state} />}
      </svg>
      {frameUrl && (
        <Button
          variant="secondary"
          size="icon-sm"
          className="absolute right-2 bottom-2 bg-card/80"
          aria-label={natural ? "Show camera in red" : "Show camera in natural colour"}
          aria-pressed={natural}
          onClick={toggleNatural}
        >
          {natural ? <Moon /> : <Sun />}
        </Button>
      )}
      {noStars && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border-[1.5px] border-primary bg-card px-3 py-2 text-label font-semibold"
        >
          <OctagonAlert className="size-5 shrink-0" aria-hidden />
          No stars. Point at darker sky, or check for clouds.
        </div>
      )}
    </div>
  );
}
