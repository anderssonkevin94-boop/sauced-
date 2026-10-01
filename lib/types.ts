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
