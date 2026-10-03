import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, KindBadge } from "@/components/bits";
import { Back, Pencil } from "@/components/icons";
import { CookLog } from "@/components/CookLog";
import { KeepAwake, ShareButton, Toast } from "@/components/RecipeBits";
import { RecipeView } from "@/components/RecipeView";
import { TogetherPicker } from "@/components/TogetherPicker";
import { parseFactor } from "@/components/scale";
import { getCookLog, getRecipe, listRecipes, requireMe } from "@/lib/data";
import { timeAgo } from "@/lib/parse";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; x?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r?.title ?? "Recipe" };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const { id } = await params;
  // In parallel: the recipe doesn't need to wait for the member lookup.
  const [{ saved, x }, me, r, log, all] = await Promise.all([searchParams, requireMe(), getRecipe(id), getCookLog(id), listRecipes()]);
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
          {/* Everyone in the kitchen can edit every recipe. */}
          <Link href={`/r/${r.id}/edit`} className="icon-btn" aria-label="Edit">
            <Pencil />
          </Link>
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
          <Link href={`/u/${r.author.id}`} aria-label={`${r.author.name}'s profile`}>
            <Avatar name={r.author.name} id={r.author.id} />
          </Link>
          <span>
            <Link href={`/u/${r.author.id}`} className="name-link">
              {mine ? "You" : r.author.name}
            </Link>{" "}
            <span className="muted">· {timeAgo(r.createdAt)}</span>
          </span>
        </div>
      </header>

      <RecipeView
        recipe={r}
        initialFactor={parseFactor(x)}
        cooked={log?.length ?? 0}
        canEdit
        meId={me.id}
        cookedPanel={log ? <CookLog recipeId={r.id} entries={log} meId={me.id} /> : null}
        together={
          r.steps.length > 0 && all.length > 1 ? (
            <TogetherPicker current={{ id: r.id, title: r.title }} recipes={all.map((a) => ({ id: a.id, title: a.title, photoUrl: a.photoUrl }))} />
          ) : null
        }
      />

      {r.ingredients.length === 0 && r.steps.length === 0 && !r.notes && (
        <p className="empty">
          Just a name for now.{" "}
          <Link href={`/r/${r.id}/edit`} style={{ color: "var(--accent)", fontWeight: 600 }}>
            Add the details
          </Link>
        </p>
      )}
    </main>
  );
}
