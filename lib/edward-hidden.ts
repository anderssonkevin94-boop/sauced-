import { useSyncExternalStore } from "react";

// Edward's help button is off by default; "Show him" on the You tab turns it on for this device.
const KEY = "sauced:edward-shown";
const EVENT = "sauced:edward-hidden";

const read = () => {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
};

export function setEdwardHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "1");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** True unless the cook switched Edward on (also while rendering on the server, so he never flashes in). */
export function useEdwardHidden(): boolean {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener(EVENT, fn);
      return () => window.removeEventListener(EVENT, fn);
    },
    read,
    () => true,
  );
}
