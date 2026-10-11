"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "@/app/styles/list.css";
import { Check } from "@/components/icons";
import { AISLES, aisleKey, aisleOf, type Aisle } from "@/lib/aisles";
import type { ShoppingLine } from "@/lib/recipe";
import { readAisles, saveAisle, tickId } from "@/lib/shopping";

type Props = {
  open: boolean;
  onClose: () => void;
  lines: ShoppingLine[];
  got: Set<string>;
  onToggle: (tick: string) => void;
};

/**
 * "Go shopping": the whole list in the order you walk the shop, one aisle at a time. Ticks are
 * the list's own, so leaving halfway keeps them. "Move items" lets you put a line in another
 * aisle; the phone remembers that for next time.
 */
export function ShoppingTrip({ open, onClose, lines, got, onToggle }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [moving, setMoving] = useState(false);
  const [mine, setMine] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setMine(readAisles());
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const valid = useMemo(() => new Set<string>(AISLES.map((a) => a.id)), []);
  const aisleFor = (l: ShoppingLine): Aisle => {
    const own = mine[aisleKey(l.name)];
    return own && valid.has(own) ? (own as Aisle) : aisleOf(l.name);
  };

  const groups = AISLES.map((a) => ({
    ...a,
    lines: lines.filter((l) => aisleFor(l) === a.id).sort((x, y) => Number(got.has(tickId(x))) - Number(got.has(tickId(y)))),
  })).filter((g) => g.lines.length);
  const done = lines.filter((l) => got.has(tickId(l))).length;

  function move(l: ShoppingLine, aisle: string) {
    saveAisle(aisleKey(l.name), aisle);
    setMine(readAisles());
  }

  return (
    <dialog ref={ref} className="shop-sheet trip" aria-labelledby="trip-title" onClose={onClose}>
      <div className="shop-sheet-top">
        <div className="topbar">
          <h2 id="trip-title">Shopping</h2>
          <button type="button" className="text-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="trip-progress">
          <span className="ai-bar" aria-hidden="true">
            <i style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} />
          </span>
          <span className="eyebrow">
            {done} of {lines.length}
          </span>
          <button type="button" className="text-btn" aria-pressed={moving} onClick={() => setMoving(!moving)}>
            {moving ? "Finished moving" : "Move items"}
          </button>
        </div>
      </div>

      <div className="shop-sheet-body">
        {done === lines.length && lines.length > 0 && <p className="shop-done trip-done">Everything&rsquo;s in the basket. 🎉</p>}
        {groups.map((g) => (
          <section key={g.id} className="trip-aisle">
            <h3 className="eyebrow">{g.label}</h3>
            <ul className="ingredients shop-lines">
              {g.lines.map((l) => {
                const tick = tickId(l);
                return (
                  <li key={l.key}>
                    <button type="button" aria-pressed={got.has(tick)} onClick={() => onToggle(tick)}>
                      <span className="check">
                        <Check size={14} />
                      </span>
                      <span className="line">
                        <span className="what">
                          {l.amount && <b>{l.amount}</b>} {l.name}
                        </span>
                      </span>
                    </button>
                    {moving && (
                      <select className="trip-move" aria-label={`Aisle for ${l.name}`} value={g.id} onChange={(e) => move(l, e.target.value)}>
                        {AISLES.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
