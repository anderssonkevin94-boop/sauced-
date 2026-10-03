import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteRecipe } from "@/components/DeleteRecipe";
import { RecipeForm } from "@/components/RecipeForm";
import { createVariation, updateRecipe } from "@/lib/actions";
import { getRecipe, requireMe } from "@/lib/data";
import { tidyAvailable } from "@/lib/tidy";

export const metadata: Metadata = { title: "Edit" };

export default async function EditRecipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, r, canTidy] = await Promise.all([requireMe(), getRecipe(id), tidyAvailable()]);
  if (!r) notFound();
  return (
    <main className="page">
      <RecipeForm
        action={updateRecipe.bind(null, r.id)}
        variationAction={createVariation.bind(null, r.id, r.title)}
        recipe={r}
        userId={me.id}
        cancelHref={`/r/${r.id}`}
        heading="Edit"
        canTidy={canTidy}
      />
      {/* Anyone in the kitchen can edit; only the person who added it can delete it. */}
      {r.author.id === me.id && <DeleteRecipe id={r.id} />}
    </main>
  );
}

// Tidy up can take ~30 s on a long recipe or photo.
export const maxDuration = 60;
