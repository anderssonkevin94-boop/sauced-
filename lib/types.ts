export type Kind = "experiment" | "classic";

export type Cook = { id: string; name: string };

export type Recipe = {
  id: string;
  author: Cook;
  title: string;
  kind: Kind;
  ingredients: string[];
  steps: string[];
  notes: string;
  serves: string | null;
  time: string | null;
  photoPath: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeInput = Pick<
  Recipe,
  "title" | "kind" | "ingredients" | "steps" | "notes" | "serves" | "time" | "photoPath"
>;

export const KIND_LABEL: Record<Kind, string> = {
  experiment: "Experiment",
  classic: "Tried & true",
};

/** One time someone made a recipe. `on` is the day, "2026-10-03", in the cook's own time zone. */
export type CookedEntry = {
  id: string;
  recipeId: string;
  cook: Cook;
  on: string;
  note: string;
  photoPath: string | null;
  photoUrl: string | null;
};

/** A cook log entry with the recipe it's for, for histories and stats. */
export type CookedWithRecipe = CookedEntry & { recipe: Pick<Recipe, "id" | "title" | "photoUrl"> & { authorId: string } };

/** A member of the kitchen, for their profile page. */
export type Profile = Cook & { since: string };
