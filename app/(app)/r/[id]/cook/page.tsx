import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CookMode } from "@/components/CookMode";
import { parseFactor } from "@/components/scale";
import { getRecipe, requireMe } from "@/lib/data";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ x?: string; s?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r ? `Cooking ${r.title}` : "Cook mode" };
}

export default async function CookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const [{ x, s }, , r] = await Promise.all([searchParams, requireMe(), getRecipe(id)]);
  if (!r) notFound();

  return (
    <CookMode
      recipe={{ id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps, serves: r.serves }}
      initialFactor={parseFactor(x)}
      initialScreen={Math.max(0, Math.floor(Number(s)) || 0)}
    />
  );
}
