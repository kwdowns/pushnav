import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEngineState } from "@/hooks/useEngineState";
import { LiveView } from "@/components/live-view/LiveView";
import { Splash } from "@/components/splash/Splash";
import { TopBar } from "@/components/app/TopBar";
import { StepArea } from "@/components/step/StepArea";
import { Targets } from "@/components/catalog/Targets";
import { DEFAULT_SHOW_STARS } from "@/components/settings/Settings";

function useLocalStorageBool(key: string, defaultValue: boolean) {
  const [v, setV] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? defaultValue : saved === "true";
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(v));
    } catch {
      // private mode / blocked storage: setting just isn't remembered
    }
  }, [key, v]);
  return [v, setV] as const;
}

/**
 * Publishes an element's height as `--col-h` so a sticky column taller than
 * the viewport can stick by its bottom edge instead of hiding it.
 */
function useHeightVar<T extends HTMLElement>(mounted: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      el.style.setProperty("--col-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);
  return ref;
}

// Below the app bar (which also pads for the notch).
const BELOW_BAR = "var(--app-bar-h) + var(--safe-top)";

export default function App() {
  const state = useEngineState();
  const [showStars, setShowStars] = useLocalStorageBool("pushnav.show_stars", DEFAULT_SHOW_STARS);
  const leftCol = useHeightVar<HTMLDivElement>(state !== null);

  return (
    <>
      <Splash state={state} />
      {state && (
        <div className="min-h-dvh bg-background text-foreground">
          <TopBar state={state} showStars={showStars} setShowStars={setShowStars} />
          <main className="mx-auto w-full max-w-app px-gutter pb-[max(1.5rem,var(--safe-bottom))] md:grid md:grid-cols-2 md:items-start md:gap-4 md:pt-3">
            {/* Phone: `contents`, so the frame below sticks for the whole page.
                md+: the column sticks under the bar; if it is taller than the
                viewport it sticks by its bottom edge instead. */}
            <div
              ref={leftCol}
              className="contents md:sticky md:z-sticky md:flex md:flex-col md:gap-3"
              style={{ top: `min(calc(${BELOW_BAR} + 0.75rem), calc(100svh - var(--col-h, 0px) - 0.75rem))` }}
            >
              <div
                className="sticky z-sticky -mx-3 bg-background px-3 pt-3 pb-3 md:static md:mx-0 md:p-0"
                style={{ top: `calc(${BELOW_BAR})` }}
              >
                <LiveView state={state} showStars={showStars} className="md:[--frame-max-h:50svh]" />
              </div>
              <StepArea state={state} />
            </div>
            <div className="mt-6 flex min-w-0 flex-col gap-3 md:mt-0">
              <Targets
                state={state}
                onTargetSet={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              />
            </div>
          </main>
        </div>
      )}
    </>
  );
}
