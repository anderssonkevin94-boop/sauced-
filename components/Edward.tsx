"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import "@/app/styles/list.css";
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
  const input = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState(0);
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

  // The bar sits on top of the keyboard while typing.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  // Opened and focused in the tap itself, so the iPhone brings the keyboard up straight away.
  function open() {
    ref.current?.showModal();
    input.current?.focus();
  }

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

  const busy = pending || !!error || turns.length > 0;

  // As small as it can be: just the bar to type in, the height of Edward's head; each message
  // adds a line above it, up to most of the screen. A tap outside closes it.
  return (
    <>
      <button type="button" className="edward-fab" data-where={where} aria-label={recipe ? `Fråga Edward om ${recipe.title}` : "Fråga Edward"} onClick={open}>
        <Face />
      </button>
      <dialog
        ref={ref}
        className="edward-sheet"
        aria-label={recipe ? `Edward, om ${recipe.title}` : "Edward"}
        style={keyboard > 80 ? { marginBottom: keyboard } : undefined}
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      >
        {busy && (
          <div className="edward-chat">
            {turns.length > 0 && (
              <button type="button" className="text-btn edward-clear" onClick={() => setTurns([])}>
                Rensa
              </button>
            )}
            {turns.map((t, i) => (
              <p key={i} className={`edward-msg ${t.role}`}>
                {t.text}
                {t.saved && (
                  <Link href={`/r/${t.saved.id}`} className="edward-saved" onClick={() => ref.current?.close()}>
                    Öppna {t.saved.title} →
                  </Link>
                )}
              </p>
            ))}
            {pending && <p className="edward-msg assistant muted">Edward funderar…</p>}
            {error && <p className="error">{error}</p>}
            <div ref={endRef} />
          </div>
        )}
        <form className="edward-form" onSubmit={send}>
          <Face />
          <input
            ref={input}
            className="input"
            placeholder={recipe ? `Fråga om ${recipe.title}` : "Fråga Edward"}
            aria-label="Fråga Edward"
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
            maxLength={1000}
          />
          <button type="submit" className="btn accent" aria-label="Skicka" disabled={!text.trim() || pending} onPointerDown={(e) => e.preventDefault()}>
            ↑
          </button>
        </form>
      </dialog>
    </>
  );
}

/** Edward's picture, in the app's accent orange (a lighter one in dark mode, like the accent). */
function Face() {
  return (
    <span className="edward-face">
      <img src="/edward-3.webp" alt="" width={173} height={192} className="only-light" />
      <img src="/edward-dark-3.webp" alt="" width={173} height={192} className="only-dark" />
    </span>
  );
}
