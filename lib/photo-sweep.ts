import "server-only";
// Keeping someone's photo folder small. Runs after they save a recipe, on their own folder only
// (the bucket lets people change only their own photos):
// - Photos nobody uses (an import whose recipe was never saved, a photo swapped for another) are
//   removed a week later, once no recipe (its cover or a step's [photo …]) and no cook points at them.
// - Big photos from before the server compressed them are compressed in place, same address, so
//   nothing that points at them changes.

import { compressPhoto } from "@/lib/cover-photo";
import { supabaseServer } from "@/lib/supabase/server";

const WEEK_MS = 7 * 24 * 3600_000;
/** At most this many deletions a run, so one bad run can't empty a folder. */
const MAX_DELETE = 20;
/** Photos bigger than this get compressed again (the server makes them ~100–250 KB). */
const BIG_BYTES = 300_000;
const MAX_SHRINK = 30;
const STEP_PHOTO = /\[photo ([^\[\]\s]+)\]/gi;

export async function sweepMyPhotos(userId: string): Promise<void> {
  try {
    const sb = await supabaseServer();
    const { data: files, error } = await sb.storage.from("photos").list(userId, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (error || !files) return;
    const cutoff = Date.now() - WEEK_MS;
    const old = files.filter((f) => f.id && f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `${userId}/${f.name}`);
    const removed = old.length ? await removeUnused(sb, old) : [];
    const big = files
      .filter((f) => f.id && Number(f.metadata?.size) > BIG_BYTES && !removed.includes(`${userId}/${f.name}`))
      .slice(0, MAX_SHRINK);
    for (const f of big) await shrinkInPlace(sb, `${userId}/${f.name}`, Number(f.metadata?.size));
  } catch (e) {
    console.error("photo sweep:", e instanceof Error ? e.message : e);
  }
}

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

/** Removes the photos no recipe or cook uses; returns what it removed. */
async function removeUnused(sb: Supabase, old: string[]): Promise<string[]> {
  const [recipes, cooked] = await Promise.all([
    sb.from("recipes").select("photo_path, steps"),
    sb.from("cooked").select("photo_path"),
  ]);
  // Without the full picture of what's used, delete nothing (a page of 1000 rows may be cut off).
  if (recipes.error || cooked.error || !recipes.data?.length || recipes.data.length >= 1000 || (cooked.data?.length ?? 0) >= 1000) return [];
  const used = new Set<string>();
  for (const r of recipes.data as { photo_path: string | null; steps: string[] | null }[]) {
    if (r.photo_path) used.add(r.photo_path);
    for (const line of r.steps ?? []) for (const m of line.matchAll(STEP_PHOTO)) used.add(m[1]);
  }
  for (const c of cooked.data as { photo_path: string | null }[]) if (c.photo_path) used.add(c.photo_path);

  const unused = old.filter((p) => !used.has(p)).slice(0, MAX_DELETE);
  if (!unused.length) return [];
  const { error: removeError } = await sb.storage.from("photos").remove(unused);
  if (removeError) {
    console.error("photo sweep: remove failed", removeError.message);
    return [];
  }
  console.log("photo sweep: removed", unused.length, "unused photos");
  return unused;
}

/** A big photo compressed again at the same address, when that makes it clearly smaller. */
async function shrinkInPlace(sb: Supabase, path: string, size: number): Promise<void> {
  try {
    const { data, error } = await sb.storage.from("photos").download(path);
    if (error || !data) return;
    const jpeg = await compressPhoto(new Uint8Array(await data.arrayBuffer()));
    if (!jpeg || jpeg.length > size * 0.8) return;
    const { error: upError } = await sb.storage
      .from("photos")
      .upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
    if (upError) console.error("photo sweep: shrink failed", path, upError.message);
    else console.log("photo sweep: shrank", path, `${Math.round(size / 1024)} → ${Math.round(jpeg.length / 1024)} KB`);
  } catch (e) {
    console.error("photo sweep: shrink failed", path, e instanceof Error ? e.message : e);
  }
}
