"use client";
import "@/app/styles/recipe.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EditSheet, type Editing } from "@/components/EditSheet";
import { Basket, Bowl, Check, Clock, Close, Pencil, Play, Pot, Reorder } from "@/components/icons";
import { HeatChip } from "@/components/HeatChip";
import { Ingredients, SkippedNote, useSkipped, useTicked } from "@/components/RecipeBits";
import { FACTORS, factorLabel, factorQuery, parseFactor, scaledServes } from "@/components/scale";
import { StepUses } from "@/components/StepText";
import { StepTimerCard, useStepTimers } from "@/components/StepTimers";
import { StepTools } from "@/components/StepTools";
import { photoUrl } from "@/lib/config";
import { hasHeat, splitStep } from "@/lib/step";
import { ingredientList, sectionize, type Ingredient } from "@/lib/recipe";
import { addToList, onListChange, readList, removeFromList } from "@/lib/shopping";
import type { Recipe } from "@/lib/types";

type Props = {
  recipe: Pick<Recipe, "id" | "ingredients" | "steps" | "notes" | "serves" | "time">;
  initialFactor: number;
  /** Times it's in the cook log; links down to it. */
  cooked?: number;
  /** The author can change ingredients and steps right here. */
  canEdit?: boolean;
  meId?: string;
  /** "Cook together…", under Start cooking. */
  together?: React.ReactNode;
  /** The cook log, shown in the Cooked tab. */
  cookedPanel?: React.ReactNode;
  /** "Pairs well with", above the tabs. */
  pairings?: React.ReactNode;
};

type Tab = "ingredients" | "method" | "cooked";

/** Everything on the recipe page that moves with the scale: facts, ingredients, method. */
export function RecipeView({ recipe: r, initialFactor, cooked = 0, canEdit = false, meId = "", together, cookedPanel, pairings }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  // The step tools: hidden until "Edit" by the Method heading.
  const [tools, setTools] = useState(false);
  const [factor, setFactor] = useState(initialFactor);
  const list = useMemo(() => ingredientList(r.ingredients), [r.ingredients]);
  const scalable = list.some((i) => i.amount.qty !== null);
  const [skipped, toggleSkip, clearSkipped] = useSkipped(r.id);

  // Ingredients, Method and Cooked as tabs; the open one lives in the URL's #hash.
  const tabs = [
    list.length > 0 && { id: "ingredients" as const, label: "Ingredients", count: list.length },
    r.steps.length > 0 && { id: "method" as const, label: "Method", count: sectionize(r.steps, (t) => t).reduce((n, s) => n + s.items.length, 0) },
    cookedPanel && { id: "cooked" as const, label: "Cooked", count: cooked },
  ].filter((t) => !!t);
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "ingredients");

  useEffect(() => {
    const h = location.hash.slice(1);
    if (h === "ingredients" || h === "method" || h === "cooked") setTab(h);
  }, []);

  function pick(t: Tab, scroll = false) {
    setTab(t);
    history.replaceState(history.state, "", `${location.pathname}${location.search}#${t}`);
    if (scroll) document.querySelector(".recipe-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Offline, the service worker serves the page cached without its query, so the server's
  // idea of the scale can be stale. The URL is the truth.
  useEffect(() => {
    const x = parseFactor(new URLSearchParams(location.search).get("x") ?? undefined);
    if (x !== initialFactor) setFactor(x);
  }, [initialFactor]);

  function scale(f: number) {
    setFactor(f);
    // Kept in the URL so a refresh, or the jump into cook mode, keeps the scale.
    const u = new URL(location.href);
    if (f === 1) u.searchParams.delete("x");
    else u.searchParams.set("x", String(f));
    history.replaceState(history.state, "", u);
  }

  return (
    <>
      {(r.serves || r.time || cooked > 0) && (
        <div className="facts">
          {r.serves && (
            <span className="fact" data-scaled={factor !== 1 || undefined}>
              <Bowl size={16} /> Serves {scaledServes(r.serves, factor)}
            </span>
          )}
          {r.time && (
            <span className="fact">
              <Clock size={16} /> {r.time}
            </span>
          )}
          {cooked > 0 && cookedPanel && (
            <button type="button" className="fact" onClick={() => pick("cooked", true)}>
              <Pot size={16} /> Cooked {cooked}×
            </button>
          )}
        </div>
      )}

      {r.steps.length > 0 && (
        <Link href={`/r/${r.id}/cook${factorQuery(factor)}`} className="btn accent block start-cooking">
          <Play size={20} /> Start cooking
        </Link>
      )}
      {together}

      {r.notes && (
        <section className="section">
          <p className="notes">{r.notes}</p>
        </section>
      )}

      {pairings}

      {tabs.length > 0 && (
        <div className="recipe-tabs" role="tablist" aria-label="Recipe">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => pick(t.id)}
            >
              {t.label}
              {t.count > 0 && <span className="n">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "ingredients" && list.length > 0 && (
        <section className="tab-panel" role="tabpanel" id="panel-ingredients" aria-labelledby="tab-ingredients">
          <div className="panel-head">
            {scalable ? <Scale factor={factor} onChange={scale} /> : <span />}
            {canEdit && (
              <button type="button" className="head-edit" onClick={() => setEditing({ field: "ingredients" })}>
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
          <SkippedNote lines={r.ingredients} skipped={skipped} onReset={clearSkipped} />
          <Ingredients lines={r.ingredients} recipeId={r.id} factor={factor} skipped={skipped} onSkip={toggleSkip} />
          <ShoppingButton id={r.id} factor={factor} />
        </section>
      )}

      {tab === "method" && r.steps.length > 0 && (
        <section className="tab-panel" role="tabpanel" id="panel-method" aria-labelledby="tab-method">
          {canEdit && (
            <div className="panel-head end">
              {tools && (
                <button type="button" className="head-edit" onClick={() => setEditing({ field: "steps" })}>
                  <Reorder size={13} /> Reorder
                </button>
              )}
              <button type="button" className="head-edit" aria-pressed={tools} onClick={() => setTools(!tools)}>
                <Pencil size={13} /> {tools ? "Done" : "Edit"}
              </button>
            </div>
          )}
          <Steps
            recipeId={r.id}
            steps={r.steps}
            list={list}
            factor={factor}
            skipped={skipped}
            tools={tools}
            onTools={setTools}
            userId={meId}
            onEdit={setEditing}
          />
        </section>
      )}

      {tab === "cooked" && cookedPanel && (
        <section className="tab-panel" role="tabpanel" id="panel-cooked" aria-labelledby="tab-cooked">
          {cookedPanel}
        </section>
      )}

      {editing && (
        <EditSheet
          recipeId={r.id}
          meId={meId}
          editing={editing}
          initial={(editing.field === "steps" ? r.steps : r.ingredients).join("\n")}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Scale({ factor, onChange }: { factor: number; onChange: (f: number) => void }) {
  return (
    <div className="segmented scale" role="radiogroup" aria-label="Scale the recipe">
      {FACTORS.map((f) => (
        <label key={f}>
          <input type="radio" name="scale" value={f} checked={factor === f} onChange={() => onChange(f)} />
          {factorLabel(f)}
        </label>
      ))}
    </div>
  );
}

function ShoppingButton({ id, factor }: { id: string; factor: number }) {
  // The scale it's on the list at, or null when it isn't on the list.
  const [listed, setListed] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setListed(readList().recipes.find((x) => x.id === id)?.factor ?? null);
    sync();
    return onListChange(sync);
  }, [id]);

  if (listed === null) {
    return (
      <button type="button" className="btn ghost block list-btn" onClick={() => addToList(id, factor)}>
        <Basket size={20} /> Add to shopping list
      </button>
    );
  }
  return (
    <div className="on-list">
      <Link href="/list" className="btn ghost">
        <Check size={16} /> On your list
        {listed !== 1 && <span className="muted">· {factorLabel(listed)}</span>}
      </Link>
      {listed !== factor && (
        <button type="button" className="text-btn primary" onClick={() => addToList(id, factor)}>
          Make it {factorLabel(factor)}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="Take off the shopping list" onClick={() => removeFromList(id)}>
        <Close size={18} />
      </button>
    </div>
  );
}

function Steps({
  recipeId,
  steps,
  list,
  factor,
  skipped,
  tools,
  onTools,
  onEdit,
  userId,
}: {
  recipeId: string;
  steps: string[];
  list: Ingredient[];
  factor: number;
  skipped: number[];
  tools: boolean;
  onTools: (open: boolean) => void;
  onEdit: (e: Editing) => void;
  userId: string;
}) {
  const [done, toggle] = useTicked(`sauced:done:${recipeId}`);
  const timers = useStepTimers(recipeId);
  const sections = useMemo(() => sectionize(steps, (text, index) => ({ text, index })), [steps]);

  return sections.map((s, si) => (
    <div key={si} className="step-group">
      {s.name && <h3 className="sub-head">{s.name}</h3>}
      <ol className="steps">
        {s.items.map(({ text, index }) => {
          const isDone = done.includes(index);
          const { text: shown, heat, photo } = splitStep(text);
          return (
            // The whole step is a tap target; the number button is there for keyboards and screen readers.
            <li key={index} className="step" data-done={isDone || undefined} onClick={() => toggle(index)}>
              <button type="button" className="n" aria-pressed={isDone} aria-label={`Step ${index + 1}${isDone ? ", done" : ""}`}>
                {isDone ? <Check size={18} /> : index + 1}
              </button>
              <div>
                <p>{shown}</p>
                {hasHeat(heat) && <HeatChip heat={heat} />}
                <StepTimerCard step={index} heat={heat} text={shown} api={timers} />
                {photo && <img className="step-img" src={photoUrl(photo) ?? ""} alt="" loading="lazy" />}
                <StepUses text={shown} list={list} factor={factor} skipped={skipped} />
                {tools && (
                  <StepTools recipeId={recipeId} userId={userId} steps={steps} index={index} step={index} open onOpen={onTools} onEdit={onEdit} compact />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  ));
}
