import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, KindBadge } from "@/components/bits";
import { Back, Clock, Bowl, Pencil } from "@/components/icons";
import { Ingredients, KeepAwake, ShareButton, Toast } from "@/components/RecipeBits";
import { getRecipe, requireMe } from "@/lib/data";
import { timeAgo } from "@/lib/parse";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r?.title ?? "Recipe" };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const [{ id }, { saved }, me] = await Promise.all([params, searchParams, requireMe()]);
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
        {(r.serves || r.time) && (
          <div className="facts">
            {r.serves && (
              <span className="fact">
                <Bowl size={16} /> Serves {r.serves}
              </span>
            )}
            {r.time && (
              <span className="fact">
                <Clock size={16} /> {r.time}
              </span>
            )}
          </div>
        )}
      </header>

      {r.notes && (
        <section className="section">
          <p className="notes">{r.notes}</p>
        </section>
      )}

      {r.ingredients.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Ingredients</h2>
            <span className="eyebrow">{r.ingredients.length}</span>
          </div>
          <Ingredients items={r.ingredients} recipeId={r.id} />
        </section>
      )}

      {r.steps.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Method</h2>
          </div>
          <ol className="steps">
            {r.steps.map((s, i) => (
              <li key={i}>
                <span className="n">{i + 1}</span>
                <p>{s}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

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
