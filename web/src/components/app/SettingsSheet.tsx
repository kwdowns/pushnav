import {
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui";
import { LocationPanel } from "@/components/catalog/LocationPanel";
import { DebugPanel } from "@/components/debug/DebugPanel";
import { Connectivity } from "@/components/settings/Connectivity";
import { Settings } from "@/components/settings/Settings";
import type { EnginePayload } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: EnginePayload;
  showStars: boolean;
  setShowStars: (v: boolean) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-heading">{title}</h2>
      {children}
    </div>
  );
}

/** Settings, connectivity, observer location and (dev mode) debug tools. */
export function SettingsSheet({ open, onOpenChange, state, showStars, setShowStars }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Display, connections and location.</SheetDescription>
        </SheetHeader>
        <SheetBody className="gap-5 pb-[max(1rem,var(--safe-bottom))]">
          <Settings state={state} showStars={showStars} setShowStars={setShowStars} />
          <Separator />
          <Section title="Connections">
            <Connectivity state={state} />
          </Section>
          <Separator />
          {/* LocationPanel brings its own "Location" heading. */}
          <LocationPanel state={state} />
          {state.dev_mode && (
            <>
              <Separator />
              <Section title="Debug">
                <DebugPanel state={state} />
              </Section>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
