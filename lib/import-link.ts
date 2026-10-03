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

import type { HandEdits, TidyFields } from "@/lib/tidy";
import { requireMe } from "@/lib/data";
import { revalidatePath } from "next/cache";
import { DEMO } from "@/lib/config";
import { coverPhoto } from "@/lib/cover-photo";
import { recipeFromLink, structurePass } from "@/lib/link-recipe";
import { supabaseServer } from "@/lib/supabase/server";

export type LinkSource = {
  title: string; // the recipe's name on the site
  site: string; // site name, e.g. "ICA", "BBC Good Food", "TikTok"
  url: string; // final page url (after redirects)
  rating: number | null; // aggregate rating out of 5 if the page has one
  ratingCount: number | null;
  image?: string | null; // the site's picture of the dish, if it has one
};

export type LinkImportResult =
  | { ok: true; fields: TidyFields; source: LinkSource; /** The site's picture of the dish, stored as the cover photo. */ photoPath?: string | null }
  | { ok: false; error: string };

/**
 * Fetch a recipe page (or a social post) and turn its recipe into metric form fields. With
 * `withPhoto`, the site's picture of the dish comes along as the cover photo.
 */
export async function importFromLink(url: string, withPhoto = true, keep?: HandEdits): Promise<LinkImportResult> {
  const me = await requireMe(); // only kitchen members (outside the try: it redirects by throwing)
  keep = cleanEdits(keep);
  const res = await recipeFromLink(url, "import-link", { keep });
  if (!res.ok) return res;
  // With an Anthropic key: clear steps with their times, heat and tips (lib/recipe-structure.ts).
  // The photo comes in while Claude works.
  const [fields, photoPath] = await Promise.all([
    structurePass(res.fields, "import-link", undefined, keep),
    withPhoto ? coverPhoto(res.source.image, me.id, "import-link") : null,
  ]);
  return { ...res, fields, photoPath };
}

const lines = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.slice(0, 1000)).slice(-max) : [];

/** The cook's changes as sent from the browser, capped; undefined when there are none. */
function cleanEdits(keep: HandEdits | undefined): HandEdits | undefined {
  if (!keep) return undefined;
  const out = { changed: lines(keep.changed, 60), removed: lines(keep.removed, 60) };
  return out.changed.length || out.removed.length ? out : undefined;
}

/**
 * A recipe saved from the iPhone share keeps the site's photo by its address (that request has
 * no session to store it with). The first person to open it copies it into their photo folder.
 */
export async function adoptCover(recipeId: string): Promise<void> {
  if (DEMO) return;
  const me = await requireMe();
  const sb = await supabaseServer();
  const { data } = await sb.from("recipes").select("photo_path").eq("id", recipeId).maybeSingle();
  const url = data?.photo_path as string | null | undefined;
  if (!url?.startsWith("https://")) return;
  const path = await coverPhoto(url, me.id, "adopt-cover");
  if (!path) return; // the site's address stays; the next visit tries again
  // Only if nobody changed the photo meanwhile (or got there first).
  const { data: done } = await sb.from("recipes").update({ photo_path: path }).eq("id", recipeId).eq("photo_path", url).select("id");
  if (!done?.length) await sb.storage.from("photos").remove([path]);
  revalidatePath(`/r/${recipeId}`);
  revalidatePath("/");
}
