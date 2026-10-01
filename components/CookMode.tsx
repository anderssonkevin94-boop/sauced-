"use client";
import "@/app/styles/recipe.css";
import "@/app/styles/cook.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { Back, Close } from "@/components/icons";
import { Ingredients, useWakeLock } from "@/components/RecipeBits";
import { factorLabel, factorQuery, parseFactor, scaledServes } from "@/components/scale";
import { StepText, StepUses } from "@/components/StepText";
import { ingredientList, sectionize } from "@/lib/recipe";
import type { Recipe } from "@/lib/types";

type Props = {
  recipe: Pick<Recipe, "id" | "title" | "ingredients" | "steps" | "serves">;
  initialFactor: number;
  initialScreen: number;
};

type Screen =
  | { kind: "ready" }
  | { kind: "step"; text: string; index: number; section: string | null }
  | { kind: "done" };

const Next = (p: SVGProps<SVGSVGElement>) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/** One thing at a time, big enough to read from the stove: get ready, each step, done. */
export function CookMode({ recipe: r, initialFactor, initialScreen }: Props) {
  const router = useRouter();
  const list = useMemo(() => ingredientList(r.ingredients), [r.ingredients]);
  const screens = useMemo(() => {
    const out: Screen[] = list.length ? [{ kind: "ready" }] : [];
    for (const s of sectionize(r.steps, (text, index) => ({ text, index })))
      for (const step of s.items) out.push({ kind: "step", ...step, section: s.name });
    out.push({ kind: "done" });
    return out;
  }, [list.length, r.steps]);
  const stepCount = screens.filter((s) => s.kind === "step").length;
  const last = screens.length - 1;

  const [factor, setFactor] = useState(initialFactor);
  const [at, setAt] = useState(Math.min(initialScreen, last));
  const [dir, setDir] = useState<"next" | "back" | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const recipeHref = `/r/${r.id}${factorQuery(factor)}`;
  const screen = screens[at];

  useWakeLock(true);

  // Offline, the service worker serves this page cached without its query (?x=2&s=3), so the
  // server's scale and screen can be stale. The URL is the truth. Declared before the effect
  // below so it reads ?s before that one rewrites it.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setFactor(parseFactor(q.get("x") ?? undefined));
    const s = Math.floor(Number(q.get("s")));
    if (s > 0) setAt(Math.min(s, last));
  }, [last]);

  // Lets the app-wide timer dock sit above Back / Next.
  useEffect(() => {
    document.documentElement.dataset.cook = "";
    return () => void delete document.documentElement.dataset.cook;
  }, []);

  function go(d: 1 | -1) {
    const n = Math.min(Math.max(at + d, 0), last);
    if (n === at) return;
    setDir(d > 0 ? "next" : "back");
    setAt(n);
  }

  // The screen lives in the URL (?s=3) so a reload lands where you were.
  useEffect(() => {
    const u = new URL(location.href);
    if (at) u.searchParams.set("s", String(at));
    else u.searchParams.delete("s");
    history.replaceState(history.state, "", u);
    body.current?.scrollTo(0, 0);
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") router.push(recipeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="cook">
      <div className="cook-progress" aria-hidden="true">
        <i style={{ width: `${last ? (at / last) * 100 : 100}%` }} />
      </div>

      <header className="cook-top">
        <Link href={recipeHref} className="icon-btn" aria-label="Close cook mode">
          <Close />
        </Link>
        <span className="title">{r.title}</span>
        <span className="count">{screen.kind === "step" ? `${screen.index + 1} of ${stepCount}` : ""}</span>
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
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          // Mostly sideways and far enough that it wasn't a scroll or a tap.
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div key={at} className="cook-screen" data-dir={dir ?? undefined}>
          {screen.kind === "ready" && (
            <>
              <p className="eyebrow">Get ready</p>
              <h1 className="cook-h">Gather everything</h1>
              {(r.serves || factor !== 1) && (
                <p className="cook-sub">
                  {[factor !== 1 && factorLabel(factor), r.serves && `Serves ${scaledServes(r.serves, factor)}`].filter(Boolean).join(" · ")}
                </p>
              )}
              <Ingredients lines={r.ingredients} recipeId={r.id} factor={factor} />
            </>
          )}

          {screen.kind === "step" && (
            <>
              <p className="eyebrow cook-meta">
                Step {screen.index + 1} of {stepCount}
                {screen.section && <span className="sec">{screen.section}</span>}
              </p>
              <p className="cook-step">
                <StepText text={screen.text} timerKey={`${r.id}:${screen.index}`} />
              </p>
              <StepUses text={screen.text} list={list} factor={factor} heading="You'll need" />
            </>
          )}

          {screen.kind === "done" && (
            <div className="cook-done">
              <h1 className="cook-h">That&rsquo;s it. Enjoy.</h1>
              <p className="cook-sub">{r.title}</p>
            </div>
          )}
        </div>
      </div>

      <nav className="cook-nav" aria-label="Steps">
        <button type="button" className="btn ghost" onClick={() => go(-1)} disabled={at === 0}>
          <Back /> Back
        </button>
        {screen.kind === "done" ? (
          <Link href={recipeHref} className="btn accent">
            Back to the recipe
          </Link>
        ) : (
          <button type="button" className="btn accent" onClick={() => go(1)}>
            {screen.kind === "ready" ? "Let’s cook" : at === last - 1 ? "Finish" : "Next"} <Next />
          </button>
        )}
      </nav>
    </main>
  );
}
