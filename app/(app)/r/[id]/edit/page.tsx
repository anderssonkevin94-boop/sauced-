import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeleteRecipe } from "@/components/DeleteRecipe";
import { RecipeForm } from "@/components/RecipeForm";
import { updateRecipe } from "@/lib/actions";
import { getRecipe, requireMe } from "@/lib/data";
import { tidyAvailable } from "@/lib/tidy";

export const metadata: Metadata = { title: "Edit" };

export default async function EditRecipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, r, canTidy] = await Promise.all([requireMe(), getRecipe(id), tidyAvailable()]);
  if (!r) notFound();
  if (r.author.id !== me.id) redirect(`/r/${id}`);
  return (
    <main className="page">
      <RecipeForm action={updateRecipe.bind(null, r.id)} recipe={r} userId={me.id} cancelHref={`/r/${r.id}`} heading="Edit" canTidy={canTidy} />
      <DeleteRecipe id={r.id} />
    </main>
  );
}

// Tidy up can take ~30 s on a long recipe or photo.
export const maxDuration = 60;
