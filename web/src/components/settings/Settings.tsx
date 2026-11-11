import { RotateCcw } from "lucide-react";
import { Button, Field, Input, Separator, SettingRow, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import type { EnginePayload } from "@/lib/types";

export const DEFAULT_SHOW_STARS = false;
const DEFAULT_AUDIO_ENABLED = true;
const DEFAULT_MIN_MATCHES = 8;
const DEFAULT_MAX_PROB = 0.2;

interface Props {
  state: EnginePayload;
  showStars: boolean;
  setShowStars: (v: boolean) => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-heading">{children}</h2>;
}

export function Settings({ state, showStars, setShowStars }: Props) {
  function resetToDefaults() {
    setShowStars(DEFAULT_SHOW_STARS);
    api.setSettings({ audio_enabled: DEFAULT_AUDIO_ENABLED }).catch(console.error);
    api
      .setAdvanced({ min_matches: DEFAULT_MIN_MATCHES, max_prob: DEFAULT_MAX_PROB })
      .catch(console.error);
  }

  return (
    <section className="flex flex-col" aria-label="Settings">
      <SectionTitle>Display and sound</SectionTitle>
      <SettingRow label="Show detected stars" description="Circle every star the solver found.">
        <Switch checked={showStars} onCheckedChange={setShowStars} />
      </SettingRow>
      <SettingRow label="Audio feedback" description="Sounds on lock, loss and new targets.">
        <Switch
          checked={state.audio_enabled}
          onCheckedChange={(v) => api.setSettings({ audio_enabled: v }).catch(console.error)}
        />
      </SettingRow>
      {state.power?.available && (
        <SettingRow
          label="Power saving"
          description={`Caps the CPU at ${state.power.max_freq_mhz} MHz. Solves take a little longer but stay well under an exposure.`}
        >
          <Switch
            checked={state.power.cpu_cap}
            onCheckedChange={(v) => api.setSettings({ cpu_cap: v }).catch(console.error)}
          />
        </SettingRow>
      )}

      <Separator className="my-4" />
      <SectionTitle>Solver</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Min matches" hint="Stars matched before a solve counts. Higher is stricter.">
          <Input
            type="number"
            inputMode="numeric"
            min={3}
            max={50}
            step={1}
            defaultValue={state.min_matches}
            key={`min-${state.min_matches}`}
            onBlur={(e) =>
              api.setAdvanced({ min_matches: Number(e.currentTarget.value) }).catch(console.error)
            }
          />
        </Field>
        <Field label="Max probability" hint="False-match probability allowed. Lower is stricter.">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={0.01}
            defaultValue={state.max_prob}
            key={`max-${state.max_prob}`}
            onBlur={(e) =>
              api.setAdvanced({ max_prob: Number(e.currentTarget.value) }).catch(console.error)
            }
          />
        </Field>
      </div>
      <Button variant="secondary" className="mt-4" onClick={resetToDefaults}>
        <RotateCcw aria-hidden />
        Reset to defaults
      </Button>
    </section>
  );
}
