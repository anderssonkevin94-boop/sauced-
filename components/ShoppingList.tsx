"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "@/app/styles/list.css";
import { Tile } from "@/components/bits";
import { Basket, Check, Close, Plus, Share } from "@/components/icons";
import { ListPicker } from "@/components/ListPicker";
import { scaledServes } from "@/components/scale";
import { ShoppingTrip } from "@/components/ShoppingTrip";
import { dismissList, sendList } from "@/lib/actions";
import { useBeta } from "@/lib/beta-flag";
import { combineIngredients, formatQty, servesNumber, type ShoppingLine } from "@/lib/recipe";
import { addItems, mergeList, onListChange, readList, removeItem, tickId, writeList, type ListEntry, type ListItem, type ShoppingState } from "@/lib/shopping";
import type { Cook, Recipe, SharedList } from "@/lib/types";

export type ListRecipe = Pick<Recipe, "id" | "title" | "ingredients" | "serves" | "photoUrl">;

const SCALES = [0.5, 1, 2, 3];
const scaleLabel = (f: number) => `${formatQty(f, null)}×`;
const byName = (a: ShoppingLine, b: ShoppingLine) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const lineText = (l: ShoppingLine) => `- ${l.amount ? `${l.amount} ` : ""}${l.name}`;

/** Things added by hand, as list lines (keys start "item:" so they never meet a recipe's). */
const itemLines = (items: ListItem[] = []): ShoppingLine[] => items.map((i) => ({ key: `item:${i.id}`, amount: null, name: i.text, from: [] }));

/** Combined lines for the entries we still have recipes for (deleted recipes are skipped), then the hand-added ones. */
function linesFor(entries: ListEntry[], byId: Map<string, ListRecipe>, items?: ListItem[]): ShoppingLine[] {
  return [
    ...combineIngredients(
      entries.flatMap((e) => {
        const r = byId.get(e.id);
        return r ? [{ title: r.title, ingredients: r.ingredients, factor: e.factor }] : [];
      }),
    ),
    ...itemLines(items),
  ];
}

type Props = { recipes: ListRecipe[]; others?: Cook[]; incoming?: SharedList[] };

export function ShoppingList({ recipes, others = [], incoming = [] }: Props) {
  const beta = useBeta();
  const [list, setList] = useState<ShoppingState | null>(null);
  const [picking, setPicking] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(0);
  const [toast, setToast] = useState("");
  const [handled, setHandled] = useState<string[]>([]);

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
  const { lines, todo, got, ticked } = useMemo(() => {
    const ticked = new Set(list?.got);
    const lines = linesFor(entries, byId, list?.items).sort(byName);
    return { lines, ticked, todo: lines.filter((l) => !ticked.has(tickId(l))), got: lines.filter((l) => ticked.has(tickId(l))) };
  }, [entries, byId, list]);
  const items = list?.items ?? [];

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
    const live = new Set(linesFor(cur.recipes, byId, cur.items).map(tickId));
    const next = cur.got.filter((t) => t !== id && live.has(t));
    writeList({ ...cur, got: cur.got.includes(id) ? next : [...next, id] });
  }

  function clearAll() {
    if (confirm("Clear the whole shopping list?")) writeList({ recipes: [], got: [], items: [] });
  }

  function say(text: string) {
    setToast(text);
    setCopied(Date.now());
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
      say("List copied");
    } catch {}
  }

  async function sendTo(cook: Cook) {
    const cur = readList();
    const res = await sendList(
      cook.id,
      cur.recipes.filter((e) => byId.has(e.id)),
      (cur.items ?? []).map((i) => i.text),
    );
    setSending(false);
    say(res.error ?? `Sent to ${cook.name}`);
  }

  async function take(l: SharedList, add: boolean) {
    setHandled((h) => [...h, l.id]);
    if (add) mergeList({ recipes: l.recipes.filter((r) => byId.has(r.id)), items: l.items });
    await dismissList(l.id);
    if (add) say(`Added ${l.from.name}\u2019s list`);
  }

  // Nothing until localStorage has been read, so the empty state doesn't flash.
  const body = !list ? null : entries.length === 0 && items.length === 0 ? (
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
      {entries.length > 0 && (
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
      )}

      <section className="section shop-section">
        <div className="section-head">
          <h2 className="eyebrow">To get</h2>
          <span className="eyebrow">{todo.length}</span>
        </div>
        {todo.length ? (
          <Lines lines={todo} ticked={false} onToggle={toggleLine} onRemove={removeItem} />
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
          <Lines lines={got} ticked onToggle={toggleLine} onRemove={removeItem} />
        </section>
      )}

      <div className="shop-foot">
        {beta && todo.length > 0 && (
          <button type="button" className="btn accent block shop-go" onClick={() => setShopping(true)}>
            <Basket size={20} />
            Go shopping
          </button>
        )}
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
          <button
            type="button"
            className="icon-btn"
            aria-label={copied ? toast : "Share list"}
            onClick={beta && others.length ? () => setSending(true) : share}
          >
            {copied ? <Check size={18} /> : <Share />}
          </button>
        )}
      </ListHead>
      {copied > 0 && (
        <div key={copied} className="toast" role="status">
          <Check size={16} />
          {toast || "List copied"}
        </div>
      )}
      {beta &&
        incoming.filter((l) => !handled.includes(l.id)).map((l) => (
          <div key={l.id} className="push-card shop-incoming">
            <p>
              <b>{l.from.name} sent you a list</b> ·{" "}
              {[
                l.recipes.length && `${l.recipes.length} ${l.recipes.length === 1 ? "recipe" : "recipes"}`,
                l.items.length && `${l.items.length} ${l.items.length === 1 ? "item" : "items"}`,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <span>
              <button type="button" className="text-btn" onClick={() => take(l, false)}>
                No thanks
              </button>
              <button type="button" className="btn accent" onClick={() => take(l, true)}>
                Add
              </button>
            </span>
          </div>
        ))}
      {body}
      {beta && list && <AddItem />}
      {beta && <ShoppingTrip open={shopping} onClose={() => setShopping(false)} lines={lines} got={ticked} onToggle={toggleLine} />}
      {beta && (
        <SendSheet open={sending} onClose={() => setSending(false)} others={others} onSend={sendTo} onText={() => (setSending(false), share())} />
      )}
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

/**
 * "Add an item", docked above the tab bar like Safari's address bar (and on top of the keyboard
 * while typing). After adding, the field stays focused and empty, ready for the next one.
 */
function AddItem() {
  const [text, setText] = useState("");
  const [keyboard, setKeyboard] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // How much of the screen the keyboard covers, so the bar can sit right on top of it.
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

  function add() {
    if (text.trim()) addItems([text]);
    setText("");
    input.current?.focus();
  }

  return (
    <>
      {/* Room at the bottom of the page so the docked bar never covers the last line. */}
      <div className="shop-add-space" aria-hidden="true" />
      <form
        className="shop-add shop-add-bar"
        style={keyboard > 80 ? { bottom: keyboard } : undefined}
        data-keyboard={keyboard > 80 || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          ref={input}
          className="input"
          placeholder="Add an item"
          aria-label="Add an item"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="enter"
          autoComplete="off"
          maxLength={120}
        />
        <button
          type="submit"
          className="btn accent"
          disabled={!text.trim()}
          aria-label="Add"
          // Keep the field (and the keyboard) up when the button is tapped.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={20} />
        </button>
      </form>
    </>
  );
}

/** Send a copy of the list to someone in the kitchen, or share it as text anywhere else. */
function SendSheet({ open, onClose, others, onSend, onText }: { open: boolean; onClose: () => void; others: Cook[]; onSend: (c: Cook) => Promise<void>; onText: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="shop-sheet send-sheet" aria-labelledby="send-title" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="shop-sheet-top">
        <div className="shop-sheet-grip" aria-hidden="true" />
        <div className="topbar">
          <h2 id="send-title">Share the list</h2>
          <button type="button" className="text-btn primary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
      <div className="shop-sheet-body">
        <p className="muted send-hint">They get a copy to add to their own list.</p>
        <ul className="list">
          {others.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="row"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(c.id);
                  await onSend(c);
                  setBusy("");
                }}
              >
                <span className="text">
                  <span className="title">{busy === c.id ? "Sending…" : c.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn ghost block" onClick={onText}>
          <Share size={18} />
          Share as text
        </button>
      </div>
    </dialog>
  );
}

function Lines({ lines, ticked, onToggle, onRemove }: { lines: ShoppingLine[]; ticked: boolean; onToggle: (key: string) => void; onRemove: (itemId: string) => void }) {
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
          {l.key.startsWith("item:") && (
            <button type="button" className="icon-btn shop-remove" aria-label={`Remove ${l.name}`} onClick={() => onRemove(l.key.slice(5))}>
              <Close size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
