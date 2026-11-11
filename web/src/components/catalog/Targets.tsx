import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, SegmentedControl, Spinner } from "@/components/ui";
import type { EnginePayload } from "@/lib/types";
import { isActiveTarget, type Location, type TargetItem } from "./items";
import { ManualPanel } from "./ManualPanel";
import { readStored, writeStored } from "./storage";
import type { TargetActions } from "./TargetList";
import { TargetDetail, type DetailState } from "./TargetDetail";
import { TonightPanel } from "./TonightPanel";
import { useGoto } from "./useGoto";

// The NGC + star data is large; only fetch it when Search is opened.
const SearchPanel = lazy(() => import("./SearchPanel"));

export interface TargetsProps {
  state: EnginePayload;
  /** Called after a target has been set successfully (e.g. "Go to" pressed). */
  onTargetSet?: () => void;
}

type Tab = "tonight" | "search" | "manual";
const TAB_KEY = "pushnav.targets.tab";
const TAB_OPTIONS = [
  { value: "tonight", label: "Tonight" },
  { value: "search", label: "Search" },
  { value: "manual", label: "Manual" },
] as const;

function loadTab(): Tab {
  const v = readStored(TAB_KEY);
  return v === "search" || v === "manual" ? v : "tonight";
}

/**
 * Target picker: a curated "Tonight" list, NGC / star search, and manual
 * coordinates. Flows in the page (no inner scroller); every row has its own
 * "Go to" button, and tapping a row opens a detail sheet.
 */
export function Targets({ state, onTargetSet }: TargetsProps) {
  const [tab, setTabRaw] = useState<Tab>(loadTab);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const lat = state.location?.latitude ?? null;
  const lon = state.location?.longitude ?? null;
  const location = useMemo<Location | null>(
    () => (lat === null || lon === null ? null : { latitude: lat, longitude: lon }),
    [lat, lon],
  );

  const { go, pendingKey, error, clearError } = useGoto(onTargetSet);
  const nav = state.nav;

  const goTo = useCallback(
    (item: TargetItem) => { void go(item.key, item.ra_deg, item.dec_deg); },
    [go],
  );

  const actions: TargetActions = {
    isActive: (item) => isActiveTarget(nav, item.ra_deg, item.dec_deg),
    pendingKey,
    onGo: goTo,
    onOpen: () => {},
  };

  const openDetail = (item: TargetItem, evalAt: Date) => {
    clearError();
    setDetail({ item, evalAt });
  };

  const setTab = (t: Tab) => {
    setTabRaw(t);
    writeStored(TAB_KEY, t);
    clearError();
  };

  return (
    <section aria-labelledby="targets-heading" className="flex flex-col gap-3">
      <h2 id="targets-heading" className="text-title text-foreground">
        Targets
      </h2>
      <SegmentedControl
        aria-label="Target source"
        fullWidth
        value={tab}
        options={TAB_OPTIONS}
        onValueChange={setTab}
      />

      {error && !detail && (
        <Alert
          variant="error"
          title="Couldn't set the target"
          action={
            <Button variant="secondary" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {tab === "tonight" && (
        <TonightPanel location={location} now={now} actions={actions} onOpen={openDetail} />
      )}
      {tab === "search" && (
        <Suspense
          fallback={
            <div className="flex justify-center p-6" role="status" aria-label="Loading catalogue">
              <Spinner />
            </div>
          }
        >
          <SearchPanel location={location} now={now} actions={actions} onOpen={openDetail} />
        </Suspense>
      )}
      {tab === "manual" && (
        <ManualPanel onGo={go} pending={pendingKey === "manual"} />
      )}

      <TargetDetail
        detail={detail}
        location={location}
        active={detail ? isActiveTarget(nav, detail.item.ra_deg, detail.item.dec_deg) : false}
        pending={detail !== null && pendingKey === detail.item.key}
        error={error}
        onClose={() => { setDetail(null); clearError(); }}
        onGo={(item) => {
          void go(item.key, item.ra_deg, item.dec_deg).then((ok) => {
            if (ok) setDetail(null);
          });
        }}
      />
    </section>
  );
}
