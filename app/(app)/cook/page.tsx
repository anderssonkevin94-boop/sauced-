import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parseFactor } from "@/components/scale";
import { TogetherMode } from "@/components/TogetherMode";
import { getRecipe, requireMe } from "@/lib/data";

export const metadata: Metadata = { title: "Cooking together" };

type Props = { searchParams: Promise<{ r?: string; x?: string }> };

/** /cook?r=id1,id2,id3&x=1,2,1: several recipes cooked at once (see components/TogetherMode). */
export default async function CookTogetherPage({ searchParams }: Props) {
  const [{ r = "", x = "" }] = await Promise.all([searchParams, requireMe()]);
  const ids = [...new Set(r.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 6);
  if (!ids.length) notFound();
  if (ids.length === 1) redirect(`/r/${ids[0]}/cook`);
  const found = await Promise.all(ids.map((id) => getRecipe(id)));
  const recipes = found.filter((x) => x !== null);
  if (recipes.length < 2) notFound();
  const xs = x.split(",");
  return (
    <TogetherMode
      recipes={recipes.map((rec) => ({ id: rec.id, title: rec.title, ingredients: rec.ingredients, steps: rec.steps, serves: rec.serves, time: rec.time }))}
      initialFactors={recipes.map((rec) => parseFactor(xs[ids.indexOf(rec.id)]))}
    />
  );
}
