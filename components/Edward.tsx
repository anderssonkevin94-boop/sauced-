"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import "@/app/styles/list.css";
import { Close } from "@/components/icons";
import Link from "next/link";
import type { EdwardReply, EdwardTurn } from "@/lib/edward";
import { addItems, addToList } from "@/lib/shopping";

const KEY = "sauced:edward";

/** A chat line; Edward's can link to a recipe he just saved. */
type Turn = EdwardTurn & { saved?: { id: string; title: string } };

async function askEdward(history: EdwardTurn[], recipeId?: string): Promise<EdwardReply> {
  try {
    const res = await fetch("/api/edward", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: history.map(({ role, text }) => ({ role, text })), recipeId }),
    });
    return (await res.json()) as EdwardReply;
  } catch {
    return { error: "Fick inte tag på Edward. Är du uppkopplad?" };
  }
}

/**
 * Edward, the kitchen helper (Beta, in the spirit of Edward Blom, and in Swedish): a chat that can
 * add to the shopping list and answer cooking questions. On a recipe (or cooking it) he answers
 * about that recipe, with a chat of its own. `where` places his button clear of that screen's bars.
 */
export function Edward({ recipe, where = "tabs" }: { recipe?: { id: string; title: string }; where?: "tabs" | "page" | "cook" }) {
  const key = recipe ? `${KEY}:${recipe.id}` : KEY;
  const ref = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setTurns(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(turns.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [key, turns, pending]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || pending) return;
    const next: Turn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setText("");
    setError("");
    start(async () => {
      const res = await askEdward(next, recipe?.id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      let saved: Turn["saved"];
      for (const a of res.actions) {
        if (a.type === "add_items") addItems(a.items);
        else if (a.type === "add_recipe") addToList(a.id, a.factor);
        else saved = { id: a.id, title: a.title };
      }
      setTurns([...next, { role: "assistant", text: res.text, saved }]);
    });
  }

  return (
    <>
      <button type="button" className="edward-fab" data-where={where} aria-label={recipe ? `Fråga Edward om ${recipe.title}` : "Fråga Edward"} onClick={() => setOpen(true)}>
        <Face />
      </button>
      <dialog ref={ref} className="shop-sheet edward-sheet" aria-labelledby="edward-title" onClose={() => setOpen(false)}>
        <div className="shop-sheet-top">
          <div className="topbar">
            <h2 id="edward-title">
              <Face />
              <span className="edward-title">
                Edward
                {recipe && <small>{recipe.title}</small>}
              </span>
            </h2>
            <span>
              {turns.length > 0 && (
                <button type="button" className="text-btn" onClick={() => setTurns([])}>
                  Rensa
                </button>
              )}
              <button type="button" className="icon-btn" aria-label="Stäng" onClick={() => setOpen(false)}>
                <Close size={20} />
              </button>
            </span>
          </div>
        </div>
        <div className="shop-sheet-body edward-chat">
          {turns.length === 0 && recipe && (
            <p className="muted edward-hint">
              Fråga om {recipe.title}: &ldquo;kan jag byta grädden mot mjölk?&rdquo;, &ldquo;hur vet jag att den är klar?&rdquo; eller &ldquo;gör den till 6 portioner&rdquo;.
            </p>
          )}
          {turns.length === 0 && !recipe && (
            <p className="muted edward-hint">
              Prova &ldquo;lägg till pickles och 2 l mjölk på listan&rdquo;, &ldquo;hur mycket är 5 oz i gram?&rdquo; eller &ldquo;vad kan jag ersätta crème fraiche med?&rdquo;.
            </p>
          )}
          {turns.map((t, i) => (
            <p key={i} className={`edward-msg ${t.role}`}>
              {t.text}
              {t.saved && (
                <Link href={`/r/${t.saved.id}`} className="edward-saved" onClick={() => setOpen(false)}>
                  Öppna {t.saved.title} →
                </Link>
              )}
            </p>
          ))}
          {pending && <p className="edward-msg assistant muted">Edward funderar…</p>}
          {error && <p className="error">{error}</p>}
          <div ref={endRef} />
        </div>
        <form className="shop-add edward-form" onSubmit={send}>
          <input className="input" placeholder="Fråga Edward" aria-label="Fråga Edward" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" maxLength={1000} />
          <button type="submit" className="btn accent" disabled={!text.trim() || pending}>
            Skicka
          </button>
        </form>
      </dialog>
    </>
  );
}

/** Edward's picture, in the app's accent orange (a lighter one in dark mode, like the accent). */
function Face() {
  return (
    <picture>
      <source srcSet="/edward-dark.webp" media="(prefers-color-scheme: dark)" />
      <img src="/edward.webp" alt="" width={153} height={192} />
    </picture>
  );
}
