// Helpers for running as an installed web app ("Add to Home Screen").
//
// No service worker on purpose: the app is useless without the live engine,
// the page is served over plain HTTP (service workers need a secure context),
// and Chrome's install criteria do not require one. See docs/using-pushnav.md.

/** True when launched from the home screen / installed app, not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // ignore: fall through to the iOS flag
  }
  // iOS Safari's non-standard flag.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
