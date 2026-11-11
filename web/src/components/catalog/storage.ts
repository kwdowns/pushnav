// Guarded localStorage access. Storage can be missing or throw (private
// windows, blocked site data, Node's stub in tests), so every read and write
// is wrapped and the UI must work without it.

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Pass `null` to remove the key. */
export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore: persistence is a convenience only
  }
}

export function readStoredList(key: string): string[] | null {
  const raw = readStored(key);
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}
