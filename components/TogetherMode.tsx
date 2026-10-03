"use client";
import "@/app/styles/recipe.css";
import "@/app/styles/cook.css";
import "@/app/styles/together.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type SVGProps } from "react";
import { HeatChip } from "@/components/HeatChip";
import { Back, Check, Close, Pot } from "@/components/icons";
import { Ingredients, SkippedNote, useSkipped, useWakeLock } from "@/components/RecipeBits";
import { FACTORS, factorLabel, scaledServes } from "@/components/scale";
import { StepUses } from "@/components/StepText";
import { OtherTimers, StepTimerCard, useStepTimers } from "@/components/StepTimers";
import { logCooked } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { localDay } from "@/lib/parse";
import { combineIngredients, ingredientList, type Ingredient } from "@/lib/recipe";
import { applianceInfo, hasHeat, heatLabel, type Heat } from "@/lib/step";
import { durationLabel, planTogether, type PlannedStep } from "@/lib/together";
import type { Recipe } from "@/lib/types";

type R = Pick<Recipe, "id" | "title" | "ingredients" | "steps" | "serves" | "time">;

type Screen = { kind: "plan" } | { kind: "gather" } | { kind: "step"; s: PlannedStep; n: number } | { kind: "done" };

const Next = (p: SVGProps<SVGSVGElement>) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/** A timer's key: recipe and step in one number, so one timer list covers every recipe. */
const timerKey = (s: Pick<PlannedStep, "r" | "index">) => s.r * 1000 + s.index;

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Several recipes at once: a plan (who starts when, so all are ready together), one place
 * to gather everything, then every recipe's steps in the order to do them.
 */
export function TogetherMode({ recipes, initialFactors }: { recipes: R[]; initialFactors: number[] }) {
  const router = useRouter();
  const ids = recipes.map((r) => r.id).join(",");
  const plan = useMemo(() => planTogether(recipes), [recipes]);
  const lists = useMemo(() => recipes.map((r) => ingredientList(r.ingredients)), [recipes]);
  // One clearly different colour per recipe in this cook.
  const colors = recipes.map((_, i) => PALETTE[i % PALETTE.length]);

  const screens = useMemo<Screen[]>(
    () => [{ kind: "plan" }, { kind: "gather" }, ...plan.steps.map((s, n) => ({ kind: "step" as const, s, n })), { kind: "done" }],
    [plan],
  );
  const last = screens.length - 1;

  const [factors, setFactors] = useState(initialFactors);
  const [at, setAtRaw] = useState(0);
  const [dir, setDir] = useState<"next" | "back" | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const timers = useStepTimers(`together:${ids}`);
  const here = Math.min(at, last);
  const screen = screens[here];
  const startKey = `sauced:together-start:${ids}`;

  useWakeLock(true);

  // Where you were (?s=) and when you started, back after a reload.
  useEffect(() => {
    const s = Math.floor(Number(new URLSearchParams(location.search).get("s")));
    if (s > 0) setAtRaw(Math.min(s, last));
    try {
      const t = Number(sessionStorage.getItem(startKey));
      if (t > 0) setStartedAt(t);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = new URL(location.href);
    if (here) u.searchParams.set("s", String(here));
    else u.searchParams.delete("s");
    u.searchParams.set("x", factors.join(","));
    history.replaceState(history.state, "", u);
    body.current?.scrollTo(0, 0);
    // recipes: a save's refresh puts back the URL this page was opened with; write ours again.
  }, [here, factors, recipes]);

  function setAt(n: number) {
    setAtRaw(Math.min(Math.max(n, 0), last));
  }

  function go(d: 1 | -1) {
    const n = Math.min(Math.max(here + d, 0), last);
    if (n === here) return;
    // Leaving "Gather everything" is the start of the cook: the plan's clock starts now.
    if (screen.kind === "gather" && d > 0 && !startedAt) {
      const t = Date.now();
      setStartedAt(t);
      try {
        sessionStorage.setItem(startKey, String(t));
      } catch {}
    }
    setDir(d > 0 ? "next" : "back");
    setAt(n);
  }

  function restartClock() {
    setStartedAt(null);
    try {
      sessionStorage.removeItem(startKey);
    } catch {}
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") router.push(`/r/${recipes[0].id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Minutes into the cook → a clock time once started ("at 18:25"), or "after 1 h 38 min" before. */
  const when = (min: number) =>
    startedAt ? `at ${hhmm(startedAt + min * 60_000)}` : min < 0.5 ? "right away" : `after ${durationLabel(min)}`;
  /** For a step's heading: "At 18:25", or "48 min in" before the clock starts. */
  const stepWhen = (min: number) =>
    min < 0.5 ? "First" : startedAt ? `At ${hhmm(startedAt + min * 60_000)}` : `${durationLabel(min)} in`;

  const stepCountDone = screen.kind === "step" ? screen.n + 1 : 0;
  const labelFor = (key: number) => {
    const r = Math.floor(key / 1000);
    return `${short(recipes[r]?.title ?? "")} · ${(key % 1000) + 1}`;
  };

  return (
    <main className="cook together">
      <div className="cook-progress" aria-hidden="true">
        <i style={{ width: `${last ? (here / last) * 100 : 100}%` }} />
      </div>

      <header className="cook-top">
        <Link href={`/r/${recipes[0].id}`} className="icon-btn" aria-label="Stop cooking together">
          <Close />
        </Link>
        <span className="title">Cooking {recipes.length} recipes</span>
        <span className="count">{screen.kind === "step" ? `${stepCountDone} of ${plan.steps.length}` : ""}</span>
      </header>

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
          if (!s || (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, .segmented"))) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div key={here} className="cook-screen" data-dir={dir ?? undefined}>
          {screen.kind === "plan" && (
            <>
              <p className="eyebrow">Cook together</p>
              <h1 className="cook-h">All ready in {durationLabel(plan.total)}</h1>
              <p className="cook-sub">Start each one when it says, and they&rsquo;ll finish together.</p>
              <ol className="together-plan">
                {plan.recipes.map((p, i) => (
                  <li key={p.id}>
                    <span className="rdot lg" style={{ background: colors[i] }} aria-hidden="true" />
                    <div className="text">
                      <b>{p.title}</b>
                      <span className="muted">
                        {durationLabel(p.total)} · {p.stepCount} {p.stepCount === 1 ? "step" : "steps"}
                      </span>
                    </div>
                    <span className="start" suppressHydrationWarning>
                      {p.startAt < 0.5 ? "Start first" : `Start ${when(p.startAt)}`}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="together-note">
                Times come from the steps that have them, and the recipe&rsquo;s own time for the rest. The clock starts when you start cooking.
                {startedAt && (
                  <>
                    {" "}
                    <button type="button" className="text-btn primary" onClick={restartClock}>
                      Restart the clock
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          {screen.kind === "gather" && (
            <Gather
              recipes={recipes}
              colors={colors}
              factors={factors}
              onFactor={(i, f) => setFactors((p) => p.map((x, j) => (j === i ? f : x)))}
              preheats={preheats(plan.steps)}
              when={when}
            />
          )}

          {screen.kind === "step" && (
            <StepScreen
              s={screen.s}
              recipe={recipes[screen.s.r]}
              color={colors[screen.s.r]}
              count={plan.recipes[screen.s.r].stepCount}
              list={lists[screen.s.r]}
              factor={factors[screen.s.r]}
              timers={timers}
              when={stepWhen}
              next={plan.steps[screen.n + 1]}
              nextTitle={plan.steps[screen.n + 1] && plan.steps[screen.n + 1].r !== screen.s.r ? recipes[plan.steps[screen.n + 1].r].title : ""}
            />
          )}

          {screen.kind === "done" && <Done recipes={recipes} />}
        </div>
      </div>

      <OtherTimers
        api={timers}
        current={screen.kind === "step" ? timerKey(screen.s) : null}
        labelFor={labelFor}
        onJump={(key) => {
          const i = screens.findIndex((x) => x.kind === "step" && timerKey(x.s) === key);
          if (i >= 0) setAt(i);
        }}
      />

      <nav className="cook-nav" aria-label="Steps">
        <button type="button" className="btn ghost" onClick={() => go(-1)} disabled={here === 0}>
          <Back /> Back
        </button>
        {screen.kind === "done" ? (
          <Link href={`/r/${recipes[0].id}`} className="btn accent">
            Back to the recipe
          </Link>
        ) : (
          <button type="button" className="btn accent" onClick={() => go(1)}>
            {screen.kind === "plan" ? "Gather" : screen.kind === "gather" ? "Let’s cook" : here === last - 1 ? "Finish" : "Next"} <Next />
          </button>
        )}
      </nav>
    </main>
  );
}

const PALETTE = ["#E0533A", "#3F8CB5", "#5E9C61", "#D19A2E", "#9B6BC0", "#C0577F"];

const short = (title: string) => (title.length > 14 ? `${title.slice(0, 13)}…` : title);

/** The first oven, air fryer or sous vide of each recipe, and when it's needed. */
function preheats(steps: PlannedStep[]): { r: number; heat: Heat; at: number }[] {
  const seen = new Set<string>();
  const out: { r: number; heat: Heat; at: number }[] = [];
  for (const s of steps) {
    if (!s.heat?.heat || applianceInfo(s.heat.appliance).levels) continue;
    const k = `${s.heat.appliance}|${s.heat.heat}|${s.heat.mode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ r: s.r, heat: { ...s.heat, time: "" }, at: s.at });
  }
  return out;
}

function Gather({
  recipes,
  colors,
  factors,
  onFactor,
  preheats,
  when,
}: {
  recipes: R[];
  colors: string[];
  factors: number[];
  onFactor: (i: number, f: number) => void;
  preheats: { r: number; heat: Heat; at: number }[];
  when: (min: number) => string;
}) {
  const [all, setAll] = useState(false);
  const combined = useMemo(
    () => combineIngredients(recipes.map((r, i) => ({ title: r.title, ingredients: r.ingredients, factor: factors[i] }))),
    [recipes, factors],
  );

  return (
    <>
      <p className="eyebrow">Get ready</p>
      <h1 className="cook-h">Gather everything</h1>

      {preheats.length > 0 && (
        <div className="preheat">
          <p className="eyebrow">Turn on</p>
          <ul className="together-preheat">
            {preheats.map((p, i) => (
              <li key={i}>
                <HeatChip heat={p.heat} />
                <span className="muted" suppressHydrationWarning>
                  {p.at < 0.5 ? "first thing" : `needed ${when(p.at)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="segmented together-view" role="radiogroup" aria-label="Show ingredients">
        <label>
          <input type="radio" name="view" checked={!all} onChange={() => setAll(false)} />
          By recipe
        </label>
        <label>
          <input type="radio" name="view" checked={all} onChange={() => setAll(true)} />
          All together
        </label>
      </div>

      {all ? (
        <ul className="ingredients together-all">
          {combined.map((l) => (
            <li key={l.key}>
              <span className="line">
                {l.amount && <b>{l.amount}</b>} {l.name}
                {l.from.length > 1 && <span className="muted from"> · {l.from.length} recipes</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        recipes.map((r, i) => <RecipeGather key={r.id} recipe={r} color={colors[i]} factor={factors[i]} onFactor={(f) => onFactor(i, f)} />)
      )}
    </>
  );
}

function RecipeGather({ recipe: r, color, factor, onFactor }: { recipe: R; color: string; factor: number; onFactor: (f: number) => void }) {
  const [skipped, toggle, clear] = useSkipped(r.id);
  return (
    <section className="together-recipe">
      <h2 className="together-title">
        <span className="rdot" style={{ background: color }} aria-hidden="true" />
        {r.title}
        {r.serves && <span className="muted serves">Serves {scaledServes(r.serves, factor)}</span>}
      </h2>
      <div className="segmented scale" role="radiogroup" aria-label={`Scale ${r.title}`}>
        {FACTORS.map((f) => (
          <label key={f}>
            <input type="radio" name={`scale-${r.id}`} checked={factor === f} onChange={() => onFactor(f)} />
            {factorLabel(f)}
          </label>
        ))}
      </div>
      <SkippedNote lines={r.ingredients} skipped={skipped} onReset={clear} />
      <Ingredients lines={r.ingredients} recipeId={r.id} factor={factor} skipped={skipped} onSkip={toggle} />
    </section>
  );
}

function StepScreen({
  s,
  recipe,
  color,
  count,
  list,
  factor,
  timers,
  when,
  next,
  nextTitle,
}: {
  s: PlannedStep;
  recipe: R;
  color: string;
  count: number;
  list: Ingredient[];
  factor: number;
  timers: ReturnType<typeof useStepTimers>;
  when: (min: number) => string;
  next: PlannedStep | undefined;
  nextTitle: string;
}) {
  const [skipped] = useSkipped(recipe.id);
  // How long until the next thing starts (long while the sous vide does its 2 hours).
  const wait = next ? next.at - s.at : 0;

  return (
    <>
      <p className="together-recipe-tag">
        <span className="rdot" style={{ background: color }} aria-hidden="true" />
        <b>{recipe.title}</b>
        <span className="muted">
          Step {s.index + 1} of {count}
        </span>
      </p>
      <p className="eyebrow cook-meta" suppressHydrationWarning>
        {when(s.at)}
        {s.section && <span className="sec">{s.section}</span>}
      </p>
      <p className="cook-step">{s.text}</p>
      {hasHeat(s.heat) && (
        <div className="cook-heat">
          <HeatChip heat={s.heat} large />
        </div>
      )}
      <StepTimerCard step={timerKey(s)} heat={s.heat} text={s.text} api={timers} size="lg" />
      {s.photo && <img className="cook-photo" src={photoUrl(s.photo) ?? ""} alt="" />}
      <StepUses text={s.text} list={list} factor={factor} heading="You'll need" skipped={skipped} />

      {next && (
        <p className="together-next" suppressHydrationWarning>
          {wait >= 5 ? (
            <>
              Next, in <b>{durationLabel(wait)}</b>: {nextTitle ? <><b>{nextTitle}</b>, </> : null}
              {next.text}
            </>
          ) : (
            <>
              Next: {nextTitle ? <><b>{nextTitle}</b>, </> : null}{next.text}
              {next.heat && hasHeat(next.heat) && <span className="muted"> ({heatLabel(next.heat) || applianceInfo(next.heat.appliance).label})</span>}
            </>
          )}
        </p>
      )}
    </>
  );
}

function Done({ recipes }: { recipes: R[] }) {
  const [pending, start] = useTransition();
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState("");

  function logAll() {
    setError("");
    start(async () => {
      const day = localDay();
      for (const r of recipes) {
        const res = await logCooked(r.id, day);
        if (res.error) return setError(res.error);
      }
      setLogged(true);
    });
  }

  return (
    <div className="cook-done">
      <h1 className="cook-h">All ready. Enjoy.</h1>
      <p className="cook-sub">{recipes.map((r) => r.title).join(" · ")}</p>
      {logged ? (
        <p className="cook-logged">
          <Check size={18} /> All {recipes.length} in the cook log
        </p>
      ) : (
        <button type="button" className="btn ghost cook-log-btn" disabled={pending} onClick={logAll}>
          <Pot size={20} /> {pending ? "Logging" : `Log all ${recipes.length} as cooked`}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
