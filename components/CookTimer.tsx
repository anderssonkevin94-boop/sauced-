"use client";
import { useEffect, useRef, useState } from "react";
import { ApplianceIcon } from "@/components/HeatChip";
import { Close } from "@/components/icons";
import type { Appliance } from "@/lib/step";

// One countdown for cook mode, started from a step's time ("Oven · 25 min"). It keeps
// running while you move between steps and survives a reload (sessionStorage), and when
// it's up it beeps, buzzes where phones allow it, and stays on screen until dismissed.

export type Timer = { endsAt: number; minutes: number; label: string; appliance: Appliance; step: number };

const key = (recipeId: string) => `sauced:timer:${recipeId}`;

export function useCookTimer(recipeId: string) {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const rang = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key(recipeId)) ?? "null") as Timer | null;
      if (saved?.endsAt) setTimer(saved);
    } catch {}
  }, [recipeId]);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const left = timer ? Math.max(0, timer.endsAt - now) : 0;
  const done = !!timer && left === 0;

  useEffect(() => {
    if (!done || rang.current) return;
    rang.current = true;
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    beep(audio.current);
  }, [done]);

  function save(t: Timer | null) {
    setTimer(t);
    setNow(Date.now());
    rang.current = false;
    try {
      if (t) sessionStorage.setItem(key(recipeId), JSON.stringify(t));
      else sessionStorage.removeItem(key(recipeId));
    } catch {}
  }

  function start(t: Omit<Timer, "endsAt">) {
    // Sound has to be unlocked by a tap (iOS), so it's set up here rather than when it rings.
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {}
    save({ ...t, endsAt: Date.now() + t.minutes * 60_000 });
  }

  return { timer, left, done, start, stop: () => save(null) };
}

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

export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The running timer, pinned above cook mode's buttons. Tap it to jump back to its step. */
export function TimerBar({ timer, left, done, onStop, onJump }: { timer: Timer; left: number; done: boolean; onStop: () => void; onJump: () => void }) {
  return (
    <div className="timer-bar" data-done={done || undefined} role="timer" aria-live={done ? "assertive" : "off"}>
      <button type="button" className="timer-main" onClick={onJump}>
        <ApplianceIcon appliance={timer.appliance} size={20} />
        <span className="timer-label">{done ? `${timer.label}: time's up` : timer.label}</span>
        <span className="timer-left">{done ? "0:00" : clock(left)}</span>
      </button>
      <button type="button" className="row-x" aria-label={done ? "Dismiss timer" : "Stop timer"} onClick={onStop}>
        <Close size={18} />
      </button>
    </div>
  );
}
