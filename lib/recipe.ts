// Reads the plain recipe lines people type (or Claude tidies) into something the
// app can scale, shop for and cook from. Recipes stay stored as lines of text:
// a line ending in ":" is a section ("Sauce:"), and an ingredient line starts with
// its amount ("200 g butter", "1 1/2 cups flour", "2 msk olja"). Lines that don't
// fit ("A fistful of parmesan") still work; they just don't scale.

export type Amount = {
  qty: number | null; // null when the line has no leading number
  qtyMax: number | null; // upper end of a range ("2-3 cloves")
  unit: string | null; // canonical unit for maths, e.g. "g", "tbsp" (also for "msk")
  unitText: string | null; // the unit as typed, shown back to people ("msk", "L", "cloves")
  approx?: string | null; // "ca", "about": kept in front of the scaled number
  item: string; // everything after the amount, e.g. "garlic, smashed"
};

export type Ingredient = { index: number; text: string; amount: Amount; section: string | null };
export type Section<T> = { name: string | null; items: T[] };

// ── Sections ───────────────────────────────────────────────

/** "Sauce:" or "# Sauce" marks a section. Returns its name, or null for a normal line. */
export function sectionName(line: string): string | null {
  const t = line.trim();
  const hash = /^#{1,3}\s*(.+)$/.exec(t);
  if (hash) return hash[1].replace(/:$/, "").trim() || null;
  if (t.length > 1 && t.length <= 60 && t.endsWith(":") && !/^\d/.test(t)) return t.slice(0, -1).trim();
  return null;
}

/** Split lines into sections. Lines before the first heading land in an unnamed section. */
export function sectionize<T>(lines: string[], make: (line: string, index: number) => T): Section<T>[] {
  const out: Section<T>[] = [{ name: null, items: [] }];
  let n = 0;
  for (const line of lines) {
    const name = sectionName(line);
    if (name) out.push({ name, items: [] });
    else out[out.length - 1].items.push(make(line, n++));
  }
  return out.filter((s) => s.items.length > 0 || s.name);
}

/** Ingredient lines grouped by section; `index` counts real ingredients only (headings skipped). */
export function ingredientSections(lines: string[]): Section<Ingredient>[] {
  const sections = sectionize(lines, (text, index) => ({ index, text, amount: parseAmount(text), section: null as string | null }));
  for (const s of sections) for (const i of s.items) i.section = s.name;
  return sections;
}

/** Just the ingredients, without headings. */
export function ingredientList(lines: string[]): Ingredient[] {
  return ingredientSections(lines).flatMap((s) => s.items);
}

// ── Amounts ────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string[]> = {
  g: ["g", "gr", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kilo", "kilos", "kilogram", "kilograms"],
  mg: ["mg"],
  ml: ["ml", "millilitre", "millilitres", "milliliter", "milliliters"],
  cl: ["cl"],
  dl: ["dl"],
  l: ["l", "litre", "litres", "liter", "liters", "lit"],
  tsp: ["tsp", "tsps", "teaspoon", "teaspoons", "tsk"],
  tbsp: ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons", "msk"],
  krm: ["krm"],
  cup: ["cup", "cups"],
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  pinch: ["pinch", "pinches", "nypa", "nypor"],
  clove: ["clove", "cloves", "klyfta", "klyftor"],
  can: ["can", "cans", "tin", "tins", "burk", "burkar"],
  pack: ["pack", "packs", "packet", "packets", "paket"],
  bunch: ["bunch", "bunches", "knippe", "knippen"],
  handful: ["handful", "handfuls", "näve", "nävar"],
  slice: ["slice", "slices", "skiva", "skivor"],
  sprig: ["sprig", "sprigs", "kvist", "kvistar"],
  stick: ["stick", "sticks"],
  piece: ["piece", "pieces", "st", "styck"],
};
const UNIT_OF = new Map<string, string>();
for (const [canon, names] of Object.entries(UNIT_ALIASES)) for (const n of names) UNIT_OF.set(n, canon);

/** Plural forms used when displaying a count unit like "2 cloves". Metric and spoons don't pluralise. */
const PLURAL: Record<string, string> = {
  cup: "cups", pinch: "pinches", clove: "cloves", can: "cans", pack: "packs", bunch: "bunches",
  handful: "handfuls", slice: "slices", sprig: "sprigs", stick: "sticks", piece: "pieces", lb: "lb",
};

const VULGAR: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅕": 0.2 };

// One number: "1 1/2", "1½", "½", "1/2", "1.5", "1,5", "12".
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛⅕]|[½⅓⅔¼¾⅛⅕]|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const APPROX = String.raw`(?:(ca\.?|cirka|about|approx\.?|around|~)\s*)?`;
const AMOUNT_RE = new RegExp(String.raw`^\s*${APPROX}(${NUM})(?:\s*(?:-|–|—|to|till)\s*(${NUM}))?\s*`, "i");

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return +m[1] + +m[2] / +m[3];
  m = /^(\d+)?\s*([½⅓⅔¼¾⅛⅕])$/.exec(t);
  if (m) return (m[1] ? +m[1] : 0) + VULGAR[m[2]];
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) return +m[2] ? +m[1] / +m[2] : null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "2-3 cloves garlic, smashed" → { qty: 2, qtyMax: 3, unit: "clove", item: "garlic, smashed" } */
export function parseAmount(text: string): Amount {
  const m = AMOUNT_RE.exec(text);
  const none: Amount = { qty: null, qtyMax: null, unit: null, unitText: null, item: text.trim() };
  if (!m) return none;
  const qty = parseNumber(m[2]);
  if (qty === null) return none;
  const qtyMax = m[3] ? parseNumber(m[3]) : null;
  let rest = text.slice(m[0].length);
  let unit: string | null = null;
  let unitText: string | null = null;
  const u = /^([A-Za-zÅÄÖåäö]+)\.?(?=\s|$|,|\/)\s*(?:of\s+)?/.exec(rest);
  if (u && UNIT_OF.has(u[1].toLowerCase())) {
    unit = UNIT_OF.get(u[1].toLowerCase())!;
    unitText = u[1];
    rest = rest.slice(u[0].length);
    // "400g/14oz tomatoes": the second measure wouldn't scale, so drop it.
    rest = rest.replace(/^\/\s*[\d.,½¼¾]+\s*[A-Za-z]+\.?\s*/, "");
  }
  return { qty, qtyMax, unit, unitText, approx: m[1] ?? null, item: rest.trim() };
}

/**
 * A line split into the form's three boxes, as typed: "1-2 paket champinjoner" →
 * { amount: "1-2", unit: "paket", name: "champinjoner" }. Unknown units stay in the name.
 */
export function ingredientParts(text: string): { amount: string; unit: string; name: string } {
  const a = parseAmount(text);
  if (a.qty === null) return { amount: "", unit: "", name: text.trim() };
  const amount = AMOUNT_RE.exec(text)![0].trim();
  return { amount, unit: a.unitText ?? "", name: a.item };
}

/** The inverse of ingredientParts. */
export function joinIngredient(p: { amount: string; unit: string; name: string }): string {
  return [p.amount.trim(), p.unit.trim(), p.name.trim()].filter(Boolean).join(" ");
}

/** True when the box holds an amount the app can scale: "2", "1 1/2", "ca 3", "1-2". */
export function isAmount(s: string): boolean {
  const m = AMOUNT_RE.exec(s);
  return !!m && m[0].trim().length === s.trim().length;
}

// ── Display and scaling ────────────────────────────────────

const METRIC = new Set(["g", "kg", "mg", "ml", "cl", "dl", "l"]);
const FRACTIONS: [number, string][] = [
  [0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [1, ""],
];

/** 1.5 → "1½" for spoons, cups and counts; 1.5 → "1.5" for metric; 333.3 g → "335". */
export function formatQty(n: number, unit: string | null): string {
  if (unit && METRIC.has(unit)) {
    if (unit === "g" || unit === "ml" || unit === "mg") {
      if (n >= 100) return String(Math.round(n / 5) * 5);
      if (n >= 10) return String(Math.round(n));
      return trimDecimal(n, 1);
    }
    return trimDecimal(n, n >= 10 ? 0 : 2);
  }
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
  if (best[0] === 1) return String(whole + 1);
  if (!best[1]) return whole ? String(whole) : trimDecimal(n, 2); // a scaled pinch is "0.06", not "0"
  return whole ? `${whole}${best[1]}` : best[1];
}

function trimDecimal(n: number, places: number): string {
  return String(Number(n.toFixed(places)));
}

/** Singular and plural of unit words that change with the number, English and Swedish. */
const FORMS: [string, string][] = [
  ...Object.entries(PLURAL),
  ["teaspoon", "teaspoons"], ["tablespoon", "tablespoons"], ["tin", "tins"], ["packet", "packets"],
  ["ounce", "ounces"], ["pound", "pounds"], ["gram", "grams"], ["kilo", "kilos"], ["litre", "litres"], ["liter", "liters"],
  ["klyfta", "klyftor"], ["burk", "burkar"], ["nypa", "nypor"], ["skiva", "skivor"], ["kvist", "kvistar"],
  ["knippe", "knippen"], ["näve", "nävar"],
];

/** Unit words follow the scaled number ("1 clove" / "2 cloves", "1 burk" / "2 burkar"); others stay as typed. */
function unitWord(a: Amount, n: number): string {
  const typed = a.unitText ?? a.unit!;
  const lower = typed.toLowerCase();
  const pair = FORMS.find(([one, many]) => lower === one || lower === many);
  if (!pair || pair[0] === pair[1]) return typed;
  const word = n > 1 + 1e-9 ? pair[1] : pair[0];
  return typed[0] !== lower[0] ? word[0].toUpperCase() + word.slice(1) : word;
}

/** The amount part of a line, scaled: "400 g", "1½ tbsp", "4–6 cloves". Null when there's no amount. */
export function amountLabel(a: Amount, factor = 1): string | null {
  if (a.qty === null) return null;
  const q = a.qty * factor;
  const qMax = a.qtyMax === null ? null : a.qtyMax * factor;
  let num = qMax === null ? formatQty(q, a.unit) : `${formatQty(q, a.unit)}–${formatQty(qMax, a.unit)}`;
  if (a.approx) num = a.approx === "~" ? `~${num}` : `${a.approx} ${num}`;
  if (!a.unit) return num;
  return `${num} ${unitWord(a, qMax ?? q)}`;
}

/** Split a line for display: the bold amount and the rest. Unparsed lines come back as rest only. */
export function splitIngredient(text: string, factor = 1): { amount: string | null; rest: string } {
  const a = parseAmount(text);
  const amount = amountLabel(a, factor);
  return amount ? { amount, rest: a.item } : { amount: null, rest: text };
}

/** "Serves 4" → 4, "4-6" → 4, "two" → null. Used to show scaled servings. */
export function servesNumber(serves: string | null): number | null {
  if (!serves) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(serves);
  return m ? parseNumber(m[1]) : null;
}

// Which ingredients a step uses: lib/step-ingredients.ts.

// ── Shopping list ──────────────────────────────────────────

export type ShoppingLine = { key: string; amount: string | null; name: string; from: string[] };

const TO_BASE: Record<string, [string, number]> = {
  g: ["g", 1], kg: ["g", 1000], mg: ["g", 0.001],
  ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000],
};

/** Merge ingredients from several recipes ("200 g butter" + "50 g butter" → "250 g butter"). */
export function combineIngredients(
  recipes: { title: string; ingredients: string[]; factor: number }[],
): ShoppingLine[] {
  type Acc = { unit: string | null; unitText: string | null; metric: string | null; qty: number | null; qtyMax: number | null; name: string; from: Set<string> };
  const map = new Map<string, Acc>();
  for (const r of recipes) {
    for (const ing of ingredientList(r.ingredients)) {
      const a = ing.amount;
      const name = (a.item.split(",")[0].trim() || ing.text).replace(/^of\s+/i, "");
      const base = a.unit ? TO_BASE[a.unit] : undefined;
      const unit = base ? base[0] : a.unit;
      // Metric gets converted to g/ml; other units ("msk", "cloves") are shown as typed.
      const unitText = base ? null : a.unitText;
      const mult = r.factor * (base ? base[1] : 1);
      const qty = a.qty === null ? null : a.qty * mult;
      const qtyMax = a.qty === null ? null : (a.qtyMax ?? a.qty) * mult;
      const key = `${unit ?? ""}|${name.toLowerCase().replace(/(?:es|s)$/, "")}`;
      const cur = map.get(key);
      if (cur) {
        cur.qty = cur.qty !== null && qty !== null ? cur.qty + qty : cur.qty ?? qty;
        cur.qtyMax = cur.qtyMax !== null && qtyMax !== null ? cur.qtyMax + qtyMax : cur.qtyMax ?? qtyMax;
        if (cur.unitText?.toLowerCase() !== unitText?.toLowerCase()) cur.unitText = null;
        if (cur.metric !== (base ? a.unit : null)) cur.metric = null;
        cur.from.add(r.title);
      } else {
        map.set(key, { unit, unitText, metric: base ? a.unit : null, qty, qtyMax, name, from: new Set([r.title]) });
      }
    }
  }
  return [...map.entries()].map(([key, v]) => {
    let { unit, qty, qtyMax } = v;
    const big = (n: number | null, d: number) => (n === null ? null : n / d);
    // Everyone wrote dl? Then say "3 dl", not "300 ml".
    if (qty !== null && v.metric && v.metric !== unit) {
      const d = TO_BASE[v.metric][1];
      [unit, qty, qtyMax] = [v.metric, qty / d, big(qtyMax, d)];
    }
    if (qty !== null && unit === "g" && qty >= 1000) [unit, qty, qtyMax] = ["kg", qty / 1000, big(qtyMax, 1000)];
    if (qty !== null && unit === "ml" && qty >= 1000) [unit, qty, qtyMax] = ["l", qty / 1000, big(qtyMax, 1000)];
    const range = qtyMax !== null && qty !== null && qtyMax - qty > 1e-9 ? qtyMax : null;
    const amount = qty === null ? null : amountLabel({ qty, qtyMax: range, unit, unitText: v.unitText, item: v.name });
    return { key, amount, name: v.name, from: [...v.from] };
  });
}

/** The step lines without step `index` (counted like sectionize: section headings don't count). */
export function withoutStep(lines: string[], index: number): string[] {
  let n = -1;
  return lines.filter((l) => (sectionName(l) ? true : ++n !== index));
}

const PART_STOP = new Set(["till", "med", "och", "för", "the", "for", "and", "with"]);
const partWords = (name: string) =>
  name
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3 && !PART_STOP.has(w));

/**
 * The ingredient part that goes with a step part ("Surkål:" in the method, "Surkål:" or "Till
 * surkålen:" in the ingredients): the same name, a shared word, or else the same position when
 * both lists have the same parts. Null when nothing fits.
 */
export function partIngredients(name: string | null, at: number, stepParts: number, parts: Section<Ingredient>[]): Ingredient[] | null {
  const named = parts.filter((p) => p.name);
  if (name) {
    const words = partWords(name);
    const hit =
      named.find((p) => p.name!.toLowerCase() === name.toLowerCase()) ??
      named.find((p) => partWords(p.name!).some((w) => words.some((v) => w.startsWith(v.slice(0, 4)) && v.startsWith(w.slice(0, 4)))));
    if (hit) return hit.items;
  }
  return parts.length === stepParts && parts[at]?.items.length ? parts[at].items : null;
}

export type RecipePart = { name: string; steps: string[]; ingredients: string[] };

/**
 * A recipe in parts (a soup and its surkål) as one small recipe per part: its steps and the
 * ingredients that go with it. Empty when the recipe has fewer than two parts.
 */
export function recipeParts(ingredients: string[], steps: string[]): RecipePart[] {
  const parts = sectionize(steps, (text) => text).filter((s) => s.items.length);
  if (parts.length < 2) return [];
  const ingParts = ingredientSections(ingredients);
  return parts.map((s, i) => ({
    name: s.name ?? `Part ${i + 1}`,
    steps: s.items,
    ingredients: (partIngredients(s.name, i, parts.length, ingParts) ?? []).map((x) => x.text),
  }));
}
