"use server";
import { DEMO } from "@/lib/config";
import { requireMe } from "@/lib/data";
import { MAX_IMAGE, MAX_TEXT, tidyCore } from "@/lib/tidy-core";

// "Tidy up": Claude reads a pasted recipe and/or a photo and returns it in the app's
// line format (see lib/recipe.ts), so scaling, shopping and step-linking work.

/** Lines the cook changed by hand since the last import: a re-import keeps them. */
export type HandEdits = { changed: string[]; removed: string[] };

export type TidyInput = {
  text: string;
  image?: string /* base64 JPEG, no data: prefix */;
  /** Re-importing: the cook's own changes, which win over the source. */
  keep?: HandEdits;
};
export type TidyFields = {
  title: string;
  kind: "experiment" | "classic";
  ingredients: string;
  steps: string;
  serves: string;
  time: string;
  notes: string;
  /** What Claude guessed, added or kept rather than read from the source: for the cook to check. */
  checks?: string[];
};
export type TidyResult = { ok: true; fields: TidyFields } | { ok: false; error: string };

/** Whether the server can tidy at all. Server-only: pages pass the result down as a boolean. */
export async function tidyAvailable(): Promise<boolean> {
  return !DEMO && Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function tidyRecipe(input: TidyInput): Promise<TidyResult> {
  await requireMe(); // only kitchen members spend the key
  if (!(await tidyAvailable())) return { ok: false, error: "Tidy up isn't set up on this kitchen yet." };

  const text = typeof input?.text === "string" ? input.text.trim() : "";
  const image = typeof input?.image === "string" && input.image ? input.image : undefined;
  if (!text && !image) return { ok: false, error: "Paste something or add a photo first." };
  if (text.length > MAX_TEXT) return { ok: false, error: "That's a lot of text. Paste just the recipe part." };
  if (image && (image.length > MAX_IMAGE || !/^[A-Za-z0-9+/]+=*$/.test(image))) {
    return { ok: false, error: "That photo didn't work. Try another." };
  }

  return tidyCore({ text, image });
}
