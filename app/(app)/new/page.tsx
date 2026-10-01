import type { Metadata } from "next";
import { RecipeForm } from "@/components/RecipeForm";
import { createRecipe } from "@/lib/actions";
import { requireMe } from "@/lib/data";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipe() {
  const me = await requireMe();
  return (
    <main className="page">
      <RecipeForm action={createRecipe} userId={me.id} cancelHref="/" heading="New recipe" />
    </main>
  );
}
