import { Orbit, SlidersHorizontal } from "lucide-react";
import { Alert, Card, Disclosure, Spinner, Steps } from "@/components/ui";
import { CameraControls } from "@/components/controls/CameraControls";
import { cameraControlsSummary } from "@/lib/controlFormat";
import { SkyDome } from "@/components/live-view/SkyDome";
import { RetryCameraButton } from "@/components/RetryCameraButton";
import { isSetupPhase, SETUP_STEPS, stepIndexFor } from "@/lib/screen";
import type { EnginePayload } from "@/lib/types";
import {
  CalibrateCard,
  SetupCard,
  SyncCard,
  SyncConfirmCard,
  WarmingUpCard,
} from "./SetupCards";
import { RestartSetupButton, TrackingPanel } from "./TrackingPanel";

type Props = { state: EnginePayload };

function InstructionCard({ state }: Props) {
  switch (state.state) {
    case "SETUP":        return <SetupCard state={state} />;
    case "SYNC":         return <SyncCard state={state} />;
    case "SYNC_CONFIRM": return <SyncConfirmCard state={state} />;
    case "CALIBRATE":    return <CalibrateCard />;
    case "WARMING_UP":   return <WarmingUpCard state={state} />;
    default:             return null;
  }
}

/** Exposure / gain, open, for the setup steps. */
function CameraCard({ state }: Props) {
  return (
    <Card aria-label="Camera controls">
      <CameraControls controls={state.controls} />
    </Card>
  );
}

/** Exposure / gain tucked away once the wizard is done. */
function CameraDisclosure({ state }: Props) {
  return (
    <Disclosure
      title="Camera"
      icon={<SlidersHorizontal aria-hidden />}
      summary={cameraControlsSummary(state.controls)}
    >
      <CameraControls controls={state.controls} />
    </Disclosure>
  );
}

function SkyDomeDisclosure({ state }: Props) {
  const p = state.pointing;
  const nav = state.nav;
  return (
    <Disclosure title="Sky view" icon={<Orbit aria-hidden />}>
      <SkyDome
        className="h-64 md:h-72"
        pointingRaDeg={p.valid ? p.ra_deg : null}
        pointingDecDeg={p.valid ? p.dec_deg : null}
        targetRaDeg={nav?.active ? nav.target_ra_deg : null}
        targetDecDeg={nav?.active ? nav.target_dec_deg : null}
        targetLabel={nav?.target_name ?? null}
        latDeg={state.location.latitude}
        lonDeg={state.location.longitude}
      />
    </Disclosure>
  );
}

/**
 * Everything under the camera frame that depends on the engine state:
 * setup → progress, camera sliders, instructions; tracking → target readout
 * with the camera controls and sky dome folded away.
 */
export function StepArea({ state }: Props) {
  if (isSetupPhase(state.state)) {
    const step = stepIndexFor(state.state) ?? 0;
    // On the first step the sliders are the task, so they lead.
    const slidersFirst = state.state === "SETUP";
    return (
      <div className="flex flex-col gap-3" data-section="setup">
        <Steps steps={SETUP_STEPS} current={step} />
        {slidersFirst && <CameraCard state={state} />}
        <InstructionCard state={state} />
        {!slidersFirst && <CameraCard state={state} />}
      </div>
    );
  }

  if (state.state === "TRACKING") {
    return (
      <div className="flex flex-col gap-3" data-section="tracking">
        <TrackingPanel state={state} />
        <CameraDisclosure state={state} />
        <SkyDomeDisclosure state={state} />
        <RestartSetupButton />
      </div>
    );
  }

  // RECONNECTING / ERROR: camera trouble.
  return (
    <div className="flex flex-col gap-3" data-section="camera-trouble">
      {state.state === "RECONNECTING" ? (
        <Alert variant="warning" title="Reconnecting to the camera…" action={<Spinner label="Reconnecting" />}>
          The camera dropped out. Trying again for a few seconds.
        </Alert>
      ) : (
        // ERROR only follows a failed camera recovery; a successful retry
        // brings the engine back to SETUP, so offer that instead of a restart.
        <Alert variant="error" title="Camera lost" action={<RetryCameraButton label="Retry" />}>
          Plug it back in, then retry.
        </Alert>
      )}
      <CameraDisclosure state={state} />
    </div>
  );
}
