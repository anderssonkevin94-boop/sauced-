"use client";
import { useEffect, useRef, useState } from "react";
import { ApplianceIcon } from "@/components/HeatChip";
import { Clock, Close } from "@/components/icons";
import { applianceInfo, heatMinutes, textMinutes, timeLabel, type Appliance, type Heat } from "@/lib/step";

// Timers that belong to steps: start one from a step with a time ("Oven · 25 min") and it
// lives on that step's card. Several can run at once (the oven and a pan). They keep going
// across steps and reloads (sessionStorage, per recipe), and when one is up it beeps, buzzes
// where phones allow it, and stays on its card until dismissed.

export type StepTimer = {
  /** When it ends; null while paused. */
  endsAt: number | null;
  /** Milliseconds left when paused. */
  left: number;
  /** The full length, for the progress bar. */
  total: number;
  label: string;
  /** Null for a time read from the step's words. */
  appliance: Appliance | null;
};

type Timers = Record<number, StepTimer>;

const key = (recipeId: string) => `sauced:timers:${recipeId}`;

export function useStepTimers(recipeId: string) {
  const [timers, setTimers] = useState<Timers>({});
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const rang = useRef(new Set<number>());

  useEffect(() => {
    try {
      setTimers(JSON.parse(sessionStorage.getItem(key(recipeId)) ?? "{}") as Timers);
    } catch {}
  }, [recipeId]);

  const running = Object.values(timers).some((t) => t.endsAt);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const leftOf = (t: StepTimer) => (t.endsAt ? Math.max(0, t.endsAt - now) : t.left);

  // Ring once for each timer that runs out.
  useEffect(() => {
    for (const [step, t] of Object.entries(timers)) {
      const n = Number(step);
      if (t.endsAt && t.endsAt <= now && !rang.current.has(n)) {
        rang.current.add(n);
        navigator.vibrate?.([400, 200, 400, 200, 400]);
        beep(audio.current);
      }
    }
  }, [timers, now]);

  function save(next: Timers) {
    setTimers(next);
    setNow(Date.now());
    try {
      if (Object.keys(next).length) sessionStorage.setItem(key(recipeId), JSON.stringify(next));
      else sessionStorage.removeItem(key(recipeId));
    } catch {}
  }

  // Sound has to be unlocked by a tap (iOS), so every button that starts a timer does it.
  function unlock() {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {}
  }

  /** From the step's heat-and-time tag, or else `minutes` read from its words. */
  function start(step: number, heat: Heat | null, minutes?: number | null) {
    const m = (heat ? heatMinutes(heat) : null) ?? minutes;
    if (!m) return;
    unlock();
    rang.current.delete(step);
    const total = m * 60_000;
    const label = heat && heatMinutes(heat) ? `${applianceInfo(heat.appliance).label} · ${timeLabel(heat)}` : `Timer · ${minutesLabel(m)}`;
    save({ ...timers, [step]: { endsAt: Date.now() + total, left: total, total, label, appliance: heat?.appliance ?? null } });
  }

  function pause(step: number) {
    const t = timers[step];
    if (t?.endsAt) save({ ...timers, [step]: { ...t, endsAt: null, left: Math.max(0, t.endsAt - Date.now()) } });
  }

  function resume(step: number) {
    const t = timers[step];
    if (!t || t.endsAt) return;
    unlock();
    save({ ...timers, [step]: { ...t, endsAt: Date.now() + t.left } });
  }

  function addMinute(step: number) {
    const t = timers[step];
    if (!t) return;
    unlock();
    rang.current.delete(step);
    const base = t.endsAt ? Math.max(Date.now(), t.endsAt) : null;
    save({
      ...timers,
      [step]: base ? { ...t, endsAt: base + 60_000, total: t.total + 60_000 } : { ...t, left: t.left + 60_000, total: t.total + 60_000 },
    });
  }

  function stop(step: number) {
    rang.current.delete(step);
    const next = { ...timers };
    delete next[step];
    save(next);
  }

  return { timers, leftOf, start, pause, resume, addMinute, stop };
}

export type TimersApi = ReturnType<typeof useStepTimers>;

function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const at = ctx.currentTime + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  } catch {}
}

/** 25 → "25 min", 90 → "1 h 30 min", 180 → "3 h". */
export function minutesLabel(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** How long a step's timer runs: its tag's time, or a time in its words. Null if neither. */
export function stepMinutes(heat: Heat | null, text: string): number | null {
  return (heat ? heatMinutes(heat) : null) ?? textMinutes(text);
}

export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * The timer on a step's card: a start button while there's none, then the countdown with
 * pause, +1 min and stop, and "Time's up" until dismissed. `size="lg"` for cook mode.
 */
export function StepTimerCard({
  step,
  heat,
  text,
  api,
  size = "sm",
}: {
  step: number;
  heat: Heat | null;
  /** The step's words, for a time written there ("simmer for 10 min"). */
  text: string;
  api: TimersApi;
  size?: "sm" | "lg";
}) {
  const t = api.timers[step];
  const minutes = stepMinutes(heat, text);
  if (!t && !minutes) return null;
  // Inside a tappable step on the recipe page: the timer's own taps shouldn't tick the step.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (!t) {
    return (
      <button
        type="button"
        className={`btn ghost timer-start ${size}`}
        onClick={(e) => {
          stop(e);
          api.start(step, heat, minutes);
        }}
      >
        <Clock size={size === "lg" ? 20 : 16} /> Start {minutesLabel(minutes!)} timer
      </button>
    );
  }

  const left = api.leftOf(t);
  const done = left === 0;
  const paused = !t.endsAt && !done;

  return (
    <div className={`step-timer ${size}`} data-done={done || undefined} data-paused={paused || undefined} role="timer" aria-live={done ? "assertive" : "off"} onClick={stop}>
      <div className="step-timer-top">
        <span className="step-timer-label">
          {t.appliance ? <ApplianceIcon appliance={t.appliance} size={size === "lg" ? 18 : 15} /> : <Clock size={size === "lg" ? 18 : 15} />}
          {done ? "Time's up" : paused ? "Paused" : t.label}
        </span>
        <button type="button" className="row-x" aria-label={done ? "Dismiss timer" : "Stop timer"} onClick={() => api.stop(step)}>
          <Close size={16} />
        </button>
      </div>
      <div className="step-timer-clock">{clock(left)}</div>
      <div className="step-timer-bar" aria-hidden="true">
        <i style={{ width: `${t.total ? (1 - left / t.total) * 100 : 100}%` }} />
      </div>
      <div className="step-timer-actions">
        {!done && (
          <button type="button" className="chip" onClick={() => (paused ? api.resume(step) : api.pause(step))}>
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button type="button" className="chip" onClick={() => api.addMinute(step)}>
          +1 min
        </button>
        {done && (
          <button type="button" className="chip" onClick={() => api.stop(step)}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/** Cook mode: timers running on other steps, as chips above the buttons. Tap one to go to its step. */
export function OtherTimers({
  api,
  current,
  onJump,
  labelFor = (step) => `Step ${step + 1}`,
}: {
  api: TimersApi;
  current: number | null;
  onJump: (step: number) => void;
  /** What to call a timer's step ("Step 3", or "Sauce · 3" when cooking together). */
  labelFor?: (step: number) => string;
}) {
  const others = Object.entries(api.timers)
    .map(([step, t]) => ({ step: Number(step), t }))
    .filter((x) => x.step !== current);
  if (!others.length) return null;
  return (
    <div className="other-timers" aria-label="Other timers">
      {others.map(({ step, t }) => {
        const left = api.leftOf(t);
        return (
          <button key={step} type="button" className="timer-pill" data-done={left === 0 || undefined} onClick={() => onJump(step)}>
            {t.appliance ? <ApplianceIcon appliance={t.appliance} size={16} /> : <Clock size={16} />}
            <b>{left === 0 ? "Time's up" : clock(left)}</b>
            <span className="muted">{labelFor(step)}</span>
          </button>
        );
      })}
    </div>
  );
}
