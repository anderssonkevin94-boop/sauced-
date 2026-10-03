import "server-only";
// Turn a link into recipe fields, without any auth: the shared core of Import from link
// (lib/import-link.ts, a server action that checks the member first) and Save to Sauced
// (app/api/share/route.ts, which checks the import key first). Not a "use server" file on
// purpose, so nothing here is callable from a browser.
//
//   social link (TikTok, YouTube, Pinterest…) → lib/social.ts → textToRecipe (lib/text-recipe.ts)
//   anything else                              → the page's schema.org Recipe (lib/recipe-jsonld.ts)

import type { LinkImportResult } from "@/lib/import-link";
import { recipeFromHtml } from "@/lib/recipe-jsonld";
import { BAD_LINK, LinkError, checkUrl, fetchPage, friendlyError } from "@/lib/safe-fetch";
import { readSocial, socialPlatform } from "@/lib/social";
import { textToRecipe, type TextRecipeOptions, type TextRecipeResult } from "@/lib/text-recipe";

/** Below this, textToRecipe's guess isn't a recipe. */
export const MIN_CONFIDENCE = 0.25;

export const NO_RECIPE = "Couldn't find a recipe on that page. Try another site.";
const NO_VIDEO_RECIPE =
  "Couldn't find a recipe in that post's caption. If the recipe is only spoken in the video, Sauced can't read it.";

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
export async function recipeFromLink(raw: string, tag = "import-link"): Promise<LinkImportResult> {
  let start: URL;
  try {
    start = checkUrl(typeof raw === "string" ? raw : "");
  } catch (e) {
    console.error(`${tag}: bad url`, e instanceof Error ? e.message : e);
    return { ok: false, error: BAD_LINK };
  }
  try {
    return await readLink(start, tag, Date.now(), 0);
  } catch (e) {
    return { ok: false, error: friendlyError(e, tag, start.href) };
  }
}

async function readLink(u: URL, tag: string, t0: number, depth: number): Promise<LinkImportResult> {
  const platform = socialPlatform(u);
  if (!platform) return readRecipePage(u, tag);

  const read = await readSocial(u, platform);
  if (read.kind === "link") {
    // A pin points at the recipe page (which could itself be a YouTube video); one hop only.
    if (depth > 0) throw new LinkError(NO_RECIPE, `link chain too long at ${u.href}`);
    return readLink(read.url, tag, t0, depth + 1);
  }

  const r = safeTextToRecipe(read.text, { source: read.source, url: read.url, titleHint: read.titleHint }, tag);
  if (r && isRecipe(r)) {
    return {
      ok: true,
      fields: r.fields,
      source: { title: r.fields.title, site: read.site, url: read.url, rating: null, ratingCount: null },
    };
  }
  console.error(`${tag}: no recipe in ${read.site} text`, read.url, `confidence ${r?.confidence ?? "error"}`, `${read.text.length} chars`);

  // "Full recipe: https://…" in a description: the written recipe, if there's time left.
  for (const link of read.recipeLinks) {
    if (Date.now() - t0 > 12_000) break;
    try {
      const page = await readRecipePage(checkUrl(link), tag);
      if (page.ok) {
        page.fields.notes = [page.fields.notes, `Video: ${read.source} ${read.url}`].filter(Boolean).join("\n");
        return page;
      }
    } catch (e) {
      friendlyError(e, `${tag}: description link`, link); // logs; try the next one
    }
  }
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
