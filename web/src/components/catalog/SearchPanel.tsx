import { useDeferredValue, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button, EmptyState, Field, Input } from "@/components/ui";
import ngcData from "@/data/openngc.json";
import starData from "@/data/hyg-bright.json";
import { advancedSearch } from "@/lib/advancedSearch";
import type { NgcEntry, StarEntry } from "@/lib/catalogTypes";
import { advancedItem, altAzOf, type Location, type TargetItem } from "./items";
import { readStored, writeStored } from "./storage";
import { TargetList, type TargetActions } from "./TargetList";

const ngcList: NgcEntry[] = (ngcData as Omit<NgcEntry, "source">[])
  .map((e) => ({ ...e, source: "ngc" as const }));
const starList: StarEntry[] = (starData as Omit<StarEntry, "source">[])
  .map((e) => ({ ...e, source: "star" as const }));
const allEntries: (NgcEntry | StarEntry)[] = [...ngcList, ...starList];

const QUERY_KEY = "pushnav.catalog.advanced.query";
const PAGE = 25;

interface Props {
  location: Location | null;
  now: number;
  actions: TargetActions;
  onOpen: (item: TargetItem, evalAt: Date) => void;
}

/** NGC / IC / Messier / bright-star search. Loaded on demand (the data is large). */
export default function SearchPanel({ location, now, actions, onOpen }: Props) {
  const [query, setQueryRaw] = useState(() => readStored(QUERY_KEY) ?? "");
  const deferred = useDeferredValue(query);
  // How many results are revealed, valid only for the query it was set for.
  const [paging, setPaging] = useState<{ q: string; n: number }>({ q: "", n: PAGE });
  const shown = paging.q === deferred ? paging.n : PAGE;

  const setQuery = (v: string) => {
    setQueryRaw(v);
    writeStored(QUERY_KEY, v === "" ? null : v);
  };

  const results = useMemo(() => advancedSearch(deferred, allEntries) as (NgcEntry | StarEntry)[], [deferred]);
  const evalAt = useMemo(() => new Date(now), [now]);
  const rows = useMemo(
    () =>
      results.slice(0, shown).map((entry) => {
        const item = advancedItem(entry);
        const aa = altAzOf(item, location, evalAt);
        return { item, altDeg: aa?.altDeg ?? null, azDeg: aa?.azDeg ?? null };
      }),
    [results, shown, location, evalAt],
  );

  const hasQuery = deferred.trim() !== "";
  const openRow = (item: TargetItem) => onOpen(item, evalAt);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Search" hint="NGC, IC, Messier or a star name, such as M31 or Vega.">
        <Input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="M31, NGC 7000, Vega…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>

      {!hasQuery ? (
        <EmptyState
          icon={<SearchIcon />}
          title="Search the sky"
          description={`Type a name or catalogue number to search about ${allEntries.length.toLocaleString("en-US")} objects.`}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No matches"
          description="Try a catalogue number such as M31 or NGC 224, or a star name."
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-label text-muted-foreground">
              {results.length} {results.length === 1 ? "result" : "results"}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          </div>
          <TargetList rows={rows} actions={{ ...actions, onOpen: openRow }} />
          {results.length > shown && (
            <Button
              variant="secondary"
              onClick={() => setPaging({ q: deferred, n: shown + PAGE })}
            >
              Show more ({results.length - shown} left)
            </Button>
          )}
        </>
      )}

      <p className="text-label text-muted-foreground">
        Star data:{" "}
        <a
          href="https://www.astronexus.com/hyg"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline"
        >
          HYG database
        </a>
        . Deep-sky data:{" "}
        <a
          href="https://github.com/mattiaverga/OpenNGC"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline"
        >
          OpenNGC
        </a>
        . CC-BY-SA.
      </p>
    </div>
  );
}
