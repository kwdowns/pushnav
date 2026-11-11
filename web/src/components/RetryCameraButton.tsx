import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui";
import { api } from "@/lib/api";

/** Asks the engine to probe for the camera again; shows why it failed. */
export function RetryCameraButton({
  variant = "secondary",
  label = "Retry camera",
}: {
  variant?: ButtonVariant;
  label?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClick = async () => {
    setError(null);
    setRetrying(true);
    try {
      const { connected } = await api.retryCamera();
      if (!connected) setError("Still not detected.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={variant} size="sm" onClick={onClick} loading={retrying}>
        {!retrying && <RefreshCcw aria-hidden />}
        {retrying ? "Detecting…" : label}
      </Button>
      {error && <p className="text-label text-muted-foreground">{error}</p>}
    </div>
  );
}
