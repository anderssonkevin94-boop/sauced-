"use client";
// The shopping list lives on the device (localStorage): which recipes you're shopping
// for, at what scale, and which lines you've ticked off in the shop.

export type ListEntry = { id: string; factor: number };
/** `got` holds tick ids (see tickId), not bare line keys. */
export type ShoppingState = { recipes: ListEntry[]; got: string[] };

/**
 * A tick remembers the amount it was ticked at ("g|butter=200 g"), so it lapses on its own
 * when another recipe or a new scale changes the amount: more butter means another look.
 */
export const tickId = (line: { key: string; amount: string | null }) => `${line.key}=${line.amount ?? ""}`;

const KEY = "sauced:list";
const EVENT = "sauced:list";
const EMPTY: ShoppingState = { recipes: [], got: [] };

export function readList(): ShoppingState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as ShoppingState | null;
    return s && Array.isArray(s.recipes) && Array.isArray(s.got) ? s : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function writeList(next: ShoppingState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Add a recipe (or update its scale if it's already there). */
export function addToList(id: string, factor = 1) {
  const s = readList();
  writeList({ ...s, recipes: [...s.recipes.filter((r) => r.id !== id), { id, factor }] });
}

export function removeFromList(id: string) {
  const s = readList();
  writeList({ ...s, recipes: s.recipes.filter((r) => r.id !== id) });
}

export function isOnList(id: string): boolean {
  return readList().recipes.some((r) => r.id === id);
}

/** Subscribe to list changes from this tab and others. Returns an unsubscribe function. */
export function onListChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}
