import "server-only";
// Turn a link into recipe fields, without any auth: the shared core of Import from link
// (lib/import-link.ts, a server action that checks the member first) and Save to Sauced
// (app/api/share/route.ts, which checks the import key first). Not a "use server" file on
// purpose, so nothing here is callable from a browser.
//
//   social link (TikTok, YouTube, Pinterest…) → lib/social.ts → the caption's recipe link, if any
//                                                               (lib/recipe-links.ts), else textToRecipe
//   anything else                              → the page's schema.org Recipe (lib/recipe-jsonld.ts)
//
// Captions, descriptions and screenshots often only point at the written recipe ("Full recipe:
// mysite.com/…"): recipeFromTextLinks follows those links (best first, within a time budget)
// and keeps the first page with a real recipe, crediting both the site and the post.

import type { LinkImportResult } from "@/lib/import-link";
import { recipeFromHtml } from "@/lib/recipe-jsonld";
import { findRecipeLinks } from "@/lib/recipe-links";
import { BAD_LINK, LinkError, TOO_SLOW, checkUrl, fetchPage, friendlyError } from "@/lib/safe-fetch";
import { readSocial, socialPlatform } from "@/lib/social";
import { textToRecipe, type TextRecipeOptions, type TextRecipeResult } from "@/lib/text-recipe";

/** Below this, textToRecipe's guess isn't a recipe. */
export const MIN_CONFIDENCE = 0.25;

export const NO_RECIPE = "Couldn't find a recipe on that page. Try another site.";
const NO_VIDEO_RECIPE =
  "Couldn't find a recipe in that post's caption. If the recipe is only spoken in the video, Sauced can't read it.";

/** Following links from a caption: all of them within 15 s, each within 8 s. */
const LINKS_BUDGET_MS = 15_000;
const PER_LINK_MS = 8_000;
const MIN_TRY_MS = 1_500; // not worth starting a fetch with less time than this

type Ok = Extract<LinkImportResult, { ok: true }>;

export type LinkOptions = {
  /** Epoch ms after which no linked page is fetched (the caller's own time limit). */
  deadline?: number;
};

/** Whether textToRecipe found something worth saving. */
export function isRecipe(r: TextRecipeResult): boolean {
  if (!(r.confidence >= MIN_CONFIDENCE)) return false;
  const f = r.fields;
  return Boolean(f.title.trim() || f.ingredients.trim() || f.steps.trim());
}

/** textToRecipe, never throwing (it's plain rules over untrusted text). */
export function safeTextToRecipe(text: string, opts: TextRecipeOptions, tag: string): TextRecipeResult | null {
  try {
    const r = textToRecipe(text, opts);
    if (r && !r.fields.title.trim() && opts.titleHint) r.fields.title = opts.titleHint.slice(0, 120);
    return r;
  } catch (e) {
    console.error(`${tag}: textToRecipe failed`, e);
    return null;
  }
}

/** Fetch a link and read the recipe in it. `tag` prefixes the server logs. */
export async function recipeFromLink(raw: string, tag = "import-link", opts: LinkOptions = {}): Promise<LinkImportResult> {
  let start: URL;
  try {
    start = checkUrl(typeof raw === "string" ? raw : "");
  } catch (e) {
    console.error(`${tag}: bad url`, e instanceof Error ? e.message : e);
    return { ok: false, error: BAD_LINK };
  }
  try {
    return await readLink(start, tag, opts, 0);
  } catch (e) {
    return { ok: false, error: friendlyError(e, tag, start.href) };
  }
}

async function readLink(u: URL, tag: string, opts: LinkOptions, depth: number): Promise<LinkImportResult> {
  const platform = socialPlatform(u);
  if (!platform) return readRecipePage(u, tag);

  const read = await readSocial(u, platform);
  if (read.kind === "link") {
    // A pin points at the recipe page (which could itself be a YouTube video); one hop only.
    if (depth > 0) throw new LinkError(NO_RECIPE, `link chain too long at ${u.href}`);
    return readLink(read.url, tag, opts, depth + 1);
  }

  const caption = safeTextToRecipe(read.text, { source: read.source, url: read.url, titleHint: read.titleHint }, tag);

  // "Full recipe: mysite.com/…" in the caption or description: the written recipe beats the caption.
  const linked = await recipeFromTextLinks(read.linkText, {
    tag,
    deadline: opts.deadline,
    credit: `Shared from ${read.source}: ${read.url}`,
    caption,
  });
  if (linked) return linked;

  if (caption && isRecipe(caption)) {
    return {
      ok: true,
      fields: caption.fields,
      source: { title: caption.fields.title, site: read.site, url: read.url, rating: null, ratingCount: null },
    };
  }
  console.error(`${tag}: no recipe in ${read.site} text`, read.url, `confidence ${caption?.confidence ?? "error"}`, `${read.text.length} chars`);
  return { ok: false, error: NO_VIDEO_RECIPE };
}

async function readRecipePage(u: URL, tag: string): Promise<LinkImportResult> {
  const { html, finalUrl } = await fetchPage(u);
  const recipe = recipeFromHtml(html, finalUrl);
  if (!recipe) {
    console.error(`${tag}: no Recipe JSON-LD`, finalUrl);
    return { ok: false, error: NO_RECIPE };
  }
  return { ok: true, fields: recipe.fields, source: recipe.source };
}

// ── Links in a caption, a description or a screenshot ──────

export type TextLinksOptions = {
  tag: string;
  /** Epoch ms after which no link is fetched. */
  deadline?: number;
  /** The notes' second line: where the link was found ("Shared from TikTok · @x: https://…", "From a screenshot"). */
  credit: string;
  /** Links already tried (e.g. the shared link itself). */
  skip?: string[];
  /** The text's own recipe, if it has one: a linked page about another dish ("serve with my focaccia") loses to it. */
  caption?: TextRecipeResult | null;
};

/**
 * The recipe on the first link in `text` that leads to one (schema.org Recipe with ingredients
 * or steps), with the notes crediting the site and then `credit`; null when none does in time.
 */
export async function recipeFromTextLinks(text: string, o: TextLinksOptions): Promise<Ok | null> {
  const skip = new Set((o.skip ?? []).map(linkKey));
  const links = findRecipeLinks(text).filter((l) => !skip.has(linkKey(l)));
  if (!links.length) return null;
  const stop = Math.min(Date.now() + LINKS_BUDGET_MS, o.deadline ?? Infinity);
  for (const link of links) {
    const left = stop - Date.now();
    if (left < MIN_TRY_MS) {
      console.error(`${o.tag}: no time left for caption link`, link);
      break;
    }
    try {
      const { html, finalUrl } = await withTimeout(fetchPage(checkUrl(link)), Math.min(PER_LINK_MS, left), link);
      const recipe = recipeFromHtml(html, finalUrl);
      if (!recipe || !(recipe.fields.ingredients.trim() || recipe.fields.steps.trim())) {
        console.error(`${o.tag}: caption link without a recipe`, finalUrl);
        continue;
      }
      if (o.caption && otherDish(o.caption, recipe.fields.title)) {
        console.error(`${o.tag}: caption link is another dish`, finalUrl, JSON.stringify(recipe.fields.title));
        continue;
      }
      // recipeFromHtml's note is "From <site>: <url>" (plus its rating); the post goes on the next line.
      const notes = [recipe.fields.notes, o.credit].filter((l) => l.trim()).join("\n");
      return { ok: true, fields: { ...recipe.fields, notes }, source: recipe.source };
    } catch (e) {
      friendlyError(e, `${o.tag}: caption link`, link); // logs; try the next one
    }
  }
  return null;
}

/** Comparable form of a link: no scheme, no "www.", no trailing slash. */
function linkKey(href: string): string {
  return href.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/+(?=$|\?)/, "").toLowerCase();
}

/** Reject after `ms` (the fetch keeps its own 10 s limit; its late answer is ignored). */
function withTimeout<T>(p: Promise<T>, ms: number, href: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LinkError(TOO_SLOW, `caption link took over ${ms} ms: ${href}`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

const STOP_WORDS = new Set(
  "the and with recipe recipes easy best quick simple homemade perfect ultimate healthy minute minutes ingredient ingredients from för och med det den till recept enkel enkla bästa snabb snabba".split(
    " ",
  ),
);

function titleWords(s: string): Set<string> {
  const words = s
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => w.replace(/(?:es|s)$/, ""));
  return new Set(words);
}

/**
 * Whether the caption holds a full recipe of its own whose name shares no word with the linked
 * page's: then the link is likely a side ("serve with my focaccia"), and the caption wins.
 */
function otherDish(caption: TextRecipeResult, linkedTitle: string): boolean {
  const f = caption.fields;
  const full = caption.confidence >= 0.6 && f.ingredients.split("\n").filter((l) => l.trim()).length >= 3 && f.steps.trim() !== "";
  if (!full) return false;
  const a = titleWords(f.title);
  const b = titleWords(linkedTitle);
  if (!a.size || !b.size) return false;
  for (const w of a) if (b.has(w)) return false;
  return true;
}
