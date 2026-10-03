"use client";
import { splitIngredient, type Ingredient } from "@/lib/recipe";
import { nameWords } from "@/lib/step-ingredients";

/**
 * The ingredient's name for a chip, without brackets or preparation: "mjukt, rumstempererat
 * smör (mjölkfritt…)" → "rumstempererat smör", "garlic, smashed" → "garlic".
 */
function chipName(item: string): string {
  const name = item.split("(")[0].trim();
  const head = nameWords(item)[0];
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  return (head && parts.find((p) => p.toLowerCase().includes(head))) || parts[0] || item;
}

/** Small chips of the ingredients a step uses (lib/step-ingredients.ts), with their scaled amounts. */
export function StepUses({
  used: all,
  own,
  list,
  factor,
  heading,
  skipped,
}: {
  /** Indexes into `list`, from recipeStepUses. */
  used: number[] | undefined;
  /** The step's own list ([uses …]), with the amounts this step uses: shown instead, when there is one. */
  own?: string[] | null;
  list: Ingredient[];
  factor: number;
  heading?: string;
  /** Ingredients left out of this cook: not shown on the step. */
  skipped?: number[];
}) {
  const used = (all ?? []).filter((i) => list[i] && !skipped?.includes(i));
  if (own?.length) {
    // "Don't have it" still applies: leave out a line whose ingredient was left out.
    const lines = own.filter((line) => {
      const words = nameWords(line);
      return !skipped?.some((i) => list[i] && nameWords(list[i].amount.item).some((w) => words.includes(w)));
    });
    if (!lines.length) return null;
    return (
      <div className="uses">
        {heading && <p className="eyebrow">{heading}</p>}
        <ul aria-label={heading ?? "Ingredients in this step"}>
          {lines.map((line, i) => {
            const { amount, rest } = splitIngredient(line, factor);
            return (
              <li key={i}>
                {amount && <b>{amount}</b>} {chipName(rest)}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  if (!used.length) return null;
  return (
    <div className="uses">
      {heading && <p className="eyebrow">{heading}</p>}
      <ul aria-label={heading ?? "Ingredients in this step"}>
        {used.map((i) => {
          const { amount, rest } = splitIngredient(list[i].text, factor);
          return (
            <li key={i}>
              {amount && <b>{amount}</b>} {chipName(rest)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A step's tip, as an obvious callout on its card. */
export function StepTip({ tip, large }: { tip: string | null | undefined; large?: boolean }) {
  if (!tip) return null;
  return (
    <p className={`step-tip${large ? " lg" : ""}`}>
      <span className="step-tip-label">
        <span aria-hidden="true">💡</span> Tip
      </span>
      {tip}
    </p>
  );
}
