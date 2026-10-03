// Reads the schema.org Recipe most recipe sites embed in their pages as JSON-LD
// (<script type="application/ld+json">) and turns it into the app's form fields:
// metric lines in the format lib/recipe.ts reads. Pure: no network, no server-only
// imports, so it runs under plain node for tests. The fetching is in lib/import-link.ts.

import { ingredientToMetric, textToMetric } from "@/lib/metric";
import type { TidyFields } from "@/lib/tidy";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

export type LinkRecipe = {
  fields: TidyFields;
  source: { title: string; site: string; url: string; rating: number | null; ratingCount: number | null };
};

const MAX_LINES = 200;
const MAX_LINE = 600;

// ── Text ───────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  frac12: "½", frac13: "⅓", frac23: "⅔", frac14: "¼", frac34: "¾", frac18: "⅛", frac15: "⅕",
  deg: "°", ndash: "–", mdash: "—", hellip: "…", minus: "−", times: "×", frasl: "⁄", middot: "·", bull: "•",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„", laquo: "«", raquo: "»", prime: "′", Prime: "″",
  copy: "©", reg: "®", trade: "™", shy: "", zwj: "", zwnj: "",
  aring: "å", Aring: "Å", auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", oslash: "ø", Oslash: "Ø",
  aelig: "æ", AElig: "Æ", eacute: "é", Eacute: "É", egrave: "è", Egrave: "È", ecirc: "ê", euml: "ë", aacute: "á",
  agrave: "à", acirc: "â", atilde: "ã", iacute: "í", igrave: "ì", icirc: "î", iuml: "ï", oacute: "ó", ograve: "ò",
  ocirc: "ô", otilde: "õ", uacute: "ú", ugrave: "ù", ucirc: "û", ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç",
  szlig: "ß", iexcl: "¡", iquest: "¿",
};

function decodeOnce(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (all, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? all;
  });
}

/** Decode HTML entities; twice, since some sites double-encode ("&amp;#39;"). */
export function decodeEntities(s: string): string {
  const once = decodeOnce(s);
  return once.includes("&") ? decodeOnce(once) : once;
}

/** Plain text from a string that may hold HTML: tags out, entities decoded, whitespace collapsed. Keeps line breaks. */
export function plainText(s: string): string {
  let t = decodeEntities(s);
  t = t.replace(/<\s*(?:br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "");
  t = t.replace(/[  -​  　]/g, " ").replace(/­/g, "");
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const oneLine = (s: string) => plainText(s).replace(/\s*\n\s*/g, " ").trim();

/** WordPress recipe plugins leave "( , finely chopped)" and "((Note 2))" behind. */
function tidyBrackets(s: string): string {
  let t = s;
  for (let i = 0; i < 2; i++) t = t.replace(/\(\(([^()]*)\)\)/g, "($1)");
  return t
    .replace(/\(\s*[,;]\s*/g, "(")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Finding the Recipe ─────────────────────────────────────

/** Every JSON-LD block in the page, parsed. Broken JSON gets one light cleanup, then is skipped. */
export function jsonLdBlocks(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    // Arla writes the type as "application/ld&#x2B;json"; some pages leave the quotes off.
    if (!/application\/ld\+json/i.test(decodeEntities(m[1]))) continue;
    const raw = m[2]
      .trim()
      .replace(/^<!--/, "")
      .replace(/-->$/, "")
      .replace(/^\/\/\s*<!\[CDATA\[/, "")
      .replace(/\/\/\s*\]\]>$/, "")
      .trim();
    if (!raw) continue;
    const parsed = parseJson(raw);
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

function parseJson(raw: string): Json | undefined {
  try {
    return JSON.parse(raw) as Json;
  } catch {
    // Raw newlines/tabs inside strings and trailing commas are the usual breakage.
    const cleaned = raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(cleaned) as Json;
    } catch {
      return undefined;
    }
  }
}

const isObj = (v: Json | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function hasType(o: Obj, type: string): boolean {
  const t = o["@type"] ?? o.type;
  const names = Array.isArray(t) ? t : [t];
  return names.some((n) => typeof n === "string" && n.replace(/^.*[/:#]/, "").toLowerCase() === type.toLowerCase());
}

/** Every Recipe object: top level, in arrays, in @graph, or under mainEntity / mainEntityOfPage. */
function collectRecipes(v: Json, out: Obj[], depth = 0): void {
  if (depth > 8 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) collectRecipes(x, out, depth + 1);
    return;
  }
  if (hasType(v, "Recipe")) out.push(v);
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasPart", "itemListElement", "item"]) {
    const child = v[key];
    if (child && typeof child === "object") collectRecipes(child, out, depth + 1);
  }
}

/** Index nodes by @id so references like { "@id": "#organization" } can be followed. */
function indexIds(v: Json, ids: Map<string, Obj>, depth = 0): void {
  if (depth > 10 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) indexIds(x, ids, depth + 1);
    return;
  }
  const id = v["@id"];
  if (typeof id === "string" && Object.keys(v).length > 1 && !ids.has(id)) ids.set(id, v);
  for (const x of Object.values(v)) if (x && typeof x === "object") indexIds(x, ids, depth + 1);
}

/** Every node with this @id, wherever it sits (BBC Good Food puts the rating in a second block). */
function nodesWithId(v: Json, id: string, out: Obj[], depth = 0): void {
  if (depth > 10 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) nodesWithId(x, id, out, depth + 1);
    return;
  }
  if (v["@id"] === id) out.push(v);
  for (const x of Object.values(v)) if (x && typeof x === "object") nodesWithId(x, id, out, depth + 1);
}

/** The page's Recipe, preferring one that actually lists ingredients, with any same-@id parts merged in. */
export function findRecipe(blocks: Json[]): Obj | null {
  const all: Obj[] = [];
  for (const b of blocks) collectRecipes(b, all);
  const found = all.find((r) => r.recipeIngredient || r.ingredients) ?? all[0];
  if (!found) return null;
  const id = found["@id"];
  if (typeof id !== "string") return found;
  const parts: Obj[] = [];
  for (const b of blocks) nodesWithId(b, id, parts);
  const merged: Obj = { ...found };
  for (const p of parts) for (const [k, v] of Object.entries(p)) if (!(k in merged)) merged[k] = v;
  return merged;
}

// ── Fields ─────────────────────────────────────────────────

function str(v: Json | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? str(v[0]) : "";
  if (isObj(v)) return str(v.name ?? v.text ?? v["@value"]);
  return "";
}

function toNumber(v: Json | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(v)) return toNumber(v[0]);
  return null;
}

/** "PT1H15M" → 75. Null for anything that isn't an ISO 8601 duration. */
export function durationMinutes(v: Json | undefined): number | null {
  const s = str(v).trim();
  const m = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(s);
  if (!m || s.length < 3) return null;
  const n = (x: string | undefined) => (x ? Number(x.replace(",", ".")) : 0);
  const total = n(m[1]) * 1440 + n(m[2]) * 60 + n(m[3]) + n(m[4]) / 60;
  return total > 0 ? Math.round(total) : null;
}

/** 75 → "1 h 15 min", 45 → "45 min", 60 → "1 h". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function recipeTime(r: Obj): string {
  const total = durationMinutes(r.totalTime);
  if (total) return formatMinutes(total);
  const parts = [durationMinutes(r.prepTime), durationMinutes(r.cookTime)].filter((x): x is number => x !== null);
  if (parts.length) return formatMinutes(parts.reduce((a, b) => a + b, 0));
  // Not ISO: keep short human text ("45 minutes").
  const text = oneLine(str(r.totalTime));
  return text.length <= 20 && /\d/.test(text) ? text : "";
}

/** recipeYield: "4", 4, ["4", "4 servings"], "4 portioner" → "4"; "15-20 st" stays as is. */
export function recipeServes(v: Json | undefined): string {
  const values = (Array.isArray(v) ? v : [v]).map((x) => oneLine(str(x ?? null))).filter(Boolean);
  const best = values.find((x) => /\d/.test(x)) ?? values[0] ?? "";
  const m =
    /^(?:serves|makes|yield|yields|för|ger)?:?\s*(\d+(?:\s*[-–]\s*\d+)?)\s*(?:servings?|portions?|portioner|port\.?|personer|pers\.?|people|persons|serves)?\.?$/i.exec(
      best,
    );
  if (m) return m[1].replace(/\s*[-–]\s*/, "–");
  return best.length <= 40 ? best : best.slice(0, 40).trim();
}

function rating(r: Obj, ids: Map<string, Obj>): { rating: number | null; ratingCount: number | null } {
  let agg = r.aggregateRating;
  if (isObj(agg) && typeof agg["@id"] === "string" && !("ratingValue" in agg)) agg = ids.get(agg["@id"]) ?? agg;
  if (!isObj(agg)) return { rating: null, ratingCount: null };
  const value = toNumber(agg.ratingValue);
  const best = toNumber(agg.bestRating) || 5;
  const count = toNumber(agg.ratingCount) ?? toNumber(agg.reviewCount);
  if (value === null || value <= 0 || best <= 0 || count === 0) return { rating: null, ratingCount: null };
  const out = Math.round(Math.min(5, (value / best) * 5) * 10) / 10;
  return { rating: out, ratingCount: count === null ? null : Math.round(count) };
}

function ingredientLines(r: Obj): string[] {
  const raw = r.recipeIngredient ?? r.ingredients;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .flatMap((x) => plainText(str(x)).split("\n"))
    .map(tidyBrackets)
    .filter(Boolean);
}

/** Step texts from recipeInstructions; HowToSection names come back as "Name:". */
function instructionLines(v: Json | undefined, depth = 0, splitSentences = true): string[] {
  if (v === undefined || v === null || depth > 6) return [];
  if (typeof v === "string") return splitStepText(v, splitSentences);
  if (Array.isArray(v)) return v.flatMap((x) => instructionLines(x, depth + 1, false));
  if (!isObj(v)) return [];
  if (hasType(v, "HowToSection") || (v.itemListElement && !v.text)) {
    const name = oneLine(str(v.name)).replace(/:+$/, "").trim();
    const items = instructionLines(v.itemListElement ?? null, depth + 1, false);
    return name && items.length ? [`${name}:`, ...items] : items;
  }
  const text = str(v.text) || str(v.name) || str(v.description);
  return splitStepText(text, false);
}

/** One block of instruction text → step lines: on line breaks, and on sentences when it's one long paragraph. */
function splitStepText(s: string, splitSentences: boolean): string[] {
  const text = plainText(s);
  let lines = text.split("\n");
  if (lines.length === 1 && splitSentences) {
    // "1. Do this. 2. Do that." → numbered parts; otherwise sentence by sentence.
    const numbered = text.split(/\s+(?=(?:step\s*)?\d{1,2}[.)]\s+\p{Lu})/iu);
    lines = numbered.length > 1 ? numbered : text.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u);
  }
  return lines.map(cleanStep).filter(Boolean);
}

function cleanStep(s: string): string {
  return s
    .replace(/^\s*(?:(?:step|steg)\s*\d+\s*[:.)\-–]?|\d{1,2}\s*[.)](?!\d)|\d{1,2}\s*[:–-](?=\s))\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short label like "Deg" that a site lists as both an "ingredient" and a "step" is a section heading. */
function sharedHeadings(ingredients: string[], steps: string[]): Set<string> {
  const looks = (s: string) => s.length <= 40 && !/\d/.test(s) && !/[.!?,;]$/.test(s);
  const ing = new Set(ingredients.filter(looks).map((s) => s.toLowerCase().replace(/:$/, "")));
  return new Set(steps.filter(looks).map((s) => s.toLowerCase().replace(/:$/, "")).filter((s) => ing.has(s)));
}

/** Only real headings may end in ":" (lib/recipe.ts reads such a line as a section). */
function finishLines(lines: string[], headings: Set<string>, convert: (s: string) => string): string {
  const out: string[] = [];
  for (const line of lines.slice(0, MAX_LINES)) {
    const bare = line.replace(/:+$/, "").trim();
    const isHeading =
      headings.has(bare.toLowerCase()) || (line.endsWith(":") && bare.length > 0 && bare.length <= 60 && !/^\d/.test(bare));
    if (isHeading) {
      if (out.length && out[out.length - 1].endsWith(":")) out.pop(); // an empty section
      out.push(`${bare}:`);
      continue;
    }
    const text = convert(bare).slice(0, MAX_LINE).replace(/:+$/, "").trim();
    if (text) out.push(text);
  }
  while (out.length && out[out.length - 1].endsWith(":")) out.pop();
  // One heading over everything ("Första instruktionen:") isn't a section, just a label.
  if (out[0]?.endsWith(":") && out.filter((l) => l.endsWith(":")).length === 1) out.shift();
  return out.join("\n");
}

// ── Page bits ──────────────────────────────────────────────

export function metaContent(html: string, key: string): string {
  const re = /<meta\b([^>]*)>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const attrs = m[1];
    const name = /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (content) return oneLine(content[1] ?? content[2] ?? content[3] ?? "");
  }
  return "";
}

/** Names people actually use; sites' own data says "ICA.se", "Good Food" or nothing. */
const KNOWN_SITES: Record<string, string> = {
  "ica.se": "ICA", "arla.se": "Arla", "koket.se": "Köket", "coop.se": "Coop", "tasteline.com": "Tasteline",
  "mathem.se": "Mathem", "bbcgoodfood.com": "BBC Good Food", "allrecipes.com": "Allrecipes",
  "seriouseats.com": "Serious Eats", "recipetineats.com": "RecipeTin Eats", "kingarthurbaking.com": "King Arthur",
  "loveandlemons.com": "Love and Lemons", "bonappetit.com": "Bon Appétit", "jamieoliver.com": "Jamie Oliver",
};

function siteName(r: Obj, ids: Map<string, Obj>, html: string, url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known = Object.entries(KNOWN_SITES).find(([h]) => host === h || host.endsWith(`.${h}`));
    if (known) return known[1];
  } catch {}
  let pub = r.publisher;
  if (Array.isArray(pub)) pub = pub[0];
  if (isObj(pub) && typeof pub["@id"] === "string" && !pub.name) pub = ids.get(pub["@id"]) ?? pub;
  const fromPub = isObj(pub) ? oneLine(str(pub.name)) : typeof pub === "string" ? oneLine(pub) : "";
  if (fromPub) return fromPub.slice(0, 60);
  const og = metaContent(html, "og:site_name");
  if (og) return og.slice(0, 60);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── Putting it together ────────────────────────────────────

/** The page's recipe as form fields (metric), or null when the page has no Recipe data. */
export function recipeFromHtml(html: string, url: string): LinkRecipe | null {
  const blocks = jsonLdBlocks(html);
  const r = findRecipe(blocks);
  if (!r) return null;
  const ids = new Map<string, Obj>();
  for (const b of blocks) indexIds(b, ids);

  const title = (oneLine(str(r.name)) || oneLine(str(r.headline)) || metaContent(html, "og:title")).slice(0, 120);
  const ingredients = ingredientLines(r);
  const steps = instructionLines(r.recipeInstructions);
  if (!title && !ingredients.length && !steps.length) return null;

  const headings = sharedHeadings(ingredients, steps);
  const site = siteName(r, ids, html, url);
  const { rating: stars, ratingCount } = rating(r, ids);

  let note = site ? `From ${site}: ${url}` : `From ${url}`;
  if (stars !== null) {
    note += ` · ★ ${stars}`;
    if (ratingCount) note += ` (${ratingCount.toLocaleString("en-US")} ${ratingCount === 1 ? "rating" : "ratings"})`;
  }

  return {
    fields: {
      title,
      kind: "experiment",
      ingredients: finishLines(ingredients, headings, ingredientToMetric),
      steps: finishLines(steps, headings, textToMetric),
      serves: recipeServes(r.recipeYield),
      time: recipeTime(r),
      notes: note,
    },
    source: { title, site, url, rating: stars, ratingCount },
  };
}
