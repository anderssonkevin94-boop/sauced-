import type { Metadata } from "next";
import { RecipeForm } from "@/components/RecipeForm";
import { createRecipe } from "@/lib/actions";
import { requireMe } from "@/lib/data";
import { tidyAvailable } from "@/lib/tidy";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipe() {
  const [me, canTidy] = await Promise.all([requireMe(), tidyAvailable()]);
  return (
    <main className="page">
      <RecipeForm action={createRecipe} userId={me.id} cancelHref="/" heading="New recipe" canTidy={canTidy} />
    </main>
  );
}

// Tidy up can take ~30 s on a long recipe or photo.
export const maxDuration = 60;
