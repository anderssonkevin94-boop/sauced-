"use client";
import { splitIngredient, type Ingredient } from "@/lib/recipe";

/** Small chips of the ingredients a step uses (lib/step-ingredients.ts), with their scaled amounts. */
export function StepUses({
  used: all,
  list,
  factor,
  heading,
  skipped,
}: {
  /** Indexes into `list`, from recipeStepUses. */
  used: number[] | undefined;
  list: Ingredient[];
  factor: number;
  heading?: string;
  /** Ingredients left out of this cook: not shown on the step. */
  skipped?: number[];
}) {
  const used = (all ?? []).filter((i) => list[i] && !skipped?.includes(i));
  if (!used.length) return null;
  return (
    <div className="uses">
      {heading && <p className="eyebrow">{heading}</p>}
      <ul aria-label={heading ?? "Ingredients in this step"}>
        {used.map((i) => {
          const { amount, rest } = splitIngredient(list[i].text, factor);
          return (
            <li key={i}>
              {amount && <b>{amount}</b>} {rest.split(",")[0].trim() || rest}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
