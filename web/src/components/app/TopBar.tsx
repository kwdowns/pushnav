import { useState } from "react";
import {
  Maximize,
  Minimize,
  Settings as SettingsIcon,
  CircleCheck,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AppBar, Button } from "@/components/ui";
import { useFullscreen } from "@/hooks/useFullscreen";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusBadgeFor } from "@/lib/screen";
import type { EnginePayload } from "@/lib/types";
import { SettingsSheet } from "./SettingsSheet";

interface Props {
  state: EnginePayload;
  showStars: boolean;
  setShowStars: (v: boolean) => void;
}

export function TopBar({ state, showStars, setShowStars }: Props) {
  const fullscreen = useFullscreen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const badge = statusBadgeFor(state);

  return (
    <AppBar>
      <img
        src={`${import.meta.env.BASE_URL}inapp-title.png`}
        alt="PushNav"
        // A long badge matters more than the wordmark on a narrow phone.
        className={cn("h-8 w-auto shrink-0", badge.label.length > 7 && "max-sm:hidden")}
      />
      <div className="flex flex-1 justify-end">
        {/* Status, not a control: plain icon + text. Borders and fills are
            reserved for things you can tap. */}
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1.5 text-label whitespace-nowrap",
            badge.variant === "solid" ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {badge.alert ? (
            <TriangleAlert className="size-4" aria-hidden />
          ) : badge.variant === "solid" ? (
            <CircleCheck className="size-4" aria-hidden />
          ) : null}
          {badge.label}
        </span>
      </div>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={state.audio_enabled ? "Mute audio" : "Unmute audio"}
          aria-pressed={state.audio_enabled}
          onClick={() =>
            api.setSettings({ audio_enabled: !state.audio_enabled }).catch(console.error)
          }
        >
          {state.audio_enabled ? <Volume2 /> : <VolumeX />}
        </Button>
        {fullscreen.supported && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
            onClick={fullscreen.toggle}
          >
            {fullscreen.active ? <Minimize /> : <Maximize />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon />
        </Button>
      </div>
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        state={state}
        showStars={showStars}
        setShowStars={setShowStars}
      />
    </AppBar>
  );
}
