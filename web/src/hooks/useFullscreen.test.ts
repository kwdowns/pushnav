import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFullscreen } from "./useFullscreen";

const doc = document as unknown as Record<string, unknown>;
const el = document.documentElement as unknown as Record<string, unknown>;

function installApi() {
  doc.fullscreenEnabled = true;
  doc.fullscreenElement = null;
  el.requestFullscreen = vi.fn(async () => {
    doc.fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  doc.exitFullscreen = vi.fn(async () => {
    doc.fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
}

function removeApi() {
  for (const k of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen",
    "webkitFullscreenEnabled", "webkitFullscreenElement", "webkitExitFullscreen"]) {
    delete doc[k];
  }
  for (const k of ["requestFullscreen", "webkitRequestFullscreen"]) delete el[k];
}

function mockDisplayMode(standalone: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: standalone && q.includes("standalone"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("useFullscreen", () => {
  beforeEach(() => {
    removeApi();
    mockDisplayMode(false);
  });
  afterEach(() => removeApi());

  it("is unsupported when the API is missing", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(false);
    expect(result.current.active).toBe(false);
    expect(() => result.current.toggle()).not.toThrow();
  });

  it("is unsupported when running standalone", () => {
    installApi();
    mockDisplayMode(true);
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(false);
  });

  it("toggles on and off and follows fullscreenchange", async () => {
    installApi();
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
    expect(result.current.active).toBe(false);
    await act(async () => result.current.toggle());
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
    await act(async () => result.current.toggle());
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it("works through webkit prefixes", async () => {
    doc.webkitFullscreenEnabled = true;
    doc.webkitFullscreenElement = null;
    el.webkitRequestFullscreen = vi.fn(() => {
      doc.webkitFullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    doc.webkitExitFullscreen = vi.fn(() => {
      doc.webkitFullscreenElement = null;
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(true);
    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(false);
  });
});
