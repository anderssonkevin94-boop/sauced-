"use client";
import "@/app/styles/editor.css";
import "@/app/styles/together.css";
import { useEffect, useMemo, useState } from "react";
import { Tile } from "@/components/bits";
import { Check, Close, Search } from "@/components/icons";
import type { Recipe } from "@/lib/types";

type Pickable = Pick<Recipe, "id" | "title" | "photoUrl">;

/**
 * A sheet for ticking recipes: Cook together and "Pairs well with" both use it.
 * `suggested` recipes come first with a small tag; `max` caps how many can be ticked.
 */
export function RecipePicker({
  heading,
  lede,
  recipes,
  exclude,
  suggested = [],
  suggestedLabel = "Pairs well",
  initial = [],
  max = 12,
  confirm,
  busy = false,
  onConfirm,
  onClose,
}: {
  heading: string;
  lede: React.ReactNode;
  recipes: Pickable[];
  /** Not offered at all (the recipe you're on). */
  exclude: string[];
  suggested?: string[];
  suggestedLabel?: string;
  initial?: string[];
  max?: number;
  /** Button text for how many are ticked, e.g. n => `Cook ${n + 1} recipes together`. */
  confirm: (n: number) => string;
  busy?: boolean;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [q, setQ] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = recipes.filter((r) => !exclude.includes(r.id) && (!needle || r.title.toLowerCase().includes(needle)));
    // Suggestions first, the rest as they come.
    return [...list.filter((r) => suggested.includes(r.id)), ...list.filter((r) => !suggested.includes(r.id))];
  }, [recipes, exclude, suggested, q]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]));

  return (
    <div className="edit-sheet together-sheet" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="topbar edit-sheet-top">
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
        <span className="eyebrow">{heading}</span>
        <span style={{ width: 44 }} />
      </div>
      <div className="edit-sheet-body">
        <p className="together-pick-lede">{lede}</p>
        <label className="search">
          <Search size={18} />
          <input type="search" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
        </label>
        <ul className="together-pick">
          {shown.map((r) => {
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <button type="button" aria-pressed={on} onClick={() => toggle(r.id)}>
                  <Tile recipe={r} />
                  <span className="name">
                    {r.title}
                    {suggested.includes(r.id) && <span className="pick-tag">{suggestedLabel}</span>}
                  </span>
                  <span className="check">
                    <Check size={14} />
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="muted">Nothing matches that.</li>}
        </ul>
      </div>
      <div className="together-go">
        <button type="button" className="btn accent block" disabled={busy || (!picked.length && !initial.length)} onClick={() => onConfirm(picked)}>
          {confirm(picked.length)}
        </button>
      </div>
    </div>
  );
}
