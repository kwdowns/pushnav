import "@testing-library/jest-dom";

// R3F's <Canvas> measures itself via react-use-measure, which depends on
// ResizeObserver. jsdom doesn't ship one, so the Sky View dome inside the
// wizard throws on mount in component tests. Stub it — tests don't need
// real layout measurements.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!globalThis.ResizeObserver) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

// Node 25+ ships its own `localStorage` global that, without
// --localstorage-file, is an object lacking getItem/setItem. It shadows
// jsdom's Storage, so `localStorage.getItem` threw "Cannot read properties of
// undefined". Install a small in-memory Storage when the real one is unusable.
if (typeof globalThis.localStorage?.getItem !== "function") {
  const data = new Map<string, string>();
  const memoryStorage = {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(String(k)) ?? null,
    setItem: (k: string, v: string) => { data.set(String(k), String(v)); },
    removeItem: (k: string) => { data.delete(String(k)); },
    clear: () => { data.clear(); },
  };
  for (const target of [globalThis, window] as object[]) {
    Object.defineProperty(target, "localStorage", { value: memoryStorage, configurable: true });
  }
}
