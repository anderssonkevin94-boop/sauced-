import "server-only";
// The cover photo for an imported recipe: the site's own picture of the dish (lib/recipe-jsonld.ts
// recipeImage), fetched safely, shrunk to a ~300 KB JPEG like a phone photo (lib/photo.ts), and
// stored in the importer's folder of the photos bucket. Anything going wrong means no photo.

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { DEMO } from "@/lib/config";
import { checkUrl, fetchImage } from "@/lib/safe-fetch";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_SIDE = 1600;
/** Smaller than this is a logo or an icon, not a picture of the food. */
const MIN_SIDE = 300;

/** The stored photo path (a data URL in demo mode), or null when there's no usable picture. */
export async function coverPhoto(imageUrl: string | null | undefined, userId: string, tag: string): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const bytes = await fetchImage(checkUrl(imageUrl));
    const img = sharp(bytes, { failOn: "error" }).rotate();
    const { width = 0, height = 0 } = await img.metadata();
    if (Math.min(width, height) < MIN_SIDE) {
      console.error(`${tag}: cover photo too small`, imageUrl, `${width}×${height}`);
      return null;
    }
    const jpeg = await img
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (DEMO) return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const path = `${userId}/${randomUUID()}.jpg`;
    const sb = await supabaseServer();
    const { error } = await sb.storage.from("photos").upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) {
      console.error(`${tag}: cover photo upload failed`, error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.error(`${tag}: no cover photo from`, imageUrl, e instanceof Error ? e.message : e);
    return null;
  }
}
