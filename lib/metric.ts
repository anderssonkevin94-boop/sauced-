// US/imperial to metric with plain code, for "Import from link" (lib/import-link.ts).
// Pure: no server-only imports, so it runs under plain node for tests.
//
// - Leading amounts on ingredient lines: cups, fl oz, pints, quarts, gallons → ml/dl/l;
//   oz, lb, sticks of butter → g/kg. Teaspoons and tablespoons stay (metric countries use them).
// - Anywhere in text: "(14.5-ounce) can", "350°F", "9x13-inch", "1-inch", "1 cup water", "1 lb".
// - A line that already gives both ("200 g (7 oz)", "175g/6 oz", "1 cup (113g)") keeps the metric part.
// Already-metric text, times and °C are left alone.

import { parseAmount, parseNumber } from "@/lib/recipe";

// ── Patterns ───────────────────────────────────────────────

// One number, the same shapes lib/recipe.ts reads: "1 1/2", "1½", "½", "1/2", "1.5", "12".
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛⅕]|[½⅓⅔¼¾⅛⅕]|\d+\/\d+|\d+(?:[.,]\d+)?)`;
// A number or a range ("2-3", "2 to 3"). Groups: 1 = from, 2 = to.
const QTY = String.raw`(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?`;
// Not glued to the end of another number or word ("1/5" must not match "5").
const START = String.raw`(?<![\p{L}\d.,/½⅓⅔¼¾⅛⅕])`;
const END = String.raw`(?![\p{L}\d])`;

// An abbreviation's dot, but not a full stop ending the sentence: "1 lb. beef", not "add 1 lb."
const DOT = String.raw`(?:\.(?=\s*[\p{Ll}(,]))?`;
const VOLUME_UNIT = String.raw`fl\.?\s*oz${DOT}|fluid\s+ounces?|cups?|pints?|pt${DOT}|quarts?|qts?${DOT}|gallons?|gal${DOT}`;
const MASS_UNIT = String.raw`ounces?|oz${DOT}|pounds?|lbs?${DOT}`;
const INCH_UNIT = String.raw`inch(?:es)?|″|"|”`;
const FAHRENHEIT = String.raw`(?:°|º|˚)\s*F|degrees?\s*(?:F|Fahrenheit)|deg\.?\s*F|F`;

const IMPERIAL_PART = String.raw`${QTY}\s*-?\s*(?:${VOLUME_UNIT}|${MASS_UNIT}|${INCH_UNIT}|${FAHRENHEIT})`;
const METRIC_PART = String.raw`${QTY}\s*(?:g|gr|grams?|kg|ml|cl|dl|l|litres?|liters?|cm|mm|(?:°|º)\s*C|C)`;

// Groups in the metric/imperial pair patterns: 1-2 = first measure's numbers, 3-4 = second's.
const PAIRS: [RegExp, "first" | "second"][] = [
  [new RegExp(String.raw`${START}(${METRIC_PART})${END}\s*\(\s*(?:about\s+|ca\.?\s+)?${IMPERIAL_PART}${END}\.?\s*\)`, "giu"), "first"],
  [new RegExp(String.raw`${START}(${METRIC_PART})${END}\s*\/\s*${IMPERIAL_PART}${END}${DOT}`, "giu"), "first"],
  [new RegExp(String.raw`${START}${IMPERIAL_PART}${END}\.?\s*\(\s*(?:about\s+|ca\.?\s+)?(${METRIC_PART})${END}\s*\)`, "giu"), "second"],
  [new RegExp(String.raw`${START}${IMPERIAL_PART}${END}\.?\s*\/\s*(${METRIC_PART})${END}`, "giu"), "second"],
];

const DIMENSIONS = new RegExp(
  String.raw`${START}(${NUM})\s*-?\s*(?:x|×|by)\s*-?\s*(${NUM})(?:\s*-?\s*(?:x|×|by)\s*-?\s*(${NUM}))?\s*-?\s*(?:${INCH_UNIT})(?![\p{L}])`,
  "giu",
);
// "2 inches", "1-inch", '8" round': a bare quote mark only straight after the number.
const INCHES = new RegExp(String.raw`${START}${QTY}(?:\s*-?\s*inch(?:es)?(?![\p{L}])|["″”](?=[\s\-),.;]|$))`, "giu");
const TEMPERATURE = new RegExp(String.raw`${START}${QTY}\s*(${FAHRENHEIT})(?![\p{L}])`, "giu");
// "350 degrees" with no scale: in English recipes that's Fahrenheit (Swedish ones say "grader").
const BARE_DEGREES = new RegExp(String.raw`${START}(\d{3})\s*degrees(?!\s*(?:C|Celsius|F|Fahrenheit)(?![\p{L}]))`, "giu");
const AMOUNTS = new RegExp(String.raw`${START}${QTY}(\s*-\s*|\s*)(${VOLUME_UNIT}|${MASS_UNIT})(?![\p{L}])`, "giu");

// ── Formatting ─────────────────────────────────────────────

const ML_PER: Record<string, number> = { cup: 236.6, floz: 29.57, pint: 473, quart: 946, gallon: 3785 };
const G_PER: Record<string, number> = { oz: 28.35, lb: 453.6, stick: 113 };

/** Canonical name for an imperial unit word, or null. */
function imperialUnit(word: string): string | null {
  const w = word.toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (/^(?:fl\.? ?oz\.?|fluid ounces?)$/.test(w)) return "floz";
  if (/^cups?$/.test(w)) return "cup";
  if (/^(?:pints?|pt)$/.test(w)) return "pint";
  if (/^(?:quarts?|qts?)$/.test(w)) return "quart";
  if (/^(?:gallons?|gal)$/.test(w)) return "gallon";
  if (/^(?:ounces?|oz)$/.test(w)) return "oz";
  if (/^(?:pounds?|lbs?)$/.test(w)) return "lb";
  return null;
}

const trim1 = (n: number) => String(Number(n.toFixed(1)));
const near = (n: number, step: number) => Math.round(n / step) * step;
const dash = (a: string, b: string | null) => (b === null || a === b ? a : `${a}–${b}`);

/** Prefer a round number when it's within 1.5% ("14 oz" → 400 g, not 395 g). */
function snap(n: number, steps: number[]): number | null {
  for (const s of steps) {
    const r = near(n, s);
    if (r > 0 && Math.abs(r - n) / n <= 0.015) return r;
  }
  return null;
}

/** 236.6 → "2.4 dl", 59 → "60 ml", 3785 → "3.8 l". A range uses the unit of its top end. */
export function formatVolume(ml: number, mlMax: number | null = null): string {
  const top = mlMax ?? ml;
  const fmt = (v: number) => {
    if (top < 100) return String(v < 10 ? Math.max(1, Math.round(v)) : near(v, 5));
    if (top < 1000) return trim1(v / 100);
    return trim1(v / 1000);
  };
  const unit = top < 100 ? "ml" : top < 1000 ? "dl" : "l";
  return `${dash(fmt(ml), mlMax === null ? null : fmt(mlMax))} ${unit}`;
}

/** 396.9 → "400 g", 28.35 → "28 g", 1814 → "1.8 kg". */
export function formatMass(g: number, gMax: number | null = null): string {
  const top = gMax ?? g;
  const fmt = (v: number) => {
    if (top >= 1000) return trim1(v / 1000);
    if (v >= 100) return String(snap(v, [50, 25]) ?? near(v, 5));
    return String(snap(v, [10]) ?? Math.max(1, Math.round(v)));
  };
  return `${dash(fmt(g), gMax === null ? null : fmt(gMax))} ${top >= 1000 ? "kg" : "g"}`;
}

/** Centimetres: under 10 to the nearest half, else whole. */
function cm(inches: number): string {
  const v = inches * 2.54;
  return v < 10 ? trim1(Math.max(0.5, near(v, 0.5))) : String(Math.round(v));
}

const celsius = (f: number) => near(((f - 32) * 5) / 9, 5);

function num(s: string | undefined): number | null {
  return s === undefined ? null : parseNumber(s);
}

// ── Text ───────────────────────────────────────────────────

/** "200 g (7 oz)", "175g/6 oz", "1 cup (113g)", "6 oz/175g": keep only the metric measure. */
export function dropImperialPairs(text: string): string {
  let out = text;
  for (const [re, keep] of PAIRS) {
    out = out.replace(re, (...m: string[]) => {
      // m[1] is the whole first measure when it's metric; otherwise the metric one is group 3.
      if (keep === "first") return m[1];
      return m[3];
    });
  }
  return out;
}

/** Convert imperial measures anywhere in a sentence; everything else is left as written. */
export function textToMetric(text: string): string {
  let out = dropImperialPairs(text);

  out = out.replace(DIMENSIONS, (all, a: string, b: string, c?: string) => {
    const ns = [a, b, c].filter((x): x is string => Boolean(x)).map((x) => parseNumber(x));
    if (ns.some((n) => n === null)) return all;
    return `${ns.map((n) => cm(n!)).join("x")} cm`;
  });

  out = out.replace(INCHES, (all, a: string, b?: string) => {
    const lo = num(a);
    const hi = num(b);
    if (lo === null) return all;
    return `${dash(cm(lo), hi === null ? null : cm(hi))} cm`;
  });

  out = out.replace(TEMPERATURE, (all, a: string, b: string | undefined, scale: string) => {
    const lo = num(a);
    const hi = num(b);
    if (lo === null) return all;
    // A bare "F" only for oven-like numbers ("350F"), so "2 F" style noise is left alone.
    if (/^F$/i.test(scale.trim()) && lo < 100) return all;
    const cLo = String(celsius(lo));
    return `${dash(cLo, hi === null ? null : String(celsius(hi)))}°C`;
  });

  out = out.replace(BARE_DEGREES, (all, a: string) => {
    const f = Number(a);
    return f >= 250 && f <= 550 ? `${celsius(f)}°C` : all;
  });

  out = out.replace(AMOUNTS, (all, a: string, b: string | undefined, _join: string, word: string) => {
    const unit = imperialUnit(word);
    const lo = num(a);
    const hi = num(b);
    if (!unit || lo === null) return all;
    return convert(lo, hi, unit) ?? all;
  });

  return out;
}

function convert(lo: number, hi: number | null, unit: string): string | null {
  if (ML_PER[unit]) return formatVolume(lo * ML_PER[unit], hi === null ? null : hi * ML_PER[unit]);
  if (G_PER[unit]) return formatMass(lo * G_PER[unit], hi === null ? null : hi * G_PER[unit]);
  return null;
}

// ── Ingredient lines ───────────────────────────────────────

const BUTTER = /^(?:\(([^)]*)\)\s*)?(?:of\s+)?(?:(?:un)?salted\s+|cold\s+|softened\s+|melted\s+)*butter\b/i;
const FLUID = /^(fl\.?\s*oz\.?|fluid\s+ounces?|pints?|pt\.?|quarts?|qts?\.?|gallons?|gal\.?)(?![\p{L}])\s*(?:of\s+)?/iu;

/**
 * "1 1/2 cups flour" → "3.5 dl flour", "8 oz cheese" → "225 g cheese", "2 sticks butter" → "225 g butter",
 * "1 (14-ounce) can tomatoes" → "1 (400 g) can tomatoes". Metric and spoon lines come back unchanged.
 */
export function ingredientToMetric(line: string): string {
  const text = dropImperialPairs(line.replace(/\s+/g, " ").trim());
  const a = parseAmount(text);
  if (a.qty === null) return textToMetric(text);

  const approx = a.approx ? (a.approx === "~" ? "~" : `${a.approx} `) : "";
  let unit = a.unit;
  let item = a.item;

  // parseAmount doesn't know fl oz, pints, quarts or gallons.
  if (!unit) {
    const f = FLUID.exec(item);
    if (f) {
      unit = imperialUnit(f[1]);
      item = item.slice(f[0].length);
    }
  }

  let amount: string | null = null;
  const butter = BUTTER.exec(item);
  if (unit === "stick" && butter) {
    amount = formatMass(a.qty * G_PER.stick, a.qtyMax === null ? null : a.qtyMax * G_PER.stick);
    if (butter[1]) item = item.slice(item.indexOf(")") + 1).trim(); // "(1/2 cup)" restates it
  } else if (unit === "cup" && butter) {
    // Butter is weighed in metric kitchens: 1 cup = 2 sticks = 227 g.
    amount = formatMass(a.qty * 227, a.qtyMax === null ? null : a.qtyMax * 227);
    if (butter[1]) item = item.slice(item.indexOf(")") + 1).trim(); // "(1 stick)"
  } else if (unit && (ML_PER[unit] || G_PER[unit]) && unit !== "stick") {
    amount = convert(a.qty, a.qtyMax, unit);
  }

  if (!amount) return textToMetric(text);
  item = item.replace(/^of\s+/i, "");
  return `${approx}${amount} ${textToMetric(item)}`.trim();
}
