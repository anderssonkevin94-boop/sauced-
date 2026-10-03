"use client";
import "@/app/styles/editor.css";
import "@/app/styles/together.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tile } from "@/components/bits";
import { Check, Close, Search } from "@/components/icons";
import type { Recipe } from "@/lib/types";

const MAX = 6;

/** "Cook together…": pick the other recipes to make alongside this one, then start. */
export function TogetherPicker({ current, recipes }: { current: Pick<Recipe, "id" | "title">; recipes: Pick<Recipe, "id" | "title" | "photoUrl">[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const others = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipes.filter((r) => r.id !== current.id && (!needle || r.title.toLowerCase().includes(needle)));
  }, [recipes, current.id, q]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length + 1 >= MAX ? p : [...p, id]));

  function start() {
    router.push(`/cook?r=${[current.id, ...picked].join(",")}`);
  }

  if (!open) {
    return (
      <button type="button" className="text-btn together-open" onClick={() => setOpen(true)}>
        + Cook together with another recipe
      </button>
    );
  }

  return (
    <div className="edit-sheet together-sheet" role="dialog" aria-modal="true" aria-label="Cook together">
      <div className="topbar edit-sheet-top">
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
          <Close />
        </button>
        <span className="eyebrow">Cook together</span>
        <span style={{ width: 44 }} />
      </div>
      <div className="edit-sheet-body">
        <p className="together-pick-lede">
          With <b>{current.title}</b>. Pick what else you&rsquo;re making; the steps get lined up so it&rsquo;s all ready at once.
        </p>
        <label className="search">
          <Search size={18} />
          <input type="search" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
        </label>
        <ul className="together-pick">
          {others.map((r) => {
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <button type="button" aria-pressed={on} onClick={() => toggle(r.id)}>
                  <Tile recipe={r} />
                  <span className="name">{r.title}</span>
                  <span className="check">
                    <Check size={14} />
                  </span>
                </button>
              </li>
            );
          })}
          {others.length === 0 && <li className="muted">Nothing matches that.</li>}
        </ul>
      </div>
      <div className="together-go">
        <button type="button" className="btn accent block" disabled={!picked.length} onClick={start}>
          {picked.length ? `Cook ${picked.length + 1} recipes together` : "Pick at least one more"}
        </button>
      </div>
    </div>
  );
}
