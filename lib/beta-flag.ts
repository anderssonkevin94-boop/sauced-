import { useSyncExternalStore } from "react";

const BETA_COOKIE = "sauced_beta"; // also in lib/beta.ts
const EVENT = "sauced:beta";

const read = () => typeof document !== "undefined" && document.cookie.split("; ").includes(`${BETA_COOKIE}=1`);

export function setBeta(on: boolean) {
  document.cookie = on
    ? `${BETA_COOKIE}=1; path=/; max-age=31536000; samesite=lax; secure`
    : `${BETA_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
  window.dispatchEvent(new Event(EVENT));
}

/** Whether Beta is on for this device (see lib/beta.ts). False while rendering on the server. */
export function useBeta(): boolean {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener(EVENT, fn);
      return () => window.removeEventListener(EVENT, fn);
    },
    read,
    () => false,
  );
}
