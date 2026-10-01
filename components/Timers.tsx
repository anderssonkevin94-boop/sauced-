"use client";
import "@/app/styles/recipe.css";
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { Check, Close, Timer } from "@/components/icons";
import { formatDuration, type TimerMatch } from "@/lib/recipe";

// Kitchen timers shared by the recipe page and cook mode. The store lives outside React so
// timers keep running across client navigation, and end times (not remaining seconds) go to
// sessionStorage so a reload, or iOS freezing the tab in the background, doesn't lose them.

export type KitchenTimer = { key: string; label: string; seconds: number; endsAt: number; done: boolean };
type State = { timers: KitchenTimer[]; now: number };

const STORE = "sauced:timers";
const EMPTY: State = { timers: [], now: 0 };
let state = EMPTY;
let loaded = false;
let ticker: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "[]");
    if (Array.isArray(saved)) state = { timers: saved as KitchenTimer[], now: Date.now() };
  } catch {}
  // Background tabs are throttled; catch up the moment the cook looks again.
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("pointerdown", unlockAfterReload, true);
}

function save(timers: KitchenTimer[]) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(timers));
  } catch {}
}

function set(timers: KitchenTimer[]) {
  state = { timers, now: Date.now() };
  save(timers);
  subs.forEach((f) => f());
  run();
}

function run() {
  const running = state.timers.some((t) => !t.done);
  if (running && !ticker) ticker = setInterval(tick, 500);
  if (!running && ticker) ticker = void clearInterval(ticker);
}

function tick() {
  if (!state.timers.some((t) => !t.done)) return run();
  const now = Date.now();
  let rang = false;
  const timers = state.timers.map((t) => {
    if (t.done || t.endsAt > now) return t;
    rang = true;
    return { ...t, done: true };
  });
  if (rang) {
    save(timers);
    ring();
  }
  state = { timers, now };
  subs.forEach((f) => f());
  run();
}

function subscribe(fn: () => void) {
  load();
  subs.add(fn);
  if (!ticker) tick(); // catches timers that ended while the page was away
  return () => void subs.delete(fn);
}

function snapshot() {
  load();
  return state;
}

export function useTimers(): State {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function startTimer(key: string, label: string, seconds: number) {
  primeAudio(); // must happen inside the tap, or iOS keeps the alarm silent
  load();
  if (state.timers.some((t) => t.key === key && !t.done)) return;
  const fresh = { key, label, seconds, endsAt: Date.now() + seconds * 1000, done: false };
  set([...state.timers.filter((t) => t.key !== key), fresh]);
}

export function stopTimer(key: string) {
  set(state.timers.filter((t) => t.key !== key));
}

const secondsLeft = (t: KitchenTimer, now: number) => Math.max(0, Math.ceil((t.endsAt - now) / 1000));

// ── Sound ──────────────────────────────────────────────────

let audio: AudioContext | null = null;

function primeAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state !== "running") audio.resume().catch(() => {});
    // iOS only unlocks Web Audio once something has played during a gesture: a silent blip.
    const g = audio.createGain();
    g.gain.value = 0;
    const o = audio.createOscillator();
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.02);
  } catch {}
}

/** After a reload the audio context is gone; the next tap anywhere brings it back. */
function unlockAfterReload() {
  if (audio?.state === "running" || !state.timers.some((t) => !t.done)) return;
  primeAudio();
}

function ring() {
  if ("vibrate" in navigator) navigator.vibrate([300, 120, 300, 120, 300]);
  if (!audio) return;
  try {
    if (audio.state !== "running") audio.resume().catch(() => {});
    const t0 = audio.currentTime + 0.05;
    // Two bursts of three short pips, like an oven timer.
    for (let i = 0; i < 6; i++) {
      const at = t0 + i * 0.2 + (i >= 3 ? 0.4 : 0);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 1046;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.35, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.connect(g).connect(audio.destination);
      o.start(at);
      o.stop(at + 0.16);
    }
  } catch {}
}

// ── Labels ─────────────────────────────────────────────────

const EDGE_FILLER = new Set(
  "for at about around in on another until then and or with a an the to by of over ca cirka i på för och sen sedan minst".split(" "),
);

function trimFiller(words: string[]): string[] {
  let a = 0;
  let b = words.length;
  while (a < b && EDGE_FILLER.has(words[a].toLowerCase())) a++;
  while (b > a && EDGE_FILLER.has(words[b - 1].toLowerCase())) b--;
  return words.slice(a, b);
}

function clauseWords(clause: string): string[] {
  return trimFiller(trimFiller(clause.trim().split(/\s+/).filter(Boolean)).slice(0, 3));
}

/** A dock label from the words around the duration: "Everything in, simmer low for 2 hours" → "Simmer low · 2 hours". */
export function timerLabel(step: string, m: TimerMatch): string {
  let words = clauseWords(step.slice(0, m.start).split(/[.;:!?,()]\s*/).pop() ?? "");
  if (!words.length) words = clauseWords(step.slice(m.end).split(/[.;:!?,()]/)[0] ?? "");
  const name = words.join(" ").replace(/[^\p{L}\p{N}°]+$/u, "");
  return name ? `${name[0].toUpperCase()}${name.slice(1)} · ${m.label}` : `Timer · ${m.label}`;
}

// ── UI ─────────────────────────────────────────────────────

/** A duration inside step text. Tap to start; shows the countdown while it runs. */
export function TimerChip({ timerKey, label, seconds, text }: { timerKey: string; label: string; seconds: number; text: string }) {
  const { timers, now } = useTimers();
  const t = timers.find((x) => x.key === timerKey);
  const status = !t ? "idle" : t.done ? "done" : "running";
  const left = t ? formatDuration(secondsLeft(t, now)) : "";

  return (
    <button
      type="button"
      className="timer-chip"
      data-state={status}
      aria-label={status === "idle" ? `Start a ${text} timer` : status === "running" ? `Timer running, ${left} left` : "Timer done. Tap to dismiss"}
      onClick={(e) => {
        e.stopPropagation(); // the step behind it ticks off on tap
        if (status === "idle") startTimer(timerKey, label, seconds);
        else if (status === "done") stopTimer(timerKey);
      }}
    >
      {status === "done" ? <Check size={13} /> : <Timer size={15} />}
      <span>{status === "idle" ? text : status === "running" ? left : "Done"}</span>
    </button>
  );
}

/**
 * Running and finished timers, floating above the bottom edge (and the tab bar, or cook mode's
 * Back / Next). Rendered once in the app layout. Soonest is at the bottom, nearest the thumb.
 */
export function TimerDock() {
  const { timers, now } = useTimers();
  const ref = useRef<HTMLDivElement>(null);
  const shown = timers.length > 0;

  // Pages pad their bottom by --dock-h, so the dock never hides the end of the content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--dock-h", `${el.offsetHeight + 12}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--dock-h");
    };
  }, [shown]);

  if (!shown) return null;
  const sorted = [...timers].sort((a, b) => b.endsAt - a.endsAt);

  return (
    <div ref={ref} className="timer-dock" role="region" aria-label="Timers">
      {sorted.map((t) => {
        const left = secondsLeft(t, now);
        const done = Math.min(100, ((t.seconds - left) / t.seconds) * 100);
        return (
          <div
            key={t.key}
            className={`t${t.done ? " done" : ""}`}
            style={{ "--p": `${t.done ? 100 : done}%` } as CSSProperties}
            role={t.done ? "alert" : undefined}
          >
            {t.done ? <Check size={18} /> : <Timer size={20} />}
            <span className="label">{t.label}</span>
            <span className="left">{t.done ? "Done" : formatDuration(left)}</span>
            <button type="button" className="icon-btn" aria-label={t.done ? `Dismiss ${t.label}` : `Cancel ${t.label}`} onClick={() => stopTimer(t.key)}>
              <Close size={20} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
