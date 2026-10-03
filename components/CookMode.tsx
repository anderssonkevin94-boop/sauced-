"use client";
import "@/app/styles/recipe.css";
import "@/app/styles/cook.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { EditSheet, type Editing } from "@/components/EditSheet";
import { Composer } from "@/components/CookLog";
import { OtherTimers, StepTimerCard, useStepTimers } from "@/components/StepTimers";
import { HeatChip } from "@/components/HeatChip";
import { Back, Check, Close, Pencil, Plus, Pot } from "@/components/icons";
import { Ingredients, SkippedNote, useSkipped, useWakeLock } from "@/components/RecipeBits";
import { factorLabel, factorQuery, parseFactor, scaledServes } from "@/components/scale";
import { StepUses } from "@/components/StepText";
import { StepCardEditor } from "@/components/StepCardEditor";
import { StepTools } from "@/components/StepTools";
import { photoUrl } from "@/lib/config";
import { ingredientList, sectionize } from "@/lib/recipe";
import { applianceInfo, hasHeat, heatMinutes, splitStep, type Step } from "@/lib/step";
import { localDay } from "@/lib/parse";
import type { Recipe } from "@/lib/types";

type Props = {
  recipe: Pick<Recipe, "id" | "title" | "ingredients" | "steps" | "serves">;
  initialFactor: number;
  initialScreen: number;
  /** The signed-in cook; logging and photo uploads go under their name. */
  meId: string;
  /** The recipe's author can change its steps and ingredients from here. */
  canEdit: boolean;
};

type Screen =
  | { kind: "ready" }
  | ({ kind: "step"; index: number; section: string | null } & Step)
  | { kind: "done" };

const Next = (p: SVGProps<SVGSVGElement>) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/** One thing at a time, big enough to read from the stove: get ready, each step, done. */
export function CookMode({ recipe: r, initialFactor, initialScreen, meId, canEdit }: Props) {
  const router = useRouter();
  const list = useMemo(() => ingredientList(r.ingredients), [r.ingredients]);
  const screens = useMemo(() => {
    const out: Screen[] = list.length ? [{ kind: "ready" }] : [];
    for (const s of sectionize(r.steps, (text, index) => ({ text, index })))
      for (const step of s.items) out.push({ kind: "step", index: step.index, section: s.name, ...splitStep(step.text) });
    out.push({ kind: "done" });
    return out;
  }, [list.length, r.steps]);
  const stepCount = screens.filter((s) => s.kind === "step").length;
  const last = screens.length - 1;
  // The first oven, air fryer or sous vide setting: worth turning on before anything else.
  const preheat = useMemo(() => {
    for (const s of screens) if (s.kind === "step" && s.heat?.heat && !applianceInfo(s.heat.appliance).levels) return { ...s.heat, time: "" };
    return null;
  }, [screens]);

  const [factor, setFactor] = useState(initialFactor);
  const [at, setAtRaw] = useState(Math.min(initialScreen, last));
  const [dir, setDir] = useState<"next" | "back" | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const recipeHref = `/r/${r.id}${factorQuery(factor)}`;
  // Steps can be removed while cooking, so never point past the end.
  const here = Math.min(at, last);
  const screen = screens[here];
  const timers = useStepTimers(r.id);
  const [skipped, toggleSkip, clearSkipped] = useSkipped(r.id);

  useWakeLock(true);

  const setAt = (n: number) => setAtRaw(Math.min(Math.max(n, 0), last));

  // Offline, the service worker serves this page cached without its query (?x=2&s=3), so the
  // server's scale and screen can be stale. The URL is the truth. Declared before the effect
  // below so it reads ?s before that one rewrites it.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setFactor(parseFactor(q.get("x") ?? undefined));
    const s = Math.floor(Number(q.get("s")));
    if (s > 0) setAtRaw(Math.min(s, last));
    // Only on arrival: a save's refresh puts back the URL cook mode was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(d: 1 | -1) {
    const n = Math.min(Math.max(here + d, 0), last);
    if (n === here) return;
    setDir(d > 0 ? "next" : "back");
    setAt(n);
  }

  // The screen lives in the URL (?s=3) so a reload lands where you were.
  useEffect(() => {
    const u = new URL(location.href);
    if (here) u.searchParams.set("s", String(here));
    else u.searchParams.delete("s");
    history.replaceState(history.state, "", u);
    body.current?.scrollTo(0, 0);
    // r.steps: a save from the editor refreshes the page, which drops ?s; put it back.
  }, [here, r.steps]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || inline || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") router.push(recipeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The edit tools under each card: hidden until "Edit", then kept open from card to card.
  const [tools, setTools] = useState(false);
  // Editing the step on screen, in place.
  const [inline, setInline] = useState(false);
  const editingHere = inline && screen.kind === "step";

  return (
    <main className="cook">
      <div className="cook-progress" aria-hidden="true">
        <i style={{ width: `${last ? (here / last) * 100 : 100}%` }} />
      </div>

      <header className="cook-top">
        <Link href={recipeHref} className="icon-btn" aria-label="Close cook mode">
          <Close />
        </Link>
        <span className="title">{r.title}</span>
        <span className="cook-top-end">
          <span className="count">{screen.kind === "step" ? `${screen.index + 1} of ${stepCount}` : ""}</span>
          {canEdit && screen.kind !== "done" && (
            <button type="button" className="icon-btn" aria-pressed={tools} aria-label={tools ? "Hide the edit tools" : "Edit this recipe"} onClick={() => setTools(!tools)}>
              <Pencil size={20} />
            </button>
          )}
        </span>
      </header>

      {editingHere ? (
        <StepCardEditor
          key={screen.index}
          recipeId={r.id}
          userId={meId}
          steps={r.steps}
          index={screen.index}
          stepCount={stepCount}
          onDone={() => setInline(false)}
        />
      ) : (
        <>
      <div
        ref={body}
        className="cook-body"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s || (e.target instanceof HTMLElement && e.target.closest("input, textarea, select"))) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          // Mostly sideways and far enough that it wasn't a scroll or a tap.
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div key={`${here}:${r.steps.length}`} className="cook-screen" data-dir={dir ?? undefined}>
          {screen.kind === "ready" && (
            <>
              <p className="eyebrow">Get ready</p>
              <h1 className="cook-h">Gather everything</h1>
              {(r.serves || factor !== 1) && (
                <p className="cook-sub">
                  {[factor !== 1 && factorLabel(factor), r.serves && `Serves ${scaledServes(r.serves, factor)}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {preheat && (
                <div className="preheat">
                  <p className="eyebrow">Turn on first</p>
                  <HeatChip heat={preheat} large />
                </div>
              )}
              <SkippedNote lines={r.ingredients} skipped={skipped} onReset={clearSkipped} />
              <Ingredients lines={r.ingredients} recipeId={r.id} factor={factor} skipped={skipped} onSkip={toggleSkip} />
              {canEdit &&
                (tools ? (
                  <div className="card-tools" role="group" aria-label="Change the recipe">
                    <button type="button" className="chip" onClick={() => setEditing({ field: "ingredients" })}>
                      <Pencil size={15} /> Edit ingredients
                    </button>
                    <button type="button" className="chip" onClick={() => setEditing({ field: "steps", insertAfter: -1 })}>
                      <Plus size={15} /> Step first
                    </button>
                    <button type="button" className="text-btn primary done" onClick={() => setTools(false)}>
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="card-tools closed">
                    <button type="button" className="card-edit" onClick={() => setTools(true)}>
                      <Pencil size={14} /> Edit
                    </button>
                  </div>
                ))}
            </>
          )}

          {screen.kind === "step" && (
            <>
              <p className="eyebrow cook-meta">
                Step {screen.index + 1} of {stepCount}
                {screen.section && <span className="sec">{screen.section}</span>}
              </p>
              <p className="cook-step">{screen.text}</p>
              {hasHeat(screen.heat) && (
                <div className="cook-heat">
                  <HeatChip heat={screen.heat} large />
                </div>
              )}
              {hasHeat(screen.heat) && heatMinutes(screen.heat) && <StepTimerCard step={screen.index} heat={screen.heat} api={timers} size="lg" />}
              {screen.photo && <img className="cook-photo" src={photoUrl(screen.photo) ?? ""} alt="" />}
              <StepUses text={screen.text} list={list} factor={factor} heading="You'll need" skipped={skipped} />
              {canEdit && (
                <StepTools
                  recipeId={r.id}
                  userId={meId}
                  steps={r.steps}
                  index={screen.index}
                  step={stepNumber(screens, here)}
                  open={tools}
                  onOpen={setTools}
                  onEdit={setEditing}
                  onEditHere={() => setInline(true)}
                />
              )}
            </>
          )}

          {screen.kind === "done" && (
            <div className="cook-done">
              <h1 className="cook-h">That&rsquo;s it. Enjoy.</h1>
              <p className="cook-sub">{r.title}</p>
              {logged ? (
                <p className="cook-logged">
                  <Check size={18} /> In the cook log
                </p>
              ) : logging ? (
                <div className="cook-composer">
                  <Composer
                    recipeId={r.id}
                    meId={meId}
                    today={localDay()}
                    autoFocus={false}
                    onDone={() => {
                      setLogging(false);
                      setLogged(true);
                    }}
                  />
                </div>
              ) : (
                <button type="button" className="btn ghost cook-log-btn" onClick={() => setLogging(true)}>
                  <Pot size={20} /> Log that you cooked it
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <OtherTimers
        api={timers}
        current={screen.kind === "step" ? screen.index : null}
        onJump={(step) => {
          const i = screens.findIndex((s) => s.kind === "step" && s.index === step);
          if (i >= 0) setAt(i);
        }}
      />

      <nav className="cook-nav" aria-label="Steps">
        <button type="button" className="btn ghost" onClick={() => go(-1)} disabled={here === 0}>
          <Back /> Back
        </button>
        {screen.kind === "done" ? (
          <Link href={recipeHref} className="btn accent">
            Back to the recipe
          </Link>
        ) : (
          <button type="button" className="btn accent" onClick={() => go(1)}>
            {screen.kind === "ready" ? "Let’s cook" : here === last - 1 ? "Finish" : "Next"} <Next />
          </button>
        )}
      </nav>
        </>
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
    </main>
  );
}

/** Which step (0-based, sections not counted) a screen shows. */
function stepNumber(screens: Screen[], at: number): number {
  return screens.slice(0, at).filter((s) => s.kind === "step").length;
}
