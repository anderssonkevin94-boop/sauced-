import "server-only";
// Photos on the server: the site's picture of the dish for an imported recipe (lib/recipe-jsonld.ts
// recipeImage), and every photo people add (lib/photo-actions.ts). Each becomes a small JPEG
// (at most 1600 px, mozjpeg, usually 100–250 KB) in the uploader's folder of the photos bucket.

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { DEMO } from "@/lib/config";
import { checkUrl, fetchImage } from "@/lib/safe-fetch";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_SIDE = 1600;
/** Smaller than this is a logo or an icon, not a picture of the food. */
const MIN_COVER_SIDE = 300;

/** Any picture as a small JPEG, turned the right way up; with `minSide`, null when it's smaller than that. */
export async function compressPhoto(bytes: Uint8Array, minSide = 0): Promise<Buffer | null> {
  const img = sharp(bytes, { failOn: "error" }).rotate();
  const { width = 0, height = 0 } = await img.metadata();
  if (minSide && Math.min(width, height) < minSide) return null;
  return img
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/** Stores a JPEG in the person's folder; the path, a data URL in demo mode, or null if the upload failed. */
export async function storeJpeg(jpeg: Buffer, userId: string, tag: string): Promise<string | null> {
  if (DEMO) return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const path = `${userId}/${randomUUID()}.jpg`;
  const sb = await supabaseServer();
  const { error } = await sb.storage.from("photos").upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) {
    console.error(`${tag}: photo upload failed`, error.message);
    return null;
  }
  return path;
}

/** The site's picture of the dish as a stored photo, or null when there's no usable picture. */
export async function coverPhoto(imageUrl: string | null | undefined, userId: string, tag: string): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const jpeg = await compressPhoto(await fetchImage(checkUrl(imageUrl)), MIN_COVER_SIDE);
    if (!jpeg) {
      console.error(`${tag}: cover photo too small`, imageUrl);
      return null;
    }
    return await storeJpeg(jpeg, userId, tag);
  } catch (e) {
    console.error(`${tag}: no cover photo from`, imageUrl, e instanceof Error ? e.message : e);
    return null;
  }
}
