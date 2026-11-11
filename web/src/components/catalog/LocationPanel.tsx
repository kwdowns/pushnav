import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { EnginePayload } from "@/lib/types";

interface Props {
  state: EnginePayload;
}

/** Accept a typographic minus as well as a hyphen. */
function parseCoord(s: string): number {
  const t = s.trim().replace(/[−–]/g, "-");
  return t === "" ? NaN : Number(t);
}

const SOURCE_LABELS = { stellarium: "From Stellarium", manual: "Set by you" } as const;

/** Observer latitude / longitude, used for visibility maths. Lives in Settings. */
export function LocationPanel({ state }: Props) {
  const activeLat = state.location?.latitude ?? null;
  const activeLon = state.location?.longitude ?? null;
  const source = state.location?.source ?? null;
  const activeLatStr = activeLat !== null ? activeLat.toFixed(2) : "";
  const activeLonStr = activeLon !== null ? activeLon.toFixed(2) : "";

  const [latInput, setLatInput] = useState(activeLatStr);
  const [lonInput, setLonInput] = useState(activeLonStr);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Follow the engine's active location (Stellarium connect/disconnect, save,
  // clear) without an effect: reset the inputs while rendering when it changes.
  const [syncedTo, setSyncedTo] = useState(`${activeLatStr}|${activeLonStr}`);
  if (syncedTo !== `${activeLatStr}|${activeLonStr}`) {
    setSyncedTo(`${activeLatStr}|${activeLonStr}`);
    setLatInput(activeLatStr);
    setLonInput(activeLonStr);
  }

  const lat = parseCoord(latInput);
  const lon = parseCoord(lonInput);
  const latOk = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lonOk = Number.isFinite(lon) && lon >= -180 && lon <= 180;
  const dirty = latInput !== activeLatStr || lonInput !== activeLonStr;
  const hasManual = source === "manual";

  async function run(settings: Parameters<typeof api.setSettings>[0]) {
    setSaving(true);
    setSaveError(null);
    try {
      await api.setSettings(settings);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-heading text-foreground">Location</h3>
        <span className="text-label text-muted-foreground">
          {source ? SOURCE_LABELS[source] : "Not set"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Latitude"
          hint="+ north, - south"
          error={latInput !== "" && !latOk ? "Between -90 and 90." : undefined}
        >
          <Input
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="40.71"
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
          />
        </Field>
        <Field
          label="Longitude"
          hint="+ east, - west"
          error={lonInput !== "" && !lonOk ? "Between -180 and 180." : undefined}
        >
          <Input
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="-74.01"
            value={lonInput}
            onChange={(e) => setLonInput(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-label text-muted-foreground">
        For example New York 40.71, -74.01 or Sydney -33.87, 151.21.
      </p>
      {saveError && (
        <Alert variant="error" title="Couldn't save the location">
          {saveError}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          loading={saving}
          disabled={!dirty || !latOk || !lonOk}
          onClick={() => run({ location: { latitude: lat, longitude: lon } })}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          disabled={!hasManual || saving}
          onClick={() => {
            setLatInput("");
            setLonInput("");
            void run({ location: null });
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
