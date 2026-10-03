"use server";
// Import from link: read the recipe data most recipe sites embed in the page
// (schema.org Recipe JSON-LD), convert it to metric with plain code, and return it
// as form fields. Works with no AI and no key; with an Anthropic key, Claude also
// structures the steps (times, heat, tips). Social links (a TikTok, a YouTube video,
// a Pinterest pin) are read too: the caption or description is structured by plain rules.
//
// The server fetches a URL someone typed, so it only talks to public web servers
// (lib/safe-fetch.ts: public addresses only, redirects re-checked, 10 s, size cap).
// The reading lives in lib/link-recipe.ts, lib/social.ts and lib/recipe-jsonld.ts,
// and the unit conversion in lib/metric.ts.

import type { TidyFields } from "@/lib/tidy";
import { requireMe } from "@/lib/data";
import { recipeFromLink, structurePass } from "@/lib/link-recipe";

export type LinkSource = {
  title: string; // the recipe's name on the site
  site: string; // site name, e.g. "ICA", "BBC Good Food", "TikTok"
  url: string; // final page url (after redirects)
  rating: number | null; // aggregate rating out of 5 if the page has one
  ratingCount: number | null;
};

export type LinkImportResult = { ok: true; fields: TidyFields; source: LinkSource } | { ok: false; error: string };

/** Fetch a recipe page (or a social post) and turn its recipe into metric form fields. */
export async function importFromLink(url: string): Promise<LinkImportResult> {
  await requireMe(); // only kitchen members (outside the try: it redirects by throwing)
  const res = await recipeFromLink(url, "import-link");
  // With an Anthropic key: clear steps with their times, heat and tips (lib/recipe-structure.ts).
  return res.ok ? { ...res, fields: await structurePass(res.fields, "import-link") } : res;
}
