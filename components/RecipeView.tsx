"use client";
import "@/app/styles/recipe.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Basket, Bowl, Check, Clock, Close, Play } from "@/components/icons";
import { Ingredients, useTicked } from "@/components/RecipeBits";
import { FACTORS, factorLabel, factorQuery, parseFactor, scaledServes } from "@/components/scale";
import { StepUses } from "@/components/StepText";
import { ingredientList, sectionize, type Ingredient } from "@/lib/recipe";
import { addToList, onListChange, readList, removeFromList } from "@/lib/shopping";
import type { Recipe } from "@/lib/types";

type Props = { recipe: Pick<Recipe, "id" | "ingredients" | "steps" | "notes" | "serves" | "time">; initialFactor: number };

/** Everything on the recipe page that moves with the scale: facts, ingredients, method. */
export function RecipeView({ recipe: r, initialFactor }: Props) {
  const [factor, setFactor] = useState(initialFactor);
  const list = useMemo(() => ingredientList(r.ingredients), [r.ingredients]);
  const scalable = list.some((i) => i.amount.qty !== null);

  // Offline, the service worker serves the page cached without its query, so the server's
  // idea of the scale can be stale. The URL is the truth.
  useEffect(() => {
    const x = parseFactor(new URLSearchParams(location.search).get("x") ?? undefined);
    if (x !== initialFactor) setFactor(x);
  }, [initialFactor]);

  function scale(f: number) {
    setFactor(f);
    // Kept in the URL so a refresh, or the jump into cook mode, keeps the scale.
    const u = new URL(location.href);
    if (f === 1) u.searchParams.delete("x");
    else u.searchParams.set("x", String(f));
    history.replaceState(history.state, "", u);
  }

  return (
    <>
      {(r.serves || r.time) && (
        <div className="facts">
          {r.serves && (
            <span className="fact" data-scaled={factor !== 1 || undefined}>
              <Bowl size={16} /> Serves {scaledServes(r.serves, factor)}
            </span>
          )}
          {r.time && (
            <span className="fact">
              <Clock size={16} /> {r.time}
            </span>
          )}
        </div>
      )}

      {r.steps.length > 0 && (
        <Link href={`/r/${r.id}/cook${factorQuery(factor)}`} className="btn accent block start-cooking">
          <Play size={20} /> Start cooking
        </Link>
      )}

      {r.notes && (
        <section className="section">
          <p className="notes">{r.notes}</p>
        </section>
      )}

      {list.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Ingredients</h2>
            <span className="eyebrow">{list.length}</span>
          </div>
          {scalable && <Scale factor={factor} onChange={scale} />}
          <Ingredients lines={r.ingredients} recipeId={r.id} factor={factor} />
          <ShoppingButton id={r.id} factor={factor} />
        </section>
      )}

      {r.steps.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Method</h2>
          </div>
          <Steps recipeId={r.id} steps={r.steps} list={list} factor={factor} />
        </section>
      )}
    </>
  );
}

function Scale({ factor, onChange }: { factor: number; onChange: (f: number) => void }) {
  return (
    <div className="segmented scale" role="radiogroup" aria-label="Scale the recipe">
      {FACTORS.map((f) => (
        <label key={f}>
          <input type="radio" name="scale" value={f} checked={factor === f} onChange={() => onChange(f)} />
          {factorLabel(f)}
        </label>
      ))}
    </div>
  );
}

function ShoppingButton({ id, factor }: { id: string; factor: number }) {
  // The scale it's on the list at, or null when it isn't on the list.
  const [listed, setListed] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setListed(readList().recipes.find((x) => x.id === id)?.factor ?? null);
    sync();
    return onListChange(sync);
  }, [id]);

  if (listed === null) {
    return (
      <button type="button" className="btn ghost block list-btn" onClick={() => addToList(id, factor)}>
        <Basket size={20} /> Add to shopping list
      </button>
    );
  }
  return (
    <div className="on-list">
      <Link href="/list" className="btn ghost">
        <Check size={16} /> On your list
        {listed !== 1 && <span className="muted">· {factorLabel(listed)}</span>}
      </Link>
      {listed !== factor && (
        <button type="button" className="text-btn primary" onClick={() => addToList(id, factor)}>
          Make it {factorLabel(factor)}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="Take off the shopping list" onClick={() => removeFromList(id)}>
        <Close size={18} />
      </button>
    </div>
  );
}

function Steps({ recipeId, steps, list, factor }: { recipeId: string; steps: string[]; list: Ingredient[]; factor: number }) {
  const [done, toggle] = useTicked(`sauced:done:${recipeId}`);
  const sections = useMemo(() => sectionize(steps, (text, index) => ({ text, index })), [steps]);

  return sections.map((s, si) => (
    <div key={si} className="step-group">
      {s.name && <h3 className="sub-head">{s.name}</h3>}
      <ol className="steps">
        {s.items.map(({ text, index }) => {
          const isDone = done.includes(index);
          return (
            // The whole step is a tap target; the number button is there for keyboards and screen readers.
            <li key={index} className="step" data-done={isDone || undefined} onClick={() => toggle(index)}>
              <button type="button" className="n" aria-pressed={isDone} aria-label={`Step ${index + 1}${isDone ? ", done" : ""}`}>
                {isDone ? <Check size={18} /> : index + 1}
              </button>
              <div>
                <p>{text}</p>
                <StepUses text={text} list={list} factor={factor} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  ));
}
