// Hands an imported recipe to the new-recipe form. RecipeForm restores whatever is under
// its unsaved-draft key and shows the "Imported from …" banner for `importedFrom`.
// Client-only: call these from event handlers, never during render.

import type { TidyFields } from "@/lib/tidy";

const DRAFT_KEY = "sauced:draft";

export type ImportedFrom = { title: string; url: string };

export const DRAFT_FAILED = "Couldn't open it in the recipe form. Try again.";

/** Someone halfway through typing a recipe shouldn't lose it to an import without being asked. */
function hasDraft(): boolean {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Record<string, unknown> | null;
    return !!d && [d.title, d.ingredients, d.steps, d.notes].some((v) => typeof v === "string" && v.trim() !== "");
  } catch {
    return false;
  }
}

/** True when it's fine to start an import. Ask before the call, not after, so nobody waits to then say no. */
export function okToReplaceDraft(): boolean {
  return !hasDraft() || confirm("Replace the recipe you're in the middle of writing?");
}

/** Writes the draft /new opens with. False if storage is unavailable (private mode, full). */
export function saveImportDraft(fields: TidyFields, importedFrom: ImportedFrom, photoPath?: string | null): boolean {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...fields, photoPath: photoPath ?? "", importedFrom }));
    return true;
  } catch {
    return false;
  }
}
