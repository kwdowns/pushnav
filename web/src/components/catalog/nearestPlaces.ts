// Named places for the "nearest object" readout. Imported lazily: it pulls
// in the large NGC and star files (the same data the Search panel uses).
import objectsData from "@/data/objects.json";
import ngcData from "@/data/openngc.json";
import starData from "@/data/hyg-bright.json";
import type { CatalogObject, NgcEntry, StarEntry } from "@/lib/catalogTypes";
import type { SkyPlace } from "@/lib/nearest";
import { advancedItem, advancedTypeLabel, buddyItem, typeLabel } from "./items";

// Only things worth naming at the eyepiece: otherwise an obscure mag-15
// galaxy is always "nearest".
const NGC_MAX_MAG = 10;
const STAR_MAX_MAG = 4;
const MESSIER_RE = /^M\s+\d/;

function build(): SkyPlace[] {
  const places: SkyPlace[] = [];
  // Curated objects first, so their friendlier names win ties with the
  // same object in the NGC list.
  for (const obj of objectsData as unknown as CatalogObject[]) {
    const item = buddyItem(obj);
    if (item) {
      places.push({
        name: item.title, kind: typeLabel(obj), ra_deg: item.ra_deg, dec_deg: item.dec_deg,
      });
    }
  }
  for (const raw of ngcData as Omit<NgcEntry, "source">[]) {
    const messier = raw.aliases.find((a) => MESSIER_RE.test(a));
    const bright = raw.mag !== null && raw.mag <= NGC_MAX_MAG;
    if (!bright && !messier) continue;
    const entry: NgcEntry = { ...raw, source: "ngc" };
    const title = advancedItem(entry).title;
    // "Andromeda Galaxy (M 31)" says more than the common name alone.
    const name = messier && messier !== title ? `${title} (${messier})` : title;
    places.push({
      name, kind: advancedTypeLabel(entry), ra_deg: raw.ra_deg, dec_deg: raw.dec_deg,
    });
  }
  for (const raw of starData as Omit<StarEntry, "source">[]) {
    if (raw.mag === null || raw.mag > STAR_MAX_MAG) continue;
    const entry: StarEntry = { ...raw, source: "star" };
    places.push({
      name: advancedItem(entry).title, kind: "Star", ra_deg: raw.ra_deg, dec_deg: raw.dec_deg,
    });
  }
  return places;
}

export const nearestPlaces: SkyPlace[] = build();
