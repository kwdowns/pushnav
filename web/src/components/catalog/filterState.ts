import { useState } from "react";
import type { Equipment, LpTolerance, VisualReward } from "@/lib/catalogTypes";
import { readStoredList, writeStored } from "./storage";

export const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "naked-eye", label: "Naked eye" },
  { value: "binoculars", label: "Binoculars" },
  { value: "small-telescope", label: "Small scope" },
  { value: "medium-telescope", label: "Medium scope" },
  { value: "large-telescope", label: "Large scope" },
];

export const LP: { value: LpTolerance; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const REWARD: { value: VisualReward; label: string }[] = [
  { value: "high", label: "High" },
  { value: "moderate", label: "Moderate" },
  { value: "low", label: "Low" },
];

export interface CatalogFilterState {
  equipment: Set<Equipment>;
  lp: Set<LpTolerance>;
  reward: Set<VisualReward>;
}

const KEYS = {
  equipment: "pushnav.catalog.equipment",
  lp: "pushnav.catalog.lp",
  reward: "pushnav.catalog.reward",
} as const;

function load<T extends string>(key: string, options: { value: T }[]): Set<T> {
  const all = options.map((o) => o.value);
  const stored = readStoredList(key);
  if (stored === null) return new Set(all);
  return new Set(all.filter((v) => stored.includes(v)));
}

export function defaultFilters(): CatalogFilterState {
  return {
    equipment: new Set(EQUIPMENT.map((e) => e.value)),
    lp: new Set(LP.map((l) => l.value)),
    reward: new Set(REWARD.map((r) => r.value)),
  };
}

/** Number of filter groups narrowed below "everything". */
export function activeFilterCount(f: CatalogFilterState): number {
  return (
    Number(f.equipment.size < EQUIPMENT.length) +
    Number(f.lp.size < LP.length) +
    Number(f.reward.size < REWARD.length)
  );
}

export function useCatalogFilters(): [
  CatalogFilterState,
  (next: CatalogFilterState) => void,
] {
  const [state, setState] = useState<CatalogFilterState>(() => ({
    equipment: load(KEYS.equipment, EQUIPMENT),
    lp: load(KEYS.lp, LP),
    reward: load(KEYS.reward, REWARD),
  }));
  const update = (next: CatalogFilterState) => {
    setState(next);
    writeStored(KEYS.equipment, JSON.stringify([...next.equipment]));
    writeStored(KEYS.lp, JSON.stringify([...next.lp]));
    writeStored(KEYS.reward, JSON.stringify([...next.reward]));
  };
  return [state, update];
}
