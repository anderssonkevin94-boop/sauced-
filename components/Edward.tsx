"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import "@/app/styles/list.css";
import { Close } from "@/components/icons";
import { askEdward, type EdwardTurn } from "@/lib/edward";
import { addItems, addToList } from "@/lib/shopping";

const KEY = "sauced:edward";

/** Edward, the kitchen helper (Beta, in the spirit of Edward Blom, and in Swedish): a chat that can add to the shopping list and answer cooking questions. */
export function Edward() {
  const ref = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<EdwardTurn[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setTurns(JSON.parse(sessionStorage.getItem(KEY) ?? "[]"));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);
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
    const next: EdwardTurn[] = [...turns, { role: "user", text: q }];
    setTurns(next);
    setText("");
    setError("");
    start(async () => {
      const res = await askEdward(next);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      for (const a of res.actions) {
        if (a.type === "add_items") addItems(a.items);
        else addToList(a.id, a.factor);
      }
      setTurns([...next, { role: "assistant", text: res.text }]);
    });
  }

  return (
    <>
      <button type="button" className="edward-fab" aria-label="Fråga Edward" onClick={() => setOpen(true)}>
        <img src="/edward.webp" alt="" width={60} height={72} />
      </button>
      <dialog ref={ref} className="shop-sheet edward-sheet" aria-labelledby="edward-title" onClose={() => setOpen(false)}>
        <div className="shop-sheet-top">
          <div className="topbar">
            <h2 id="edward-title">
              <img src="/edward.webp" alt="" />
              Edward
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
          {turns.length === 0 && (
            <p className="muted edward-hint">
              Prova &ldquo;lägg till pickles och 2 l mjölk på listan&rdquo;, &ldquo;hur mycket är 5 oz i gram?&rdquo; eller &ldquo;vad kan jag ersätta crème fraiche med?&rdquo;.
            </p>
          )}
          {turns.map((t, i) => (
            <p key={i} className={`edward-msg ${t.role}`}>
              {t.text}
            </p>
          ))}
          {pending && <p className="edward-msg assistant muted">…</p>}
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
