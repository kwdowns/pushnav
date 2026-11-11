// Instruction card for each setup state: what to do, plus the step's one
// primary action. Rendered by StepArea under the camera frame.
import { RotateCcw, SkipForward } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  List,
  ListRow,
  Spinner,
} from "@/components/ui";
import { RetryCameraButton } from "@/components/RetryCameraButton";
import { api } from "@/lib/api";
import type { EnginePayload } from "@/lib/types";

type Props = { state: EnginePayload };

const PRIMARY = "w-full md:w-auto";

export function SetupCard({ state }: Props) {
  const noCamera = !state.camera.connected;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus on the stars</CardTitle>
        <CardDescription>
          Stars should look like small, sharp dots, not blurry blobs. Adjust
          exposure until they do, then press Next.
        </CardDescription>
      </CardHeader>
      {noCamera && (
        <Alert
          variant="warning"
          title="Camera not connected"
          action={<RetryCameraButton label="Retry" />}
        >
          Plate-solving needs the camera. Plug it in, then retry.
        </Alert>
      )}
      <CardFooter>
        <Button
          size="lg"
          className={PRIMARY}
          onClick={() => api.wizardAdvance()}
          disabled={noCamera}
        >
          Next
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SyncCard({ state }: Props) {
  const solving = state.sync.in_progress;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Center a bright star</CardTitle>
        <CardDescription>
          Pick any bright star you can see; you don't need its name. Center it
          in the eyepiece as precisely as you can (a higher-power eyepiece
          helps), then press Sync. The better it is centered, the more
          accurate the guidance for the rest of the night.
        </CardDescription>
      </CardHeader>
      {state.sync.error && <Alert variant="error">{state.sync.error}</Alert>}
      <CardFooter>
        <Button
          size="lg"
          className={PRIMARY}
          loading={solving}
          onClick={() => api.wizardAdvance()}
        >
          {solving ? "Solving…" : "Sync"}
        </Button>
        {state.has_calibration && (
          <Button
            variant="secondary"
            className="w-full md:w-auto"
            onClick={() => api.useCalibration()}
          >
            Use previous calibration
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function SyncConfirmCard({ state }: Props) {
  const candidates = state.sync.candidates.slice(0, 7);
  const selected = state.sync.selected_idx;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Which star did you center?</CardTitle>
        <CardDescription>
          The brightest star is picked for you. If you centered a different
          one, tap it below (numbers match the rings on the frame), then
          confirm.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button size="lg" className={PRIMARY} onClick={() => api.wizardAdvance()}>
          Confirm
        </Button>
        <Button
          variant="secondary"
          className="w-full md:w-auto"
          onClick={() => api.syncRetry()}
        >
          <RotateCcw aria-hidden />
          Re-solve
        </Button>
      </CardFooter>
      {candidates.length > 0 && (
        <List aria-label="Sync candidates">
          {candidates.map((c, i) => (
            <ListRow
              key={c.idx}
              leading={
                <span className="readout flex size-7 items-center justify-center rounded-full border-[1.5px] border-input text-label">
                  {i + 1}
                </span>
              }
              title={c.name}
              meta={`mag ${(Math.round(c.magnitude * 10) / 10 || 0).toFixed(1)}`}
              selected={c.idx === selected}
              onPress={() => api.syncSelect(c.idx)}
            />
          ))}
        </List>
      )}
    </Card>
  );
}

export function CalibrateCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Push the scope up</CardTitle>
        <CardDescription>
          Raise the telescope by at least half a degree and hold it still.
          This finishes on its own once the view settles; it measures how the
          camera is turned on the mount.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="secondary" onClick={() => api.wizardAdvance()}>
          <SkipForward aria-hidden />
          Skip calibration
        </Button>
      </CardFooter>
    </Card>
  );
}

export function WarmingUpCard({ state }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner label="Acquiring stars" />
          Acquiring stars…
        </CardTitle>
        <CardDescription>
          The first plate-solve usually takes 1–3 seconds.
          {state.failures > 0 && ` Failed solves so far: ${state.failures}.`}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="secondary" onClick={() => api.wizardAdvance()}>
          <RotateCcw aria-hidden />
          Stop and restart
        </Button>
      </CardFooter>
    </Card>
  );
}
