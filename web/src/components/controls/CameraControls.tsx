import { useState } from "react";
import { SliderField } from "@/components/ui";
import { api } from "@/lib/api";
import { controlValue, formatControl } from "@/lib/controlFormat";
import type { ControlDescriptor } from "@/lib/types";

function controlId(c: ControlDescriptor): string {
  return c.id ?? c.name ?? c.label;
}

/** Exposure / gain sliders. No card: the caller decides the container. */
export function CameraControls({ controls }: { controls: ControlDescriptor[] }) {
  if (controls.length === 0) {
    return (
      <p className="text-label text-muted-foreground">
        No camera controls available.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {controls.map((c) => (
        <ControlSlider key={controlId(c)} control={c} />
      ))}
    </div>
  );
}

function ControlSlider({ control }: { control: ControlDescriptor }) {
  const server = controlValue(control);
  // The value being dragged, plus the server value it was started from. Once
  // the server reports something else (our commit landed, or another client
  // moved it), the server wins — no effect needed to resync.
  const [local, setLocal] = useState<{ value: number; from: number } | null>(null);
  const value = local !== null && local.from === server ? local.value : server;

  return (
    <SliderField
      label={control.label}
      value={value}
      min={control.min}
      max={control.max}
      step={control.step || 1}
      formatValue={(v) => formatControl(control, v)}
      onValueChange={(v) => setLocal({ value: v, from: server })}
      onValueCommit={(v) => {
        setLocal({ value: v, from: server });
        api.setControl(controlId(control), v).catch(console.error);
      }}
    />
  );
}
