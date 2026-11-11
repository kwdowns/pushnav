import { useEffect, useMemo, useState } from "react";
import { findNearest, type NearestPlace, type SkyPlace } from "@/lib/nearest";

let cache: SkyPlace[] | null = null;
let loading: Promise<SkyPlace[]> | null = null;

function loadPlaces(): Promise<SkyPlace[]> {
  loading ??= import("@/components/catalog/nearestPlaces").then((m) => {
    cache = m.nearestPlaces;
    return cache;
  });
  return loading;
}

/**
 * The named object closest to where the scope points (J2000 degrees), or
 * null while there is no pointing or the catalogue is still loading.
 */
export function useNearestObject(
  raDeg: number | null,
  decDeg: number | null,
): NearestPlace | null {
  const [places, setPlaces] = useState<SkyPlace[] | null>(cache);
  const wanted = raDeg !== null && decDeg !== null;
  useEffect(() => {
    if (!wanted || places) return;
    let live = true;
    loadPlaces()
      .then((p) => { if (live) setPlaces(p); })
      .catch(console.error);
    return () => { live = false; };
  }, [wanted, places]);

  // Solves jitter by arcseconds; 0.01 degree steps avoid a search per frame.
  const ra = raDeg === null ? null : Math.round(raDeg * 100) / 100;
  const dec = decDeg === null ? null : Math.round(decDeg * 100) / 100;
  return useMemo(
    () => (places && ra !== null && dec !== null ? findNearest(ra, dec, places) : null),
    [places, ra, dec],
  );
}
