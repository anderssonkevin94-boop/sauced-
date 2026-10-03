"use client";
import "@/app/styles/together.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Tile } from "@/components/bits";
import { Pencil, Play, Plus } from "@/components/icons";
import { RecipePicker } from "@/components/RecipePicker";
import { setPairings } from "@/lib/actions";
import type { Recipe } from "@/lib/types";

type Pickable = Pick<Recipe, "id" | "title" | "photoUrl">;

/** "Pairs well with": the sides, sauces and mains that go with this recipe, picked by anyone in the kitchen. */
export function Pairings({ recipe, pairs, all }: { recipe: Pick<Recipe, "id" | "title">; pairs: Pickable[]; all: Pickable[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const ids = pairs.map((p) => p.id);

  function save(next: string[]) {
    setError("");
    start(async () => {
      const res = await setPairings(recipe.id, next, ids);
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  const picker = open && (
    <RecipePicker
      heading="Pairs well with"
      lede={
        <>
          What goes with <b>{recipe.title}</b>? Sides, sauces, a main. It shows up on both recipes.
        </>
      }
      recipes={all}
      exclude={[recipe.id]}
      initial={ids}
      busy={pending}
      confirm={(n) => (pending ? "Saving" : n ? `Save ${n} ${n === 1 ? "pairing" : "pairings"}` : "Save, no pairings")}
      onConfirm={save}
      onClose={() => setOpen(false)}
    />
  );

  if (!pairs.length) {
    return (
      <>
        <button type="button" className="pairs-empty" onClick={() => setOpen(true)}>
          <Plus size={16} /> Add what pairs well with this
        </button>
        {picker}
      </>
    );
  }

  return (
    <section className="pairs" aria-label="Pairs well with">
      <div className="section-head">
        <h2 className="eyebrow">Pairs well with</h2>
        <button type="button" className="head-edit" onClick={() => setOpen(true)}>
          <Pencil size={13} /> Edit
        </button>
      </div>
      <ul className="pairs-row">
        {pairs.map((p) => (
          <li key={p.id}>
            <Link href={`/r/${p.id}`} className="pair-card">
              <Tile recipe={p} />
              <span>{p.title}</span>
            </Link>
          </li>
        ))}
        <li>
          <button type="button" className="pair-card add" onClick={() => setOpen(true)}>
            <span className="tile">
              <Plus size={22} />
            </span>
            <span>Add</span>
          </button>
        </li>
      </ul>
      <Link href={`/cook?r=${[recipe.id, ...ids.slice(0, 5)].join(",")}`} className="text-btn primary pairs-cook">
        <Play size={14} /> Cook {pairs.length === 1 ? "both" : `all ${Math.min(pairs.length, 5) + 1}`} together
      </Link>
      {error && <p className="error" role="alert">{error}</p>}
      {picker}
    </section>
  );
}
