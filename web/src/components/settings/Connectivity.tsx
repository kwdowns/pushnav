import { useState } from "react";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button, SegmentedControl, StatusDot } from "@/components/ui";
import { api } from "@/lib/api";
import type { ActivityLine, EnginePayload } from "@/lib/types";

// --red-300 on --red-950. qrcode.react writes these into SVG attributes,
// where CSS variables don't resolve, so they are spelled out.
const QR_FG = "#ff0000";
const QR_BG = "#0a0000";

const EPOCHS = [
  { value: "jnow", label: "JNow" },
  { value: "j2000", label: "J2000" },
] as const;

function ClientRow({ name, line }: { name: string; line: ActivityLine }) {
  return (
    <div className="flex min-h-touch-sm items-center justify-between gap-3">
      <StatusDot active={line.active} label={name} />
      <span className="readout truncate text-label text-muted-foreground">
        {line.address ?? "Not connected"}
      </span>
    </div>
  );
}

export function Connectivity({ state }: { state: EnginePayload }) {
  const [showQR, setShowQR] = useState(false);
  const url = state.webserver.url;

  return (
    <section className="flex flex-col gap-3" aria-label="Connectivity">
      <div className="flex flex-col gap-1">
        <span className="text-label text-foreground">Open on your phone</span>
        {url ? (
          <code className="readout text-body break-all">{url}</code>
        ) : (
          <span className="text-label text-muted-foreground">No network address found.</span>
        )}
      </div>
      {url && (
        <>
          <Button
            variant="secondary"
            className="self-start"
            aria-expanded={showQR}
            onClick={() => setShowQR((v) => !v)}
          >
            <QrCode aria-hidden />
            {showQR ? "Hide QR code" : "Show QR code"}
          </Button>
          {showQR && (
            <div className="self-start rounded-lg border border-border p-3" style={{ background: QR_BG }}>
              <QRCodeSVG value={url} size={176} bgColor={QR_BG} fgColor={QR_FG} />
            </div>
          )}
        </>
      )}

      <div className="flex flex-col">
        <ClientRow name="Stellarium (desktop)" line={state.stellarium} />
        <ClientRow name="LX200 (SkySafari, Stellarium Mobile)" line={state.lx200} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground">LX200 coordinate epoch</span>
        <SegmentedControl
          aria-label="LX200 coordinate epoch"
          value={state.lx200.epoch ?? "jnow"}
          options={EPOCHS}
          onValueChange={(e) => api.setSettings({ lx200_epoch: e }).catch(console.error)}
        />
        <p className="text-label text-muted-foreground">
          JNow for SkySafari (standard). Switch to J2000 if Stellarium Mobile
          PLUS centers slightly off target.
        </p>
      </div>
    </section>
  );
}
