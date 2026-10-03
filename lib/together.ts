// Cooking several recipes at once: when to start each so they're all ready together, and
// one stream of steps in the order to do them. Pure, so it can be tested under plain node.
//
// Each step takes its own time when it has one ("[Oven 200°C · 25 min]", or "for 25 minutes"
// in its words). The steps without
// a time share what's left of the recipe's overall time ("45 min"), or 3 minutes each when
// the recipe doesn't say. The longest recipe starts first; the others start later so that
// everything finishes at the same moment. Steps from all recipes are then put in order of
// when they should start.

import { sectionize } from "@/lib/recipe";
import { heatMinutes, splitStep, textMinutes, type Step } from "@/lib/step";

export type TogetherRecipe = { id: string; title: string; steps: string[]; time: string | null };

export type PlannedStep = Step & {
  /** Which recipe (index into the plan's recipes). */
  r: number;
  /** The step's index within its recipe (sectionize order). */
  index: number;
  section: string | null;
  /** Minutes from the start of the cook. */
  at: number;
  minutes: number;
  /** True when the time is the recipe's own, not a guess. */
  timed: boolean;
};

export type PlannedRecipe = { id: string; title: string; total: number; startAt: number; stepCount: number };

export type Plan = { recipes: PlannedRecipe[]; steps: PlannedStep[]; total: number };

const UNTIMED_STEP = 3;

/** "45 min" → 45, "1 h 30 min" → 90, "2.5 hr" → 150, "30-120 min" → 75 (middle of a range), "2 tim" → 120. */
export function parseMinutes(time: string | null): number | null {
  if (!time) return null;
  // "1 h 10 min (25 min hands-on)": the part in brackets isn't more time.
  const t = time.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/,/g, ".");
  let total = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(h|hr|hrs|hour|hours|tim|timme|timmar|t|m|min|mins|minute|minutes|minuter)?\b/g;
  for (const m of t.matchAll(re)) {
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    const n = (lo + hi) / 2;
    const unit = m[3] ?? "min";
    total += /^(h|hr|hrs|hour|hours|tim|timme|timmar|t)$/.test(unit) ? n * 60 : n;
    found = true;
  }
  return found && total > 0 ? Math.round(total) : null;
}

export function planTogether(recipes: TogetherRecipe[]): Plan {
  const perRecipe = recipes.map((rec, r) => {
    const steps: PlannedStep[] = [];
    for (const s of sectionize(rec.steps, (text, index) => ({ text, index })))
      for (const { text, index } of s.items) {
        const step = splitStep(text);
        // The step's tag first, then a time in its words ("simmer for 10 min").
        const own = (step.heat ? heatMinutes(step.heat) : null) ?? step.minutes ?? textMinutes(step.text);
        steps.push({ ...step, r, index, section: s.name, at: 0, minutes: own ?? 0, timed: own !== null });
      }
    const timedSum = steps.reduce((n, s) => n + (s.timed ? s.minutes : 0), 0);
    const untimed = steps.filter((s) => !s.timed);
    const overall = parseMinutes(rec.time);
    // The rest of the recipe's own time, shared out; never less than a few minutes a step.
    const each = untimed.length
      ? Math.max(UNTIMED_STEP, overall && overall > timedSum ? (overall - timedSum) / untimed.length : UNTIMED_STEP)
      : 0;
    let clock = 0;
    for (const s of steps) {
      if (!s.timed) s.minutes = Math.round(each * 10) / 10;
      s.at = clock;
      clock += s.minutes;
    }
    return { steps, total: Math.round(clock) };
  });

  const longest = Math.max(0, ...perRecipe.map((p) => p.total));
  const planned: PlannedRecipe[] = recipes.map((rec, r) => ({
    id: rec.id,
    title: rec.title,
    total: perRecipe[r].total,
    startAt: longest - perRecipe[r].total,
    stepCount: perRecipe[r].steps.length,
  }));

  const steps = perRecipe
    .flatMap((p, r) => p.steps.map((s) => ({ ...s, at: Math.round((s.at + planned[r].startAt) * 10) / 10 })))
    // In order of when they start; at the same moment, the recipe picked first goes first.
    .sort((a, b) => a.at - b.at || a.r - b.r || a.index - b.index);

  return { recipes: planned, steps, total: longest };
}

/** 95 → "1 h 35 min", 40 → "40 min". */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
