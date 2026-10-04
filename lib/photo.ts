"use client";
import { DEMO } from "@/lib/config";
import { storePhoto } from "@/lib/photo-actions";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Shrink a phone photo (often 4–8MB, sometimes HEIC) to a JPEG the server can take (or store as is). */
export async function shrink(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok, fail) =>
      canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Returns the stored photo path (or a data URL in demo mode). The server compresses it far better
 * than a browser can (about a third of the size); if that fails, the browser's own JPEG is stored.
 */
export async function uploadPhoto(file: File, userId: string): Promise<string> {
  try {
    const form = new FormData();
    form.append("photo", await shrink(file, 1600, 0.92), "photo.jpg");
    const path = await storePhoto(form);
    if (path) return path;
  } catch {}
  const blob = await shrink(file);
  if (DEMO) {
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.readAsDataURL(blob);
    });
  }
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabaseBrowser()
    .storage.from("photos")
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}
