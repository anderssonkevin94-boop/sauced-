import "server-only";
import { z } from "zod";
import type { TidyFields } from "@/lib/tidy";

// The recipe shape Claude returns (Tidy up and Discover), the line-format rules both
// prompts share, and the flattening into the form's text fields (see lib/recipe.ts).

export const RecipeSchema = z.object({
  title: z.string().describe("Short recipe name in the source language. Empty only if there is no recipe."),
  // A plain string: the SDK turns enums into a description, and a stray "Classic" shouldn't sink the whole tidy.
  kind: z.string().describe('"classic" or "experiment"'),
  serves: z.string().nullable().describe('e.g. "4" or "4–6". Null if the source does not say.'),
  time: z.string().nullable().describe('Total time, e.g. "45 min" or "1 hour". Null if the source does not say.'),
  ingredient_sections: z.array(
    z.object({
      name: z.string().nullable().describe("Section name without a colon, or null for an unnamed section"),
      items: z.array(z.string()),
    }),
  ),
  step_sections: z.array(
    z.object({
      name: z.string().nullable().describe("Section name without a colon, or null for an unnamed section"),
      steps: z.array(z.string()),
    }),
  ),
  notes: z.string(),
});
export type RecipeDraft = z.infer<typeof RecipeSchema>;

/** How lines are written so the app can scale, shop and link steps. Shared by both prompts; keep byte-stable. */
export const FORMAT_RULES = `Ingredients, one per line:
- Amount first, then unit, then the ingredient, then any preparation after a comma: "200 g butter, softened", "2 msk olivolja", "1 1/2 tbsp honey", "2-3 cloves garlic, crushed", "1 gul lök, finhackad".
- No amount in the source means no amount in the line: "Salt, to taste", "Salt och peppar".
- Start the line with the number. Move words like "about" or "ca" out of the way: "ca 2 dl mjölk" becomes "2 dl mjölk".
- Package sizes go in brackets after the name: "1 can tomatoes (400 g)", "1 burk krossade tomater (400 g)".
- Optional ingredients: "50 g walnuts, optional" / "50 g valnötter, valfritt".
- No bullets, numbers, markdown or emoji. A line must never end with a colon.

Sections:
- Only when the recipe genuinely has separate parts (e.g. dough and filling, the dish and its sauce). Otherwise use a single section with name null.
- Name sections briefly in the source language ("Sauce", "Sås", "Topping"), without a colon. Never name a section "Ingredients" or "Method".
- When both ingredients and steps have parts, use the same section names for both.

Steps, one per line:
- Short, one action each, imperative ("Melt the butter", "Rör ner mjölet"). Split long paragraphs into separate steps. No numbering.
- Refer to ingredients with the same word used in the ingredient list, so the app can link them ("Add the garlic", "Tillsätt smör").
- Write durations as digits with a unit: "10 min", "1 hour", "20–25 min" (Swedish: "10 min", "1 timme"). Write "30 min" rather than "half an hour".
- A step must never end with a colon.`;

// ── Flatten into the form's lines ──────────────────────────

/** A line ending in ":" would turn into a section heading, so only real headings get one. */
const clean = (line: string) => line.replace(/\s+/g, " ").trim().replace(/:+$/, "").trim();

function flatten(sections: { name: string | null; lines: string[] }[]): string {
  const out: string[] = [];
  for (const s of sections) {
    const lines = s.lines.map(clean).filter(Boolean);
    if (!lines.length) continue;
    const name = s.name ? clean(s.name) : "";
    if (name) out.push(`${name}:`);
    out.push(...lines);
  }
  return out.join("\n");
}

export function toFields(t: RecipeDraft): TidyFields {
  return {
    title: t.title.trim().slice(0, 120),
    kind: t.kind.trim().toLowerCase() === "classic" ? "classic" : "experiment",
    ingredients: flatten(t.ingredient_sections.map((s) => ({ name: s.name, lines: s.items }))),
    steps: flatten(t.step_sections.map((s) => ({ name: s.name, lines: s.steps }))),
    serves: t.serves?.trim() ?? "",
    time: t.time?.trim() ?? "",
    notes: t.notes.trim(),
  };
}

/** True when Claude found nothing worth putting in the form. */
export const isEmpty = (f: TidyFields) => !f.title && !f.ingredients && !f.steps;
