import { useState } from "react";
import { Camera, Crosshair } from "lucide-react";
import { Button, Chip } from "@/components/ui";
import { api } from "@/lib/api";
import type { EnginePayload } from "@/lib/types";

const SAMPLES = ["a", "b", "c", "d", "orion"];

// The sample the user just tapped, plus the server's value at that moment.
// The WS payload lags ~100 ms behind a tap, so until the server reports
// something new we show the tap; after that the server is the truth.
type Pending = { value: string | null; serverAtTap: string | null } | null;

export function DebugPanel({ state }: { state: EnginePayload }) {
  const [captureMsg, setCaptureMsg] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  const activeSample =
    pending !== null && pending.serverAtTap === state.sample_active
      ? pending.value
      : state.sample_active;

  async function onCapture() {
    try {
      const r = await api.dev.captureFrame();
      setCaptureMsg(r.path ? `Saved: ${r.path}` : r.error || "Failed");
    } catch (e: unknown) {
      setCaptureMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function toggleSample(name: string) {
    const next = activeSample === name ? null : name;
    setPending({ value: next, serverAtTap: state.sample_active });
    api.dev.injectSample(next).catch((e) => {
      console.error(e);
      setPending(null); // server didn't accept: fall back to its value
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Debug">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onCapture}>
          <Camera aria-hidden />
          Capture frame
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => api.dev.injectTarget(79.1723, 45.998).catch(console.error)}
        >
          <Crosshair aria-hidden />
          Inject Capella
        </Button>
      </div>
      {captureMsg && (
        <p className="readout text-label break-all text-muted-foreground">{captureMsg}</p>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground">Sample image as camera input</span>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((n) => (
            <Chip key={n} pressed={activeSample === n} onPressedChange={() => toggleSample(n)}>
              {n}.png
            </Chip>
          ))}
        </div>
      </div>
    </section>
  );
}
