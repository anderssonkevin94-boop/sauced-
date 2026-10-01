"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock, Close } from "@/components/icons";
import { importRecipe, type DiscoverHit, type ImportResult } from "@/lib/discover";

// RecipeForm's unsaved-draft key: the new-recipe form restores whatever is here.
const DRAFT_KEY = "sauced:draft";

const count = new Intl.NumberFormat("en-US");

/** "★ 4.8 · 2,310 ratings", or null when the page showed no rating. */
export function ratingText(h: Pick<DiscoverHit, "rating" | "ratingCount">): string | null {
  if (h.rating == null || !Number.isFinite(h.rating)) return null;
  const stars = `★ ${Math.min(5, Math.max(0, h.rating)).toFixed(1)}`;
  if (!h.ratingCount) return stars;
  return `${stars} · ${count.format(h.ratingCount)} ${h.ratingCount === 1 ? "rating" : "ratings"}`;
}

export function HitFacts({ hit }: { hit: DiscoverHit }) {
  const rating = ratingText(hit);
  if (!rating && !hit.time) return null;
  return (
    <span className="meta discover-facts">
      {rating && <span className="discover-rating">{rating}</span>}
      {rating && hit.time && <span className="dot" />}
      {hit.time && <span>{hit.time}</span>}
    </span>
  );
}

/** Someone halfway through typing a recipe shouldn't lose it to an import without being asked. */
function hasDraft(): boolean {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Record<string, unknown> | null;
    return !!d && [d.title, d.ingredients, d.steps, d.notes].some((v) => typeof v === "string" && v.trim() !== "");
  } catch {
    return false;
  }
}

// The url comes from a web search; only ever link to a real web page.
const webUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

/** Bottom sheet for one search hit. Mounted per hit, so closing it abandons a pending import. */
export function DiscoverHitSheet({ hit, onClose }: { hit: DiscoverHit; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = webUrl(hit.url);
  const rating = ratingText(hit);

  useEffect(() => {
    alive.current = true;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      alive.current = false;
    };
  }, []);

  const close = () => ref.current?.close();

  async function tryIt() {
    if (busy) return;
    // Asked before the call, not after, so nobody waits half a minute to then say no.
    if (hasDraft() && !confirm("Replace the recipe you're in the middle of writing?")) return;
    setError("");
    setBusy(true);
    let res: ImportResult;
    try {
      res = await importRecipe({ url: hit.url, title: hit.title });
    } catch {
      res = { ok: false, error: "Couldn't reach the kitchen. Check your connection and try again." };
    }
    if (!alive.current) return;
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    try {
      // The banner reads "Imported from ICA": the site, not the recipe title (that's already in the form).
      const importedFrom = { title: hit.source || res.source.title, url: res.source.url || hit.url };
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...res.fields, photoPath: "", importedFrom }));
    } catch {
      setError("Couldn't open it in the recipe form. Try again.");
      setBusy(false);
      return;
    }
    router.push("/new"); // stays busy until the form takes over
  }

  return (
    <dialog
      ref={ref}
      className="discover-sheet"
      aria-labelledby="discover-sheet-title"
      onClose={onClose}
      // Mid-import only the Close button leaves, so a stray tap or swipe doesn't throw the wait away.
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => e.target === e.currentTarget && !busy && close()}
    >
      <div className="discover-sheet-body">
        <div className="discover-sheet-grip" aria-hidden="true" />
        <div className="discover-sheet-bar">
          <span className="eyebrow">{hit.source}</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <Close size={20} />
          </button>
        </div>

        <h2 id="discover-sheet-title" className="display">
          {hit.title}
        </h2>

        {(rating || hit.time) && (
          <div className="facts">
            {rating && <span className="fact discover-rating">{rating}</span>}
            {hit.time && (
              <span className="fact">
                <Clock size={16} />
                {hit.time}
              </span>
            )}
          </div>
        )}

        {hit.summary && <p className="discover-sheet-summary">{hit.summary}</p>}

        <div className="discover-sheet-actions">
          <button type="button" className="btn accent block" onClick={tryIt} disabled={busy} aria-busy={busy}>
            {busy ? "Converting to metric…" : "Try it"}
          </button>
          <p className="discover-note" role="status">
            {busy
              ? "Reading the recipe. Usually 20–40 seconds."
              : "Claude converts it to metric and opens it as a new recipe for you to check and save."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {url && (
            <a className="btn ghost block" href={url} target="_blank" rel="noopener noreferrer">
              View original
            </a>
          )}
        </div>
      </div>
    </dialog>
  );
}
