import "server-only";
// Photos nobody uses: an import whose recipe was never saved, a photo swapped for another. They
// stay in the uploader's folder of the photos bucket until this clears them, a week later, once
// no recipe (its cover or a step's [photo …]) and no cook in the log points at them. Runs after
// someone saves a recipe, on their own folder only (the bucket lets people delete only their own).

import { supabaseServer } from "@/lib/supabase/server";

const WEEK_MS = 7 * 24 * 3600_000;
/** At most this many deletions a run, so one bad run can't empty a folder. */
const MAX_DELETE = 20;
const STEP_PHOTO = /\[photo ([^\[\]\s]+)\]/gi;

export async function sweepMyPhotos(userId: string): Promise<void> {
  try {
    const sb = await supabaseServer();
    const { data: files, error } = await sb.storage.from("photos").list(userId, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (error || !files) return;
    const cutoff = Date.now() - WEEK_MS;
    const old = files.filter((f) => f.id && f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `${userId}/${f.name}`);
    if (!old.length) return;

    const [recipes, cooked] = await Promise.all([
      sb.from("recipes").select("photo_path, steps"),
      sb.from("cooked").select("photo_path"),
    ]);
    // Without the full picture of what's used, delete nothing (a page of 1000 rows may be cut off).
    if (recipes.error || cooked.error || !recipes.data?.length || recipes.data.length >= 1000 || (cooked.data?.length ?? 0) >= 1000) return;
    const used = new Set<string>();
    for (const r of recipes.data as { photo_path: string | null; steps: string[] | null }[]) {
      if (r.photo_path) used.add(r.photo_path);
      for (const line of r.steps ?? []) for (const m of line.matchAll(STEP_PHOTO)) used.add(m[1]);
    }
    for (const c of cooked.data as { photo_path: string | null }[]) if (c.photo_path) used.add(c.photo_path);

    const unused = old.filter((p) => !used.has(p)).slice(0, MAX_DELETE);
    if (!unused.length) return;
    const { error: removeError } = await sb.storage.from("photos").remove(unused);
    if (removeError) console.error("photo sweep: remove failed", removeError.message);
    else console.log("photo sweep: removed", unused.length, "unused photos for", userId);
  } catch (e) {
    console.error("photo sweep:", e instanceof Error ? e.message : e);
  }
}
