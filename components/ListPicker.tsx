"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "@/app/styles/list.css";
import { Tile } from "@/components/bits";
import { Check, Close, Search } from "@/components/icons";
import type { ListRecipe } from "@/components/ShoppingList";
import { ingredientList } from "@/lib/recipe";

type Props = {
  open: boolean;
  onClose: () => void;
  recipes: ListRecipe[];
  chosen: Set<string>;
  onToggle: (id: string) => void;
};

/** Bottom sheet for picking which recipes to shop for. Tapping a row adds or removes it straight away. */
export function ListPicker({ open, onClose, recipes, chosen, onToggle }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return recipes;
    return recipes.filter((r) => [r.title, ...r.ingredients].some((t) => t.toLowerCase().includes(needle)));
  }, [recipes, q]);

  return (
    <dialog
      ref={ref}
      className="shop-sheet"
      aria-labelledby="picker-title"
      onClose={onClose}
      // A tap on the dimmed backdrop lands on the dialog itself; the content covers the rest.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shop-sheet-top">
        <div className="shop-sheet-grip" aria-hidden="true" />
        <div className="topbar">
          <h2 id="picker-title">Add recipes</h2>
          {/* First in the sheet so it, not the search field, takes focus (no surprise keyboard). */}
          <button type="button" className="text-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search recipes or ingredients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            autoCorrect="off"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")}>
              <Close size={18} />
            </button>
          )}
        </label>
      </div>

      <div className="shop-sheet-body">
        {recipes.length === 0 ? (
          <div className="empty">
            <p>No recipes in the kitchen yet.</p>
            <Link className="btn accent" href="/new">Add a recipe</Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>Nothing matches that.</p>
          </div>
        ) : (
          <ul className="list">
            {shown.map((r) => {
              const on = chosen.has(r.id);
              const n = ingredientList(r.ingredients).length;
              return (
                <li key={r.id}>
                  <button type="button" className="row" aria-pressed={on} onClick={() => onToggle(r.id)}>
                    <Tile recipe={r} />
                    <span className="text">
                      <span className="title">{r.title}</span>
                      <span className="meta">{on ? "On the list" : `${n} ${n === 1 ? "ingredient" : "ingredients"}`}</span>
                    </span>
                    <span className="check">
                      <Check size={14} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
