import { altAzFromRaDec } from "@/lib/astronomy";
import type { CatalogObject } from "@/lib/catalogTypes";
import type { CatalogFilterState } from "./filterState";
import { buddyItem, typeLabel, type Location, type TargetItem } from "./items";

export const ALT_THRESHOLD_DEG = 20;

export type SortKey = "type" | "name" | "mag" | "alt";

export interface TonightRow {
  item: TargetItem;
  altDeg: number;
  azDeg: number;
  obj: CatalogObject;
}

/** Objects passing the filters and above the altitude threshold, sorted. */
export function tonightRows(
  objects: CatalogObject[],
  filters: CatalogFilterState,
  location: Location,
  evalAt: Date,
  sortKey: SortKey,
): TonightRow[] {
  const rows: TonightRow[] = [];
  for (const obj of objects) {
    if (!filters.equipment.has(obj.minEquipment)) continue;
    if (!filters.lp.has(obj.lpTolerance)) continue;
    if (!filters.reward.has(obj.visualReward)) continue;
    const item = buddyItem(obj);
    if (!item) continue;
    const { altDeg, azDeg } = altAzFromRaDec({
      raHours: item.ra_deg / 15,
      decDeg: item.dec_deg,
      latDeg: location.latitude,
      lonDeg: location.longitude,
      date: evalAt,
    });
    if (altDeg < ALT_THRESHOLD_DEG) continue;
    rows.push({ item, altDeg, azDeg, obj });
  }
  rows.sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.obj.name.localeCompare(b.obj.name);
      case "type":
        return typeLabel(a.obj).localeCompare(typeLabel(b.obj)) ||
          a.obj.name.localeCompare(b.obj.name);
      case "mag":
        return (a.obj.magnitude ?? Infinity) - (b.obj.magnitude ?? Infinity);
      case "alt":
        return b.altDeg - a.altDeg;
    }
  });
  return rows;
}
