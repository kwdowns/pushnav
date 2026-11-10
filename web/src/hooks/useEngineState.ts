import { useEffect, useRef, useState } from "react";
import type { EnginePayload } from "@/lib/types";

// The server broadcasts at 10 Hz; this much silence means the socket is dead
// even if the browser still reports it open (common after a phone wakes up).
const STALE_MS = 2000;

export function useEngineState(): EnginePayload | null {
  const [state, setState] = useState<EnginePayload | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let lastMessage = Date.now();

    const connect = () => {
      // Vite dev: same-origin /ws is proxied to ws://localhost:8080/ws
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;
      lastMessage = Date.now();

      ws.onmessage = (ev) => {
        lastMessage = Date.now();
        try {
          setState(JSON.parse(ev.data) as EnginePayload);
        } catch (e) {
          console.error("Bad payload:", e);
        }
      };

      ws.onclose = () => {
        if (!cancelled && wsRef.current === ws) {
          retryTimer = window.setTimeout(connect, 1000);
        }
      };

      ws.onerror = () => ws.close();
    };

    // Coming back to the page (phone unlocked, tab switched back): reconnect
    // at once if the socket died while hidden, rather than showing stale
    // state until the browser notices.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      const ws = wsRef.current;
      const alive =
        ws !== null &&
        ws.readyState === WebSocket.OPEN &&
        Date.now() - lastMessage < STALE_MS;
      if (alive || ws?.readyState === WebSocket.CONNECTING) return;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;
      wsRef.current = null; // so the old socket's onclose doesn't retry too
      ws?.close();
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  return state;
}
