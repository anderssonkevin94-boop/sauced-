"use server";
// A photo someone adds (a recipe's, a step's, a cook's): the browser shrinks it first (it can
// read an iPhone's HEIC, the server can't), then the server compresses it properly and stores it.

import { compressPhoto, storeJpeg } from "@/lib/cover-photo";
import { requireMe } from "@/lib/data";

const MAX_BYTES = 5_500_000; // under the 6 MB server action limit (next.config.ts)

/** The stored photo's path (a data URL in demo mode), or null so the browser stores it itself. */
export async function storePhoto(form: FormData): Promise<string | null> {
  const me = await requireMe();
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) return null;
  try {
    const jpeg = await compressPhoto(new Uint8Array(await file.arrayBuffer()));
    return jpeg ? await storeJpeg(jpeg, me.id, "photo") : null;
  } catch (e) {
    console.error("photo: couldn't compress", e instanceof Error ? e.message : e);
    return null;
  }
}
