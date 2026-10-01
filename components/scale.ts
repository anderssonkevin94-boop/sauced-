// Recipe scaling shared by server pages (reading ?x=) and client components.
// Plain module, no "use client", so server components can call it.
import { formatQty, parseNumber, servesNumber } from "@/lib/recipe";

export const FACTORS = [0.5, 1, 2, 3] as const;

/** "?x=2" → 2. Anything we don't offer falls back to 1×. */
export function parseFactor(x: string | string[] | undefined): number {
  const n = Number(Array.isArray(x) ? x[0] : x);
  return (FACTORS as readonly number[]).includes(n) ? n : 1;
}

export const factorLabel = (f: number) => (f === 0.5 ? "½×" : `${f}×`);

/** The query string that carries a scale into another page ("" for 1×). */
export const factorQuery = (f: number) => (f === 1 ? "" : `?x=${f}`);

/** "4–6" at 2× → "8–12". Text without a number ("a crowd") is left alone. */
export function scaledServes(serves: string, factor: number): string {
  if (factor === 1 || servesNumber(serves) === null) return serves;
  return serves.replace(/\d+(?:[.,]\d+)?/g, (n) => formatQty((parseNumber(n) ?? 0) * factor, null));
}
