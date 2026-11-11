/** A named place on the sky, J2000 degrees. */
export interface SkyPlace {
  name: string;
  /** Short type, e.g. "Galaxy", "Star". */
  kind: string;
  ra_deg: number;
  dec_deg: number;
}

export interface NearestPlace {
  place: SkyPlace;
  sep_deg: number;
}

const RAD = Math.PI / 180;

/** Great-circle separation in degrees (haversine: stable at small angles). */
export function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const dDec = (dec2 - dec1) * RAD;
  const dRa = (ra2 - ra1) * RAD;
  const a =
    Math.sin(dDec / 2) ** 2 +
    Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.sin(dRa / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD;
}

/** The place closest to (ra, dec). Earlier entries win ties. */
export function findNearest(
  raDeg: number,
  decDeg: number,
  places: readonly SkyPlace[],
): NearestPlace | null {
  let best: NearestPlace | null = null;
  for (const place of places) {
    // Cheap reject on declination before the trig.
    if (best && Math.abs(place.dec_deg - decDeg) >= best.sep_deg) continue;
    const sep = angularSepDeg(raDeg, decDeg, place.ra_deg, place.dec_deg);
    if (!best || sep < best.sep_deg) best = { place, sep_deg: sep };
  }
  return best;
}

/** Within this, the scope is "centered on" the object rather than "near" it. */
export const CENTERED_DEG = 0.25;
