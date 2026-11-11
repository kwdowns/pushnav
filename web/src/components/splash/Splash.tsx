import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { EnginePayload } from "@/lib/types";

interface Props { state: EnginePayload | null }

export function Splash({ state }: Props) {
  // Local "dismissed" flag so the user can close the camera-not-found
  // dialog and keep using the catalog, connected clients, and settings.
  // The dialog is server-driven (re-renders at 10 Hz off state.camera.connected),
  // so a controlled `open`/`onOpenChange` pair without this flag would
  // immediately reopen on the next WebSocket tick.
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (state === null) {
    return (
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Spinner label="Connecting" />
              Connecting…
            </DialogTitle>
            <DialogDescription>Waiting for engine.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }
  if (!state.camera.connected && !dismissed) {
    const onRetry = async () => {
      setRetryError(null);
      setRetrying(true);
      try {
        const { connected } = await api.retryCamera();
        if (!connected) setRetryError("Still not detected.");
      } catch (e) {
        setRetryError(e instanceof Error ? e.message : String(e));
      } finally {
        setRetrying(false);
      }
    };
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) setDismissed(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Camera not found</DialogTitle>
            <DialogDescription>
              Plug in the USB camera and press Retry detection. If that
              doesn't work, quit PushNav completely and start it again; the
              camera is looked for once at startup. You can also close this
              to browse targets and use connected apps without
              plate-solving.
            </DialogDescription>
          </DialogHeader>
          {retryError && <Alert variant="error">{retryError}</Alert>}
          <DialogFooter>
            <Button size="lg" onClick={onRetry} loading={retrying}>
              {!retrying && <RefreshCcw aria-hidden />}
              {retrying ? "Detecting…" : "Retry detection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return null;
}
