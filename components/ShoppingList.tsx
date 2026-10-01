"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import "@/app/styles/list.css";
import { Tile } from "@/components/bits";
import { Check, Close, Plus, Share } from "@/components/icons";
import { ListPicker } from "@/components/ListPicker";
import { scaledServes } from "@/components/scale";
import { combineIngredients, formatQty, servesNumber, type ShoppingLine } from "@/lib/recipe";
import { onListChange, readList, tickId, writeList, type ListEntry, type ShoppingState } from "@/lib/shopping";
import type { Recipe } from "@/lib/types";

export type ListRecipe = Pick<Recipe, "id" | "title" | "ingredients" | "serves" | "photoUrl">;

const SCALES = [0.5, 1, 2, 3];
const scaleLabel = (f: number) => `${formatQty(f, null)}×`;
const byName = (a: ShoppingLine, b: ShoppingLine) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const lineText = (l: ShoppingLine) => `- ${l.amount ? `${l.amount} ` : ""}${l.name}`;

/** Combined lines for the entries we still have recipes for (deleted recipes are skipped). */
function linesFor(entries: ListEntry[], byId: Map<string, ListRecipe>): ShoppingLine[] {
  return combineIngredients(
    entries.flatMap((e) => {
      const r = byId.get(e.id);
      return r ? [{ title: r.title, ingredients: r.ingredients, factor: e.factor }] : [];
    }),
  );
}

export function ShoppingList({ recipes }: { recipes: ListRecipe[] }) {
  const [list, setList] = useState<ShoppingState | null>(null);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(0);

  useEffect(() => {
    const sync = () => setList(readList());
    sync();
    return onListChange(sync);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(0), 2800);
    return () => clearTimeout(t);
  }, [copied]);

  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const entries = useMemo(() => (list?.recipes ?? []).filter((e) => byId.has(e.id)), [list, byId]);
  const { todo, got } = useMemo(() => {
    const ticked = new Set(list?.got);
    const lines = linesFor(entries, byId).sort(byName);
    return { todo: lines.filter((l) => !ticked.has(tickId(l))), got: lines.filter((l) => ticked.has(tickId(l))) };
  }, [entries, byId, list]);

  // Drop recipes that were deleted so the tab badge heals too. Only online: an offline copy
  // of this page can predate recipes that were added to the list since.
  useEffect(() => {
    if (!list || !navigator.onLine || list.recipes.every((e) => byId.has(e.id))) return;
    const cur = readList();
    writeList({ ...cur, recipes: cur.recipes.filter((e) => byId.has(e.id)) });
  }, [list, byId]);

  const saveRecipes = (next: ListEntry[]) => writeList({ ...readList(), recipes: next });

  const setFactor = (id: string, factor: number) =>
    saveRecipes(readList().recipes.map((e) => (e.id === id ? { ...e, factor } : e)));
  const remove = (id: string) => saveRecipes(readList().recipes.filter((e) => e.id !== id));
  const toggleRecipe = (id: string) => {
    const cur = readList().recipes;
    saveRecipes(cur.some((e) => e.id === id) ? cur.filter((e) => e.id !== id) : [...cur, { id, factor: 1 }]);
  };

  function toggleLine(id: string) {
    const cur = readList();
    // Keep only ticks that still match a line, so stale ones don't pile up.
    const live = new Set(linesFor(cur.recipes, byId).map(tickId));
    const next = cur.got.filter((t) => t !== id && live.has(t));
    writeList({ ...cur, got: cur.got.includes(id) ? next : [...next, id] });
  }

  function clearAll() {
    if (confirm("Clear the whole shopping list?")) writeList({ recipes: [], got: [] });
  }

  async function share() {
    const text = todo.map(lineText).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(Date.now());
    } catch {}
  }

  // Nothing until localStorage has been read, so the empty state doesn't flash.
  const body = !list ? null : entries.length === 0 ? (
    <div className="empty">
      <p className="display">Nothing to buy yet</p>
      <p>Pick a few recipes and we&rsquo;ll add up what you need.</p>
      <button type="button" className="btn accent" onClick={() => setPicking(true)}>
        <Plus size={20} />
        Add recipes
      </button>
    </div>
  ) : (
    <>
      <section className="section shop-section">
        <div className="section-head">
          <h2 className="eyebrow">Shopping for</h2>
          <button type="button" className="text-btn primary" onClick={() => setPicking(true)}>
            <Plus size={18} strokeWidth={2.2} />
            Add recipes
          </button>
        </div>
        <ul className="shop-recipes">
          {entries.map((e) => {
            const r = byId.get(e.id)!;
            const serves = r.serves && servesNumber(r.serves) !== null ? scaledServes(r.serves, e.factor) : null;
            const scales = SCALES.includes(e.factor) ? SCALES : [...SCALES, e.factor].sort((a, b) => a - b);
            return (
              <li key={e.id}>
                <Link href={`/r/${r.id}`} tabIndex={-1} aria-hidden="true">
                  <Tile recipe={r} />
                </Link>
                <div className="text">
                  <Link href={`/r/${r.id}`}>
                    <h3>{r.title}</h3>
                  </Link>
                  {serves && <p className="meta">Serves {serves}</p>}
                  <div className="shop-scale" role="group" aria-label={`Amount of ${r.title}`}>
                    {scales.map((f) => (
                      <button key={f} type="button" aria-pressed={f === e.factor} onClick={() => setFactor(e.id, f)}>
                        {scaleLabel(f)}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="icon-btn" aria-label={`Remove ${r.title}`} onClick={() => remove(e.id)}>
                  <Close size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section shop-section">
        <div className="section-head">
          <h2 className="eyebrow">To get</h2>
          <span className="eyebrow">{todo.length}</span>
        </div>
        {todo.length ? (
          <Lines lines={todo} ticked={false} onToggle={toggleLine} />
        ) : (
          <p className="shop-done">Everything&rsquo;s in the basket.</p>
        )}
      </section>

      {got.length > 0 && (
        <section className="section shop-section">
          <div className="section-head">
            <h2 className="eyebrow">Got it · {got.length}</h2>
            <button type="button" className="text-btn" onClick={() => writeList({ ...readList(), got: [] })}>
              Untick all
            </button>
          </div>
          <Lines lines={got} ticked onToggle={toggleLine} />
        </section>
      )}

      <div className="shop-foot">
        <button type="button" className="btn danger block" onClick={clearAll}>
          Clear list
        </button>
      </div>
    </>
  );

  // One tree with the picker in a fixed slot, so adding the first or removing the last
  // recipe from inside the sheet doesn't remount it (and lose its search and scroll).
  return (
    <>
      <ListHead>
        {todo.length > 0 && (
          <button type="button" className="icon-btn" aria-label={copied ? "List copied" : "Share list"} onClick={share}>
            {copied ? <Check size={18} /> : <Share />}
          </button>
        )}
      </ListHead>
      {copied > 0 && (
        <div key={copied} className="toast" role="status">
          <Check size={16} />
          List copied
        </div>
      )}
      {body}
      <ListPicker
        open={picking}
        onClose={() => setPicking(false)}
        recipes={recipes}
        chosen={new Set(entries.map((e) => e.id))}
        onToggle={toggleRecipe}
      />
    </>
  );
}

function ListHead({ children }: { children?: React.ReactNode }) {
  return (
    <header className="shop-head">
      <h1 className="display">Shopping list</h1>
      {children}
    </header>
  );
}

function Lines({ lines, ticked, onToggle }: { lines: ShoppingLine[]; ticked: boolean; onToggle: (key: string) => void }) {
  return (
    <ul className="ingredients shop-lines">
      {lines.map((l) => (
        <li key={l.key}>
          <button type="button" aria-pressed={ticked} onClick={() => onToggle(tickId(l))}>
            <span className="check">
              <Check size={14} />
            </span>
            <span className="line">
              <span className="what">
                {l.amount && <b>{l.amount}</b>} {l.name}
              </span>
              {l.from.length > 1 && <small className="from">{l.from.join(" · ")}</small>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
