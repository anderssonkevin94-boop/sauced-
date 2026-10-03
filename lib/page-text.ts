// A recipe page without schema.org data (plain blog templates): its visible text, cut down
// to the part around the recipe, for lib/text-recipe.ts to read like a caption. Pure.

import { decodeEntities } from "@/lib/recipe-jsonld";

const MAX_LINES = 160;

/** Headings that start a recipe's ingredient list, in the languages people cook in here. */
const INGREDIENTS = /^(?:ingredienser|ingrediens|ingredients?|du behöver|det här behöver du|detta behöver du|ingredientes|zutaten|ingrédients|ainekset|ingredienser:)\s*:?$/i;

/** The page's readable text: no scripts, styles, menus, headers, footers or forms; one block per line. */
export function pageText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe|template|select|button)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|section|article|figure|figcaption|blockquote|dt|dd|table|main)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Headings that start the method. */
const METHOD = /^(?:gör så här|s[åaä]\s?(?:h[äa]r\s)?g[öo]r (?:du|ni|man)|instruktioner|tillvägagångssätt|tillagning|beskrivning|method|instructions|directions|steps|preparation|how to make(?: it)?|zubereitung|préparation|preparación|valmistus)\s*[:!]?$/i;

/** Where a recipe card's blocks end on blogs: step-by-step photos, videos, tips, comments, related posts. */
const END = /^(?:steg för steg|video|tips|kommentarer|comments?|leave a (?:comment|reply)|lämna en kommentar|notes?|anteckningar|nutrition|näringsvärde|näringsinnehåll|dela(?: receptet)?|share(?: this)?|relaterade(?: recept)?|related(?: recipes)?|you (?:might|may) also like|fler recept|more recipes)\s*[:!.]?$/i;

/** A short line that isn't a sentence: a heading, a button, a price ("Video:", "Tips!", "699 SEK"). */
const isLabel = (l: string) => l.length <= 40 && !/[.,]$/.test(l) && !/^\d+[.)]\s/.test(l) && (/[:!]$/.test(l) || l.split(/\s+/).length <= 4);

/** "6 dl havregryn (rent havre" → "6 dl havregryn (rent havre)": an unclosed bracket would swallow the next lines. */
function closeBrackets(l: string): string {
  const open = (l.match(/\(/g) ?? []).length - (l.match(/\)/g) ?? []).length;
  return open > 0 ? l + ")".repeat(open) : l;
}

/**
 * The recipe part of a page's text. With both an ingredient and a method heading: just the
 * title and "Serves" lines before the ingredients, the ingredient list and the method, each
 * ending at the next label-like line (so ads, "Video:", comments and repeats stay out).
 * With only an ingredient heading: from just before it onwards, each line once. Null when
 * the page has no ingredient heading at all.
 */
export function recipeSection(text: string, title = ""): string | null {
  const blocks = recipeBlocks(text, title);
  if (blocks) return blocks;
  const lines = text.split("\n").map((l) => l.trim());
  const at = lines.findIndex((l) => INGREDIENTS.test(l));
  if (at < 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines.slice(titleStart(lines, at, title))) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(closeBrackets(l));
    if (out.length >= MAX_LINES) break;
  }
  return out.join("\n");
}

/** Shop and ad bits that sit right above a recipe card on blogs ("489 SEK", "Köp nu", "Annons"). */
const JUNK = /\d\s*(?:sek|kr|nok|dkk|eur|€|\$|£)\b|^(?:köp nu|köp|buy now|shop now|annons|annonce|advertisement|ad|sponsored|reklam|dela|share|print|skriv ut|pin|save|spara|jump to recipe|hoppa till recept)$/i;

/** Where the recipe starts: its own title if it's just above the ingredients, else the few lines above up to any shop or ad bits. */
function titleStart(lines: string[], at: number, title: string): number {
  const t = title.trim().toLowerCase();
  for (let i = at - 1; t && i >= Math.max(0, at - 8); i--) if (lines[i].toLowerCase() === t) return i;
  let i = at;
  while (i > Math.max(0, at - 4) && lines[i - 1] && !JUNK.test(lines[i - 1].trim())) i--;
  return i;
}

/** "300 g smör", "2 dl socker", "1 1/2 msk", "½ tsk": a line that starts with an amount and names something. */
const AMOUNT_LINE = /^(?:\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+)?(?:\s+\d\/\d)?|\d\/\d|[½¼¾⅓⅔])\s*(?:[a-zåäö]{1,6}\.?\s+)?\p{L}{2,}/iu;

/**
 * A screenshot where the ingredient heading is covered (a cookie banner, an ad) but the
 * method heading isn't: the longest run of amount lines above the method is the ingredient
 * list (plus one plain line right after it, like "Salt och peppar"). Null without a method
 * heading or at least three amount lines.
 */
function amountsBeforeMethod(lines: string[]): string | null {
  const m = lines.findIndex((l) => METHOD.test(l));
  if (m < 0) return null;
  let best: [number, number] | null = null;
  for (let i = 0; i < m; ) {
    if (!AMOUNT_LINE.test(lines[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < m && AMOUNT_LINE.test(lines[j])) j++;
    if (j - i >= 3 && (!best || j - i >= best[1] - best[0])) best = [i, j];
    i = j;
  }
  if (!best) return null;
  let [from, to] = best;
  const after = lines[to] ?? "";
  if (to < m && after && after.length <= 90 && !/[:!]$/.test(after) && !JUNK.test(after) && !/^\d/.test(after)) to++;
  const method: string[] = [];
  for (let i = m + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (END.test(l) || JUNK.test(l) || (/[:!]$/.test(l) && (lines[i + 1] ?? "").length <= 40)) break;
    method.push(closeBrackets(l));
  }
  if (!method.length) return null;
  return ["Ingredienser", ...lines.slice(from, to).map(closeBrackets), "", lines[m].replace(/[:!]?$/, ":"), ...method].join("\n");
}

/**
 * Just the recipe, when the text has both an ingredient heading and a method heading after
 * it: the title and "Serves" lines above the ingredients, the ingredient list and the method,
 * each ending at the next label-like line. Null otherwise.
 */
export function recipeBlocks(text: string, title = ""): string | null {
  const lines = text.split("\n").map((l) => l.trim());
  const at = lines.findIndex((l) => INGREDIENTS.test(l));
  if (at < 0) return amountsBeforeMethod(lines);
  const m = lines.findIndex((l, i) => i > at && METHOD.test(l));
  if (m < 0) return null;

  const block = (from: number, until: number, steps: boolean) => {
    const out: string[] = [];
    for (let i = from; i < until; i++) {
      const l = lines[i];
      if (!l) continue;
      if (END.test(l) || JUNK.test(l)) break;
      if (/[:!]$/.test(l)) {
        // "Deg:" / "Fyllning:" starting a sub-list or sub-method is part of the recipe; any
        // other label ("Tips!", "Video:") ends the block.
        const next = lines.slice(i + 1).find(Boolean) ?? "";
        const sub = l.length <= 40 && /:$/.test(l) && (steps ? next.length > 40 : /^[\d½¼¾⅓⅔•\-–*]/.test(next));
        if (!sub) break;
      } else if (!steps && isLabel(l) && out.length && /[:!]$/.test(l)) break;
      out.push(closeBrackets(l));
    }
    return out;
  };
  const ingredients = block(at + 1, m, false);
  const method = block(m + 1, lines.length, true);
  if (!ingredients.length || !method.length) return null;
  const head = lines.slice(titleStart(lines, at, title), at).filter(Boolean);
  return [...head, lines[at], ...ingredients, "", lines[m].replace(/[:!]?$/, ":"), ...method].join("\n");
}
