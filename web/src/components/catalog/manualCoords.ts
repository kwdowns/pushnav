// Lenient parsing of hand-typed J2000 coordinates.

function numbers(s: string): number[] | null {
  const parts = s.match(/\d+(?:\.\d+)?|\.\d+/g);
  if (!parts) return null;
  return parts.map(Number);
}

/**
 * RA to degrees. Accepts "5h 35m 17s", "05:35:17.3", "5 35 17", or a single
 * number in decimal hours ("5.588"). Returns null when it can't be read or is
 * outside 0 <= RA < 24h.
 */
export function parseRaInput(raw: string): number | null {
  const s = raw.trim();
  if (!s || /[^0-9hms:.\s]/i.test(s)) return null;
  const n = numbers(s);
  if (!n || n.length > 3) return null;
  const [h, m = 0, sec = 0] = n;
  if (n.length > 1 && (m >= 60 || sec >= 60)) return null;
  const hours = h + m / 60 + sec / 3600;
  return hours >= 24 ? null : hours * 15;
}

/**
 * Dec to degrees. Accepts "-5° 23' 28\"", "+05:23:28", "-5 23 28", or a single
 * number in decimal degrees. Returns null when it can't be read or exceeds 90°.
 */
export function parseDecInput(raw: string): number | null {
  const s = raw.trim().replace(/[−–]/g, "-");
  if (!s || /[^0-9+\-°'"′″dms:.\s]/i.test(s)) return null;
  const negative = s.startsWith("-");
  const n = numbers(s);
  if (!n || n.length > 3) return null;
  const [d, m = 0, sec = 0] = n;
  if (n.length > 1 && (m >= 60 || sec >= 60)) return null;
  const abs = d + m / 60 + sec / 3600;
  if (abs > 90) return null;
  return negative ? -abs : abs;
}
