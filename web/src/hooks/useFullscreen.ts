import { useCallback, useEffect, useState } from "react";
import { isStandalone } from "@/lib/pwa";

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function api() {
  const doc = document as FsDocument;
  const el = document.documentElement as FsElement;
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? !!request;
  return { request, exit, enabled: !!request && !!exit && enabled !== false };
}

function isActive(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FsDocument;
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

function isSupported(): boolean {
  if (typeof document === "undefined") return false;
  return api().enabled && !isStandalone();
}

/**
 * Fullscreen API wrapper. `supported` is false where the API is missing
 * (iPhone Safari) or when already running as an installed app. Use it as the
 * fallback for browsers where a home-screen install cannot go chromeless.
 */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(isActive);
  const [supported] = useState(isSupported);

  useEffect(() => {
    const sync = () => setActive(isActive());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const { request, exit } = api();
    try {
      const result = isActive() ? exit?.() : request?.();
      // Rejections (no user gesture, policy) are harmless; don't leak them.
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, []);

  return { supported, active, toggle };
}
