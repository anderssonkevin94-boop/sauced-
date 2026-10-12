import { useSyncExternalStore } from "react";

// "Hide Edward" on the You tab: his button goes away on this device (kept in localStorage).
const KEY = "sauced:edward-hidden";
const EVENT = "sauced:edward-hidden";

const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function setEdwardHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useEdwardHidden(): boolean {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener(EVENT, fn);
      return () => window.removeEventListener(EVENT, fn);
    },
    read,
    () => false,
  );
}
