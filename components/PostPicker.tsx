"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "@/app/styles/list.css";
import { Tile } from "@/components/bits";
import { Plus } from "@/components/icons";

type Mine = { id: string; title: string; photoUrl: string | null };

/** The Feed's "Post" button: pick one of your recipes, and its page opens with the post sheet. */
export function PostPicker({ recipes }: { recipes: Mine[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className="btn accent post-btn" onClick={() => setOpen(true)}>
        <Plus size={18} />
        Post
      </button>
      <dialog ref={ref} className="shop-sheet" aria-labelledby="pick-title" onClose={() => setOpen(false)} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="shop-sheet-top">
          <div className="shop-sheet-grip" aria-hidden="true" />
          <div className="topbar">
            <h2 id="pick-title">What did you make?</h2>
            <button type="button" className="text-btn primary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="muted send-hint">Pick one of your recipes. To post a cook of someone else&rsquo;s, log it on their recipe and tick &ldquo;Post to the feed&rdquo;.</p>
        </div>
        <div className="shop-sheet-body">
          {recipes.length === 0 ? (
            <div className="empty">
              <p>You haven&rsquo;t added a recipe yet.</p>
              <Link className="btn accent" href="/new">Add a recipe</Link>
            </div>
          ) : (
            <ul className="list">
              {recipes.map((r) => (
                <li key={r.id}>
                  <Link href={`/r/${r.id}?post=1`} className="row" onClick={() => setOpen(false)}>
                    <Tile recipe={r} />
                    <span className="text">
                      <span className="title">{r.title}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
