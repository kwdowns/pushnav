import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatControlValue } from "@/lib/controlFormat";
import type { ControlDescriptor } from "@/lib/types";

interface Props {
  controls: ControlDescriptor[];
}

export function CameraControls({ controls }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {controls.map((c) => (
          <ControlRow key={c.id ?? c.name} control={c} />
        ))}
      </CardContent>
    </Card>
  );
}

function ControlRow({ control }: { control: ControlDescriptor }) {
  const id = control.id ?? control.name ?? "";
  const serverValue = control.cur ?? control.value ?? control.min;
  const [local, setLocal] = useState(serverValue);

  // Reflect server-side updates
  useEffect(() => { setLocal(serverValue); }, [serverValue]);

  const commit = (v: number) => {
    setLocal(v);
    api.setControl(id, v).catch((e) => console.error(e));
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{control.label}</span>
        <span className="text-muted-foreground">{formatControlValue(local, control.unit, control.display_scale ?? 1)}</span>
      </div>
      <Slider
        min={control.min}
        max={control.max}
        step={control.step ?? 1}
        value={[local]}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => commit(v)}
      />
    </div>
  );
}
