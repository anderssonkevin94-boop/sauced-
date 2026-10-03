import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, KindBadge } from "@/components/bits";
import { Back, Pencil } from "@/components/icons";
import { CookLog } from "@/components/CookLog";
import { KeepAwake, ShareButton, Toast } from "@/components/RecipeBits";
import { RecipeView } from "@/components/RecipeView";
import { Pairings } from "@/components/Pairings";
import { TogetherPicker } from "@/components/TogetherPicker";
import { parseFactor } from "@/components/scale";
import { getCookLog, getPairIds, getRecipe, listCooks, listRecipes, requireMe } from "@/lib/data";
import { timeAgo } from "@/lib/parse";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; x?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r?.title ?? "Recipe" };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const { id } = await params;
  // In parallel: the recipe doesn't need to wait for the member lookup.
  const [{ saved, x }, me, r, log, all, pairIds, cooks] = await Promise.all([
    searchParams,
    requireMe(),
    getRecipe(id),
    getCookLog(id),
    listRecipes(),
    getPairIds(id),
    listCooks(),
  ]);
  if (!r) notFound();
  const pickable = all.map((a) => ({ id: a.id, title: a.title, photoUrl: a.photoUrl }));
  const base = r.basedOn ? all.find((a) => a.id === r.basedOn) : undefined;
  const variations = all.filter((a) => a.basedOn === r.id);
  const mine = r.author.id === me.id;

  return (
    <main className="page">
      {saved && <Toast>{saved === "variation" ? "Saved as a new variation" : "Saved to the kitchen"}</Toast>}
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
        {(base || variations.length > 0) && (
          <p className="variation-of">
            {base && (
              <>
                A variation of{" "}
                <Link href={`/r/${base.id}`} className="name-link">
                  {base.title}
                </Link>
              </>
            )}
            {base && variations.length > 0 && " · "}
            {variations.length > 0 && (
              <>
                {variations.length === 1 ? "Variation: " : "Variations: "}
                {variations.map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && ", "}
                    <Link href={`/r/${v.id}`} className="name-link">
                      {v.title}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
        )}
      </header>

      <RecipeView
        recipe={r}
        initialFactor={parseFactor(x)}
        cooked={log ? new Set(log.map((e) => e.groupId ?? e.id)).size : 0}
        canEdit
        meId={me.id}
        pairings={
          pairIds && all.length > 1 ? (
            <Pairings
              recipe={{ id: r.id, title: r.title }}
              pairs={pairIds.flatMap((pid) => pickable.filter((p) => p.id === pid))}
              all={pickable}
            />
          ) : null
        }
        cookedPanel={log ? <CookLog recipeId={r.id} entries={log} meId={me.id} cooks={cooks} /> : null}
        together={
          r.steps.length > 0 && all.length > 1 ? (
            <TogetherPicker current={{ id: r.id, title: r.title }} recipes={pickable} pairs={pairIds ?? []} />
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
