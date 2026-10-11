"use client";
// The shopping list lives on the device (localStorage): which recipes you're shopping
// for, at what scale, and which lines you've ticked off in the shop.

export type ListEntry = { id: string; factor: number };
/** Something added by hand ("pickles", "2 l mjölk"), not from a recipe. */
export type ListItem = { id: string; text: string };
/** `got` holds tick ids (see tickId), not bare line keys. `items` is missing on lists saved before it. */
export type ShoppingState = { recipes: ListEntry[]; got: string[]; items?: ListItem[] };

/**
 * A tick remembers the amount it was ticked at ("g|butter=200 g"), so it lapses on its own
 * when another recipe or a new scale changes the amount: more butter means another look.
 */
export const tickId = (line: { key: string; amount: string | null }) => `${line.key}=${line.amount ?? ""}`;

const KEY = "sauced:list";
const EVENT = "sauced:list";
const EMPTY: ShoppingState = { recipes: [], got: [], items: [] };

export function readList(): ShoppingState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as ShoppingState | null;
    return s && Array.isArray(s.recipes) && Array.isArray(s.got) ? { ...s, items: Array.isArray(s.items) ? s.items : [] } : EMPTY;
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

/** Add things by hand; a line that's already there isn't added twice. */
export function addItems(texts: string[]) {
  const s = readList();
  const have = new Set((s.items ?? []).map((i) => i.text.toLowerCase()));
  const fresh = texts
    .map((t) => t.trim().slice(0, 120))
    .filter((t) => t && !have.has(t.toLowerCase()) && have.add(t.toLowerCase()));
  if (!fresh.length) return;
  const items = [...(s.items ?? []), ...fresh.map((text) => ({ id: Math.random().toString(36).slice(2, 10), text }))];
  writeList({ ...s, items });
}

export function removeItem(id: string) {
  const s = readList();
  writeList({ ...s, items: (s.items ?? []).filter((i) => i.id !== id), got: s.got.filter((t) => !t.startsWith(`item:${id}=`)) });
}

/** Someone's list, sent to you: their recipes and items join yours (a recipe already on yours keeps your scale). */
export function mergeList(other: { recipes: ListEntry[]; items: string[] }) {
  const s = readList();
  const mine = new Set(s.recipes.map((r) => r.id));
  writeList({ ...s, recipes: [...s.recipes, ...other.recipes.filter((r) => !mine.has(r.id))] });
  addItems(other.items);
}

// ── Aisles the cook picked by hand, by item name (see lib/aisles.ts) ─────────
const AISLE_KEY = "sauced:aisles";

export function readAisles(): Record<string, string> {
  try {
    const a = JSON.parse(localStorage.getItem(AISLE_KEY) ?? "{}");
    return a && typeof a === "object" ? a : {};
  } catch {
    return {};
  }
}

export function saveAisle(key: string, aisle: string) {
  try {
    localStorage.setItem(AISLE_KEY, JSON.stringify({ ...readAisles(), [key]: aisle }));
  } catch {}
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
