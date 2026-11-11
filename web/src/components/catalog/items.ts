import { altAzFromRaDec, parseDec, parseRA } from "@/lib/astronomy";
import {
  NGC_TYPE_LABELS,
  type AdvancedEntry,
  type CatalogObject,
  type NgcEntry,
  type StarEntry,
} from "@/lib/catalogTypes";
import type { NavData } from "@/lib/types";

export type Location = { latitude: number; longitude: number };

/** Anything that can be a target, normalised for rows and the detail sheet. */
export interface TargetItem {
  key: string;
  title: string;
  subtitle: string;
  ra_deg: number;
  dec_deg: number;
  detail:
    | { kind: "buddy"; object: CatalogObject }
    | { kind: "advanced"; entry: Exclude<AdvancedEntry, { source: "manual" }> };
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function typeLabel(obj: CatalogObject): string {
  return capitalise((obj.subtype ?? obj.type).replace(/-/g, " "));
}

export function buddyItem(obj: CatalogObject): TargetItem | null {
  const raHours = parseRA(obj.rightAscension);
  const decDeg = parseDec(obj.declination);
  if (raHours === null || decDeg === null) return null;
  // Skip the designation when it only repeats the name ("Job's Coffin").
  const parts = obj.designation === obj.name ? [typeLabel(obj)] : [obj.designation, typeLabel(obj)];
  if (typeof obj.magnitude === "number") parts.push(`mag ${obj.magnitude.toFixed(1)}`);
  return {
    key: `buddy:${obj.id}`,
    title: obj.name,
    subtitle: parts.join(" · "),
    ra_deg: raHours * 15,
    dec_deg: decDeg,
    detail: { kind: "buddy", object: obj },
  };
}

// "M 31" / "M 35": a Messier alias, not "MWSC ..." or "MCG ...".
const MESSIER_RE = /^M\s+\d/;
// Anything that looks like a catalogue ID: alpha prefix followed by digits
// (PGC, NGC, IC, UGC, HIP, HD, ...), a Bayer letter, or a Flamsteed number.
const DESIGNATION_RE = /^([A-Z][A-Za-z0-9]*\s*\d|[α-ω]\s+[A-Z]|\d+\s+[A-Z])/;

function ngcNames(entry: NgcEntry): string[] {
  const messier = entry.aliases.find((a) => MESSIER_RE.test(a));
  const common = entry.aliases.find((a) => a !== messier && !DESIGNATION_RE.test(a));
  // Common name first, then Messier, then the NGC/IC id.
  return [common, messier, entry.id].filter((s): s is string => !!s);
}

function starNames(entry: StarEntry): string[] {
  const others = entry.aliases.filter((a) => a !== entry.id).slice(0, 2);
  return [entry.id, ...others];
}

export function advancedTypeLabel(entry: NgcEntry | StarEntry): string {
  return entry.source === "ngc"
    ? (NGC_TYPE_LABELS[entry.type] ?? entry.type)
    : (entry.spectral ? `Star ${entry.spectral}` : "Star");
}

export function advancedItem(entry: NgcEntry | StarEntry): TargetItem {
  const names = entry.source === "ngc" ? ngcNames(entry) : starNames(entry);
  const parts = [...names.slice(1), advancedTypeLabel(entry)];
  if (entry.mag !== null) parts.push(`mag ${entry.mag.toFixed(1)}`);
  if (entry.constellation) parts.push(entry.constellation);
  return {
    key: `${entry.source}:${entry.id}`,
    title: names[0],
    subtitle: parts.join(" · "),
    ra_deg: entry.ra_deg,
    dec_deg: entry.dec_deg,
    detail: { kind: "advanced", entry },
  };
}

export function altAzOf(
  item: { ra_deg: number; dec_deg: number },
  location: Location | null,
  date: Date,
): { altDeg: number; azDeg: number } | null {
  if (!location) return null;
  return altAzFromRaDec({
    raHours: item.ra_deg / 15,
    decDeg: item.dec_deg,
    latDeg: location.latitude,
    lonDeg: location.longitude,
    date,
  });
}

const SAME_POINT_DEG = 1e-3;

/** True when the engine's active goto target is at these J2000 coordinates. */
export function isActiveTarget(
  nav: NavData | null | undefined,
  ra_deg: number,
  dec_deg: number,
): boolean {
  if (!nav || !nav.active) return false;
  let dRa = Math.abs(nav.target_ra_deg - ra_deg) % 360;
  if (dRa > 180) dRa = 360 - dRa;
  return dRa < SAME_POINT_DEG && Math.abs(nav.target_dec_deg - dec_deg) < SAME_POINT_DEG;
}

export function formatRaDeg(deg: number): string {
  const h = deg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh - mm / 60) * 3600).toFixed(1);
  return `${hh}h ${mm.toString().padStart(2, "0")}m ${ss}s`;
}

export function formatDecDeg(deg: number): string {
  const sign = deg < 0 ? "-" : "+";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d - m / 60) * 3600).toFixed(0);
  return `${sign}${d}° ${m.toString().padStart(2, "0")}' ${s}"`;
}

export function formatClock(t: Date | null): string {
  if (!t) return "—";
  return `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;
}
