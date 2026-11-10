import { useEffect, useRef, useState } from "react";

const RETRY_MS = 1000;

/**
 * Object URL of the latest camera frame, fetched from /frame.jpg whenever
 * `frameId` (the WebSocket payload's camera.frame_id) changes.
 *
 * This replaces an <img src="/frame.mjpg"> stream. A phone that locks drops
 * the long-lived MJPEG connection and Safari never reopens it, leaving a
 * broken-image icon. Here every frame is its own short request, so after the
 * phone wakes up (and the WebSocket reconnects) the next payload fetches the
 * next frame. Only one fetch runs at a time, frames are skipped while the
 * page is hidden, and the last good frame stays up if a fetch fails.
 */
export function useLatestFrame(frameId: number | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  // Bumped when a fetch finishes, to re-check for a frame that arrived meanwhile.
  const [tick, setTick] = useState(0);
  const inFlight = useRef(false);
  const shownId = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (frameId == null || frameId === shownId.current || inFlight.current) return;
    if (document.visibilityState === "hidden") return;
    inFlight.current = true;
    let failed = false;
    fetch(`/frame.jpg?id=${frameId}`, { cache: "no-store" })
      .then((resp) => {
        if (!resp.ok) throw new Error(`GET /frame.jpg → ${resp.status}`);
        return resp.blob();
      })
      .then((blob) => {
        if (!mounted.current) return;
        const next = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = next;
        shownId.current = frameId;
        setUrl(next);
      })
      .catch(() => {
        failed = true; // keep showing the last good frame
      })
      .finally(() => {
        inFlight.current = false;
        if (!mounted.current) return;
        if (failed) window.setTimeout(() => mounted.current && setTick((n) => n + 1), RETRY_MS);
        else setTick((n) => n + 1);
      });
  }, [frameId, tick]);

  return url;
}
