"use client";
import type { ReactNode } from "react";
import { TimerChip, timerLabel } from "@/components/Timers";
import { findTimers, ingredientsInStep, splitIngredient, type Ingredient } from "@/lib/recipe";

/** Step text with its durations turned into timer chips. `timerKey` is shared with cook mode so a running timer shows in both. */
export function StepText({ text, timerKey }: { text: string; timerKey: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  findTimers(text).forEach((m, i) => {
    if (m.start > at) parts.push(text.slice(at, m.start));
    parts.push(<TimerChip key={i} timerKey={`${timerKey}:${i}`} label={timerLabel(text, m)} seconds={m.seconds} text={m.label} />);
    at = m.end;
  });
  parts.push(text.slice(at));
  return parts;
}

/** Small chips of the ingredients a step mentions, with their scaled amounts. */
export function StepUses({ text, list, factor, heading }: { text: string; list: Ingredient[]; factor: number; heading?: string }) {
  const used = ingredientsInStep(text, list);
  if (!used.length) return null;
  return (
    <div className="uses">
      {heading && <p className="eyebrow">{heading}</p>}
      <ul aria-label={heading ?? "Ingredients in this step"}>
        {used.map((i) => {
          const { amount, rest } = splitIngredient(list[i].text, factor);
          return (
            <li key={i}>
              {amount && <b>{amount}</b>} {rest.split(",")[0].trim() || rest}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
