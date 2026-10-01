import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, KindBadge } from "@/components/bits";
import { Back, Pencil } from "@/components/icons";
import { KeepAwake, ShareButton, Toast } from "@/components/RecipeBits";
import { RecipeView } from "@/components/RecipeView";
import { parseFactor } from "@/components/scale";
import { getRecipe, requireMe } from "@/lib/data";
import { timeAgo } from "@/lib/parse";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; x?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r?.title ?? "Recipe" };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const [{ id }, { saved, x }, me] = await Promise.all([params, searchParams, requireMe()]);
  const r = await getRecipe(id);
  if (!r) notFound();
  const mine = r.author.id === me.id;

  return (
    <main className="page">
      {saved && <Toast>Saved to the kitchen</Toast>}
      <div className="topbar">
        <Link href="/" className="icon-btn back" aria-label="Back to the kitchen">
          <Back />
        </Link>
        <div className="actions">
          <KeepAwake />
          <ShareButton title={r.title} />
          {mine && (
            <Link href={`/r/${r.id}/edit`} className="icon-btn" aria-label="Edit">
              <Pencil />
            </Link>
          )}
        </div>
      </div>

      {r.photoUrl && (
        <div className="hero">
          <img src={r.photoUrl} alt="" />
        </div>
      )}

      <header className="recipe-head">
        <KindBadge kind={r.kind} />
        <h1 className="display">{r.title}</h1>
        <div className="byline">
          <Avatar name={r.author.name} id={r.author.id} />
          <span>
            {mine ? "You" : r.author.name} <span className="muted">· {timeAgo(r.createdAt)}</span>
          </span>
        </div>
      </header>

      <RecipeView recipe={r} initialFactor={parseFactor(x)} />

      {r.ingredients.length === 0 && r.steps.length === 0 && !r.notes && (
        <p className="empty">
          Just a name for now.
          {mine && (
            <>
              {" "}
              <Link href={`/r/${r.id}/edit`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                Add the details
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}
