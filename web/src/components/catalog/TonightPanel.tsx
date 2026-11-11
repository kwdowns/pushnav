import { useMemo, useState } from "react";
import { Alert, Card, Disclosure, EmptyState, SegmentedControl } from "@/components/ui";
import objectsData from "@/data/objects.json";
import type { CatalogObject } from "@/lib/catalogTypes";
import { CatalogFilters } from "./CatalogFilters";
import { activeFilterCount, useCatalogFilters } from "./filterState";
import { DarknessBanner } from "./DarknessBanner";
import type { Location, TargetItem } from "./items";
import { readStored, writeStored } from "./storage";
import { TargetList, type TargetActions } from "./TargetList";
import { TimeControl } from "./TimeControl";
import { ALT_THRESHOLD_DEG, tonightRows, type SortKey } from "./tonight";

const objects = objectsData as CatalogObject[];
const SORT_KEY = "pushnav.catalog.sort";

const SORT_OPTIONS = [
  { value: "type", label: "Type" },
  { value: "name", label: "Name" },
  { value: "mag", label: "Bright" },
  { value: "alt", label: "Altitude" },
] as const;

const SORT_LABELS: Record<SortKey, string> = {
  type: "by type",
  name: "by name",
  mag: "brightest first",
  alt: "highest first",
};

function loadSort(): SortKey {
  const v = readStored(SORT_KEY);
  return SORT_OPTIONS.some((o) => o.value === v) ? (v as SortKey) : "type";
}

interface Props {
  location: Location | null;
  /** Wall-clock now in ms (ticks once a minute). */
  now: number;
  actions: TargetActions;
  onOpen: (item: TargetItem, evalAt: Date) => void;
}

/** Curated list of what is above the horizon, with filters and an observation time. */
export function TonightPanel({ location, now, actions, onOpen }: Props) {
  const [filters, setFilters] = useCatalogFilters();
  const [sort, setSortRaw] = useState<SortKey>(loadSort);
  const [offsetMin, setOffsetMin] = useState(0);

  const evalAt = useMemo(() => new Date(now + offsetMin * 60_000), [now, offsetMin]);

  const rows = useMemo(
    () => (location ? tonightRows(objects, filters, location, evalAt, sort) : []),
    [location, filters, evalAt, sort],
  );

  if (!location) {
    return (
      <Alert variant="info" title="Set your location">
        Open Settings and enter where you are to see which objects are above the horizon.
      </Alert>
    );
  }

  const narrowed = activeFilterCount(filters);
  const openRow = (item: TargetItem) => onOpen(item, evalAt);

  return (
    <div className="flex flex-col gap-3">
      <Disclosure
        title="Filter and sort"
        summary={narrowed > 0 ? `${narrowed} filtered · ${SORT_LABELS[sort]}` : SORT_LABELS[sort]}
      >
        <CatalogFilters value={filters} onChange={setFilters} />
        <div className="flex flex-col gap-2">
          <span className="text-label text-muted-foreground">Sort</span>
          <SegmentedControl
            aria-label="Sort"
            fullWidth
            value={sort}
            options={SORT_OPTIONS}
            onValueChange={(v) => {
              setSortRaw(v);
              writeStored(SORT_KEY, v);
            }}
          />
        </div>
      </Disclosure>

      <Card>
        <TimeControl now={now} appliedOffsetMin={offsetMin} onApply={setOffsetMin} />
      </Card>

      <DarknessBanner
        location={location}
        evalAt={evalAt}
        appliedOffsetMin={offsetMin}
        onApply={setOffsetMin}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          description={`No objects above ${ALT_THRESHOLD_DEG}° with these filters at this time. Widen the filters or move the time forward.`}
        />
      ) : (
        <>
          <p className="text-label text-muted-foreground">
            {rows.length} {rows.length === 1 ? "object" : "objects"} above {ALT_THRESHOLD_DEG}°
          </p>
          <TargetList
            rows={rows}
            actions={{ ...actions, onOpen: openRow }}
          />
        </>
      )}
    </div>
  );
}
