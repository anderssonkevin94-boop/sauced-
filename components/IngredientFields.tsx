"use client";
import "@/app/styles/editor.css";
import { useEffect, useRef, useState } from "react";
import { Close, Plus } from "@/components/icons";
import { toLines } from "@/lib/parse";
import { ingredientParts, isAmount, joinIngredient, sectionName } from "@/lib/recipe";

// The ingredient list as rows of amount · unit · ingredient. The recipe still saves as plain
// lines ("2 msk smör"), so drafts, Tidy up and the text view all keep working on the string;
// this only edits it. A blank row always waits at the end for the next ingredient.

const UNITS: { group: string; units: string[] }[] = [
  { group: "Weight", units: ["g", "kg"] },
  { group: "Volume", units: ["ml", "cl", "dl", "l"] },
  { group: "Spoons", units: ["krm", "tsk", "msk"] },
  { group: "Count", units: ["st", "paket", "burk", "klyftor", "skivor", "knippe", "kvistar", "nypa", "näve"] },
  { group: "US / UK", units: ["tsp", "tbsp", "cups", "oz", "lb", "cans", "cloves", "pinch"] },
];
const KNOWN = new Set(UNITS.flatMap((g) => g.units));

type Row =
  | { key: number; kind: "item"; amount: string; unit: string; name: string; raw?: string }
  | { key: number; kind: "section"; name: string; raw?: string };

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, kind: "item", amount: "", unit: "", name: "" });
const isBlank = (r: Row) => r.kind === "item" && !r.amount.trim() && !r.unit && !r.name.trim();

function toRow(line: string): Row {
  const section = sectionName(line);
  if (section) return { key: nextKey++, kind: "section", name: section, raw: line };
  return { key: nextKey++, kind: "item", ...ingredientParts(line), raw: line };
}

/** Always exactly one blank row at the end. */
function withTail(rows: Row[]): Row[] {
  const out = [...rows];
  while (out.length > 1 && isBlank(out[out.length - 1]) && isBlank(out[out.length - 2])) out.pop();
  if (!out.length || !isBlank(out[out.length - 1])) out.push(blank());
  return out;
}

const toRows = (text: string) => withTail(toLines(text).map(toRow));

function toText(rows: Row[]): string {
  return rows
    .map((r) => {
      if (r.raw !== undefined) return r.raw; // untouched: keep the line exactly as it was
      if (r.kind === "section") return r.name.trim() ? `${r.name.trim().replace(/:+$/, "")}:` : "";
      return joinIngredient(r);
    })
    .filter(Boolean)
    .join("\n");
}

export function IngredientFields({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const emitted = useRef(value);
  const list = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ key: number; field: string } | null>(null);

  // A new value from outside (draft restored, Tidy up, Start over): read it into rows again.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setRows(toRows(value));
  }, [value]);

  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    list.current?.querySelector<HTMLElement>(`[data-row="${f.key}"] [data-field="${f.field}"]`)?.focus();
  });

  function commit(next: Row[]) {
    const tailed = withTail(next);
    setRows(tailed);
    const text = toText(tailed);
    emitted.current = text;
    onChange(text);
  }

  const edit = (key: number, patch: Partial<{ amount: string; unit: string; name: string }>) =>
    commit(rows.map((r) => (r.key === key ? ({ ...r, ...patch, raw: undefined } as Row) : r)));

  const remove = (key: number) => commit(rows.filter((r) => r.key !== key));

  function addSection() {
    const row: Row = { key: nextKey++, kind: "section", name: "" };
    // Before the trailing blank row, so the section heads whatever comes next.
    const i = rows.length - 1;
    focusNext.current = { key: row.key, field: "name" };
    commit([...rows.slice(0, i), row, ...rows.slice(i)]);
  }

  /** Enter on a row: on to the next row's amount (a fresh row after the last one). */
  function onEnter(e: React.KeyboardEvent, key: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.key === key);
    const after = rows[i + 1];
    if (after) {
      focusNext.current = { key: after.key, field: after.kind === "item" ? "amount" : "name" };
      setRows([...rows]);
    }
  }

  /** Pasting a whole list into any box splits it into rows, starting at that row. */
  function onPaste(e: React.ClipboardEvent, key: number) {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.key === key);
    const pasted = toLines(text).map(toRow).map((r) => ({ ...r, raw: undefined }) as Row);
    const keep = isBlank(rows[i]) ? 0 : 1;
    commit([...rows.slice(0, i + keep), ...pasted, ...rows.slice(i + 1)]);
  }

  const last = rows[rows.length - 1]?.key;

  return (
    <div className="rows" ref={list}>
      <div className="ing-row head" aria-hidden="true">
        <span>Amount</span>
        <span>Unit</span>
        <span>Ingredient</span>
      </div>

      {rows.map((r, i) =>
        r.kind === "section" ? (
          <div key={r.key} className="sec-row" data-row={r.key}>
            <input
              className="input"
              data-field="name"
              value={r.name}
              placeholder="Section, like Sauce"
              aria-label="Section name"
              onChange={(e) => edit(r.key, { name: e.target.value })}
              onKeyDown={(e) => onEnter(e, r.key)}
              enterKeyHint="next"
            />
            <button type="button" className="row-x" aria-label="Remove section" onClick={() => remove(r.key)}>
              <Close size={16} />
            </button>
          </div>
        ) : (
          <div key={r.key} className="ing-row" data-row={r.key}>
            <input
              className="input"
              data-field="amount"
              value={r.amount}
              placeholder={i === 0 ? "2" : ""}
              aria-label="Amount"
              aria-invalid={r.amount.trim() !== "" && !isAmount(r.amount)}
              onChange={(e) => edit(r.key, { amount: e.target.value })}
              onKeyDown={(e) => onEnter(e, r.key)}
              onPaste={(e) => onPaste(e, r.key)}
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="next"
            />
            <select className="input" data-field="unit" value={r.unit} aria-label="Unit" onChange={(e) => edit(r.key, { unit: e.target.value })}>
              <option value="">–</option>
              {r.unit && !KNOWN.has(r.unit) && <option value={r.unit}>{r.unit}</option>}
              {UNITS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              className="input"
              data-field="name"
              value={r.name}
              placeholder={i === 0 ? "butter, softened" : r.key === last ? "Add an ingredient" : ""}
              aria-label="Ingredient"
              onChange={(e) => edit(r.key, { name: e.target.value })}
              onKeyDown={(e) => onEnter(e, r.key)}
              onPaste={(e) => onPaste(e, r.key)}
              autoComplete="off"
              enterKeyHint="next"
            />
            {r.key === last ? (
              <span aria-hidden="true" />
            ) : (
              <button type="button" className="row-x" aria-label="Remove ingredient" onClick={() => remove(r.key)}>
                <Close size={16} />
              </button>
            )}
          </div>
        ),
      )}

      <button type="button" className="text-btn add-sec" onClick={addSection}>
        <Plus size={16} /> Section
      </button>
    </div>
  );
}
