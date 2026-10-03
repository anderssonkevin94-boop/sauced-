"use client";
import "@/app/styles/editor.css";
import { useEffect, useRef, useState } from "react";
import { ApplianceIcon } from "@/components/HeatChip";
import { Camera, Close, Flame, Grip, Plus } from "@/components/icons";
import { StopwatchControl, useStopwatches, watchTime } from "@/components/Stopwatch";
import { moveItem, useDragSort } from "@/components/useDragSort";
import { photoUrl } from "@/lib/config";
import { toLines } from "@/lib/parse";
import { uploadPhoto } from "@/lib/photo";
import { sectionName } from "@/lib/recipe";
import { APPLIANCES, OVEN_MODES, applianceInfo, joinStep, splitStep, switchAppliance, type Appliance, type Heat } from "@/lib/step";

// The method as a stack of step cards: each with its words, an optional heat and time
// (oven 200°C fan, pan medium-high, 25 min) and an optional photo. Drag a card by its
// handle to reorder it. Saves as plain lines with the extras in brackets at the end (see
// lib/step.ts), so drafts, Tidy up and the text view keep working on the string.

type StepRow = { key: number; kind: "step"; text: string; heat: Heat | null; photo: string | null; open: boolean; raw?: string };
type Row = StepRow | { key: number; kind: "section"; name: string; raw?: string };

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, kind: "step", text: "", heat: null, photo: null, open: false });
const isBlank = (r: Row) => r.kind === "step" && !r.text.trim() && !r.heat && !r.photo;

function toRow(line: string): Row {
  const section = sectionName(line);
  if (section) return { key: nextKey++, kind: "section", name: section, raw: line };
  return { key: nextKey++, kind: "step", ...splitStep(line), open: false, raw: line };
}

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
      if (r.raw !== undefined) return r.raw;
      if (r.kind === "section") return r.name.trim() ? `${r.name.trim().replace(/:+$/, "")}:` : "";
      // Newlines would split the step in two when saved.
      return joinStep({ text: r.text.replace(/\s*\n\s*/g, " "), heat: r.heat, photo: r.photo });
    })
    .filter(Boolean)
    .join("\n");
}

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

export function StepFields({
  value,
  onChange,
  userId,
  focusStep,
  insertAfter,
  onBusy,
}: {
  value: string;
  onChange: (text: string) => void;
  userId: string;
  /** Step number (0-based, sections not counted) to put the cursor in when it opens. */
  focusStep?: number;
  /** Open with a new blank step after this step number (-1: first), cursor in it. */
  insertAfter?: number;
  /** True while a photo is uploading, so the form can hold off saving. */
  onBusy?: (busy: boolean) => void;
}) {
  const inserted = useRef<number | null>(null);
  const [rows, setRows] = useState<Row[]>(() => {
    const out = toRows(value);
    if (insertAfter === undefined) return out;
    const steps = out.filter((r) => r.kind === "step" && r !== out[out.length - 1]);
    const at = insertAfter < 0 ? 0 : steps[insertAfter] ? out.indexOf(steps[insertAfter]) + 1 : out.length - 1;
    // At the end, the blank row that's always waiting there is the new step.
    if (at >= out.length - 1) {
      inserted.current = out[out.length - 1].key;
      return out;
    }
    const row = blank();
    inserted.current = row.key;
    return [...out.slice(0, at), row, ...out.slice(at)];
  });
  const [uploading, setUploading] = useState<number[]>([]);
  const [photoError, setPhotoError] = useState<number | null>(null);
  const emitted = useRef(value);
  const list = useRef<HTMLOListElement>(null);
  const focusNext = useRef<{ key: number; field: string } | null>(null);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setRows(toRows(value));
  }, [value]);

  useEffect(() => onBusy?.(uploading.length > 0), [uploading.length, onBusy]);

  // Opened from a step card: straight to that step, or to the new one.
  useEffect(() => {
    const key = inserted.current ?? (focusStep !== undefined ? rows.filter((r) => r.kind === "step")[focusStep]?.key : undefined);
    if (key === undefined) return;
    const el = list.current?.querySelector<HTMLTextAreaElement>(`[data-row="${key}"] textarea`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    list.current?.querySelectorAll("textarea").forEach(grow);
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

  // Functional, because a photo finishes uploading while people keep typing.
  function patch(key: number, p: Partial<StepRow> | { name: string }) {
    setRows((prev) => {
      const next = withTail(prev.map((r) => (r.key === key ? ({ ...r, ...p, raw: undefined } as Row) : r)));
      const text = toText(next);
      emitted.current = text;
      onChange(text);
      return next;
    });
  }

  // Opening and closing the heat panel changes nothing that's saved.
  const setOpen = (key: number, open: boolean) =>
    setRows(rows.map((r) => (r.key === key && r.kind === "step" ? { ...r, open } : r)));

  const remove = (key: number) => commit(rows.filter((r) => r.key !== key));

  const sort = useDragSort(rows.length - 2, (from, to) => {
    focusNext.current = { key: rows[from].key, field: "handle" };
    commit(moveItem(rows, from, to));
  });

  function setHeat(key: number, heat: Heat | null) {
    patch(key, { heat, open: heat !== null });
  }

  function pickAppliance(key: number, current: Heat | null, a: Appliance) {
    if (current?.appliance !== a) setHeat(key, switchAppliance(current, a));
  }

  // Time a step while cooking it: Stop writes the time into the step.
  const watches = useStopwatches<number>();

  function timed(r: StepRow, ms: number) {
    const { time, unit } = watchTime(ms);
    if (r.heat) {
      patch(r.key, { heat: { ...r.heat, time, timeUnit: unit } });
    } else {
      // No heat and time on this step: the time goes in its words, "(12 min)", which
      // cook mode's timers and Cook together's plan read too. A second go replaces the first.
      const text = r.text.replace(/\s*\(\d+(?:[.,]\d+)?\s*(?:min|h)\)\s*$/, "").trim();
      patch(r.key, { text: `${text} (${time} ${unit})`.trim() });
    }
  }

  async function addPhoto(key: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setUploading((u) => [...u, key]);
    try {
      patch(key, { photo: await uploadPhoto(file, userId) });
    } catch {
      setPhotoError(key);
    } finally {
      setUploading((u) => u.filter((k) => k !== key));
    }
  }

  function addStep() {
    // The blank card at the end is the new step: put the cursor in it.
    const tail = rows[rows.length - 1];
    focusNext.current = { key: tail.key, field: "text" };
    setRows([...rows]);
  }

  function addSection() {
    const row: Row = { key: nextKey++, kind: "section", name: "" };
    const i = rows.length - 1;
    focusNext.current = { key: row.key, field: "name" };
    commit([...rows.slice(0, i), row, ...rows.slice(i)]);
  }

  /** Enter ends the step (a step is one line) and moves on to the next one. */
  function onEnter(e: React.KeyboardEvent, key: number) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.key === key);
    const after = rows[i + 1];
    if (after) {
      focusNext.current = { key: after.key, field: after.kind === "step" ? "text" : "name" };
      setRows([...rows]);
    }
  }

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
  let n = 0;

  return (
    <div className="rows">
      <ol className="step-rows" ref={list} data-sorting={sort.dragging !== null || undefined}>
        {rows.map((r, i) => {
          const isLast = r.key === last;
          const handle = !isLast && (
            <button type="button" className="handle" data-field="handle" aria-label={`Move ${r.kind === "section" ? "section" : `step ${n + 1}`}. Drag, or use the arrow keys`} {...sort.handleProps(i)}>
              {r.kind === "step" && <span className="num">{n + 1}</span>}
              <Grip size={16} />
            </button>
          );

          if (r.kind === "section") {
            return (
              <li key={r.key} className="step-row sec" data-row={r.key} data-held={sort.dragging === i || undefined} style={sort.rowStyle(i)}>
                {handle}
                <input
                  className="input"
                  data-field="name"
                  value={r.name}
                  placeholder="Section, like Sauce"
                  aria-label="Section name"
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                  onKeyDown={(e) => onEnter(e, r.key)}
                  enterKeyHint="next"
                />
                <button type="button" className="row-x" aria-label="Remove section" onClick={() => remove(r.key)}>
                  <Close size={16} />
                </button>
              </li>
            );
          }

          const num = ++n;
          const busy = uploading.includes(r.key);
          return (
            <li key={r.key} className="step-row" data-row={r.key} data-tail={isLast || undefined} data-held={sort.dragging === i || undefined} style={sort.rowStyle(i)}>
              {handle || <span className="handle" aria-hidden="true"><Plus size={16} /></span>}
              <div className="step-main">
                <textarea
                  className="textarea"
                  data-field="text"
                  rows={1}
                  value={r.text}
                  placeholder={num === 1 && isLast ? "Get the pan properly hot" : isLast ? "Add a step" : r.key === inserted.current ? "New step" : ""}
                  aria-label={`Step ${num}`}
                  onChange={(e) => {
                    patch(r.key, { text: e.target.value });
                    grow(e.target);
                  }}
                  onKeyDown={(e) => onEnter(e, r.key)}
                  onPaste={(e) => onPaste(e, r.key)}
                  enterKeyHint="next"
                />

                {(r.photo || busy) && (
                  <div className="step-photo">
                    {r.photo && <img src={photoUrl(r.photo) ?? ""} alt="" />}
                    {busy && <span className="busy">Adding photo</span>}
                    {r.photo && !busy && (
                      <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => patch(r.key, { photo: null })}>
                        <Close size={16} />
                      </button>
                    )}
                  </div>
                )}

                {(r.open || r.heat) && (
                  <HeatPanel
                    heat={r.heat}
                    onAppliance={(a) => pickAppliance(r.key, r.heat, a)}
                    onChange={(h) => setHeat(r.key, h)}
                    onClose={() => (r.heat ? setHeat(r.key, null) : setOpen(r.key, false))}
                  />
                )}

                {!isLast && (
                  <div className="step-tools">
                    {!r.open && !r.heat && (
                      <button type="button" className="add-heat" onClick={() => setOpen(r.key, true)}>
                        <Flame size={15} /> Heat &amp; time
                      </button>
                    )}
                    {!r.photo && !busy && (
                      <label className="add-heat">
                        <Camera size={15} /> Photo
                        <input type="file" accept="image/*" hidden onChange={(e) => addPhoto(r.key, e)} />
                      </label>
                    )}
                    <StopwatchControl
                      running={watches.isRunning(r.key)}
                      elapsed={watches.elapsed(r.key)}
                      onStart={() => watches.start(r.key)}
                      onStop={() => timed(r, watches.stop(r.key))}
                      onCancel={() => watches.cancel(r.key)}
                    />
                  </div>
                )}
                {photoError === r.key && <p className="error">That photo didn&rsquo;t upload. Try another.</p>}
              </div>
              {isLast ? (
                <span />
              ) : (
                <button type="button" className="row-x" aria-label={`Remove step ${num}`} onClick={() => remove(r.key)}>
                  <Close size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="row-adds">
        <button type="button" className="text-btn add-sec" onClick={addStep}>
          <Plus size={16} /> Step
        </button>
        <button type="button" className="text-btn add-sec" onClick={addSection}>
          <Plus size={16} /> Section
        </button>
      </div>
    </div>
  );
}

/** Appliance, heat, oven mode and time for one step. Shared with cook mode's single-step editor. */
export function HeatPanel({
  heat,
  onAppliance,
  onChange,
  onClose,
}: {
  heat: Heat | null;
  onAppliance: (a: Appliance) => void;
  onChange: (h: Heat) => void;
  onClose: () => void;
}) {
  const info = heat ? applianceInfo(heat.appliance) : null;
  const set = (p: Partial<Heat>) => heat && onChange({ ...heat, ...p });

  return (
    <div className="heat-panel">
      <div className="heat-top">
        <div className="appliances" role="radiogroup" aria-label="Appliance">
          {APPLIANCES.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={heat?.appliance === a.id} className="chip" onClick={() => onAppliance(a.id)}>
              <ApplianceIcon appliance={a.id} size={15} />
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="row-x" aria-label={heat ? "Remove heat and time" : "Close"} onClick={onClose}>
          <Close size={16} />
        </button>
      </div>

      {heat && info && (
        <div className="heat-fields">
          {info.levels ? (
            <label className="hf">
              <span>Heat</span>
              <select className="input" value={heat.heat} onChange={(e) => set({ heat: e.target.value })}>
                <option value="">–</option>
                {info.levels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="hf">
              <span>Heat</span>
              <span className="suffixed">
                <input
                  className="input"
                  value={heat.heat}
                  inputMode="decimal"
                  placeholder={heat.appliance === "sousvide" ? "56" : "200"}
                  onChange={(e) => set({ heat: e.target.value.replace(/[^\d.,]/g, "") })}
                  autoComplete="off"
                />
                <i>°C</i>
              </span>
            </label>
          )}

          {heat.appliance === "oven" && (
            <label className="hf">
              <span>Mode</span>
              <select className="input" value={heat.mode} onChange={(e) => set({ mode: e.target.value })}>
                <option value="">–</option>
                {OVEN_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          )}

          <label className="hf">
            <span>Time</span>
            <span className="time-pair">
              <input
                className="input"
                value={heat.time}
                inputMode="decimal"
                placeholder={heat.timeUnit === "h" ? "2" : "25"}
                onChange={(e) => set({ time: e.target.value.replace(/[^\d.,\-–]/g, "") })}
                autoComplete="off"
              />
              <select className="input" value={heat.timeUnit} aria-label="Time unit" onChange={(e) => set({ timeUnit: e.target.value as Heat["timeUnit"] })}>
                <option value="min">min</option>
                <option value="h">h</option>
              </select>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
