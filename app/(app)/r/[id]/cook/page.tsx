import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CookMode } from "@/components/CookMode";
import { parseFactor } from "@/components/scale";
import { TogetherMode } from "@/components/TogetherMode";
import { getRecipe, listCooks, requireMe } from "@/lib/data";
import { recipeParts } from "@/lib/recipe";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ x?: string; s?: string; parts?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r ? `Cooking ${r.title}` : "Cook mode" };
}

export default async function CookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const [{ x, s, parts }, me, r, cooks] = await Promise.all([searchParams, requireMe(), getRecipe(id), listCooks()]);
  if (!r) notFound();

  // ?parts=1: the recipe's parts cooked at the same time, so they're ready together.
  const split = parts ? recipeParts(r.ingredients, r.steps) : [];
  if (split.length) {
    return (
      <TogetherMode
        whole={{ id: r.id, title: r.title }}
        recipes={split.map((p, i) => ({ id: `${r.id}~${i}`, title: p.name, ingredients: p.ingredients, steps: p.steps, serves: r.serves, time: null }))}
        initialFactors={split.map(() => parseFactor(x))}
      />
    );
  }

  return (
    <CookMode
      recipe={{ id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps, serves: r.serves }}
      initialFactor={parseFactor(x)}
      initialScreen={Math.max(0, Math.floor(Number(s)) || 0)}
      meId={me.id}
      cooks={cooks}
      canEdit
    />
  );
}
