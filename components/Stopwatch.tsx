"use client";
import { useEffect, useState } from "react";
import { Clock, Close } from "@/components/icons";

// Stopwatches for writing a recipe while you cook it: time a step (or the whole cook)
// and the result is written in for you. They count from a start time, so they stay right
// while the phone is locked or the app is in the background.

export function useStopwatches<K extends string | number>(storageKey?: string) {
  const [starts, setStarts] = useState<Partial<Record<K, number>>>({});
  const [now, setNow] = useState(() => Date.now());

  // Only the whole-cook stopwatch is kept over a reload (step rows get new keys).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Partial<Record<K, number>>;
      if (Object.keys(saved).length) setStarts(saved);
    } catch {}
  }, [storageKey]);

  const running = Object.keys(starts).length > 0;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  function save(next: Partial<Record<K, number>>) {
    setStarts(next);
    if (!storageKey) return;
    try {
      if (Object.keys(next).length) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }

  return {
    isRunning: (k: K) => starts[k] !== undefined,
    elapsed: (k: K) => (starts[k] === undefined ? 0 : Math.max(0, now - starts[k]!)),
    start: (k: K) => save({ ...starts, [k]: Date.now() }),
    /** Stops it and returns how long it ran, in ms. */
    stop: (k: K) => {
      const ms = starts[k] === undefined ? 0 : Date.now() - starts[k]!;
      const next = { ...starts };
      delete next[k];
      save(next);
      return ms;
    },
    cancel: (k: K) => {
      const next = { ...starts };
      delete next[k];
      save(next);
    },
  };
}

/** 192000 → "3:12", 3723000 → "1:02:03". */
export function watchLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** A stopped time as recipes write it: whole minutes (at least 1), or half hours from 2 hours up. */
export function watchTime(ms: number): { time: string; unit: "min" | "h" } {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) return { time: String(minutes), unit: "min" };
  return { time: String(Math.round(minutes / 30) / 2), unit: "h" };
}

/** "⏱ Time it", then the running clock with Stop and ×. */
export function StopwatchControl({
  running,
  elapsed,
  onStart,
  onStop,
  onCancel,
  label = "Time it",
  className = "add-heat",
}: {
  running: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  label?: string;
  className?: string;
}) {
  if (!running) {
    return (
      <button type="button" className={className} onClick={onStart}>
        <Clock size={15} /> {label}
      </button>
    );
  }
  return (
    <span className="watch-run" role="timer" aria-live="off">
      <span className="dot" aria-hidden="true" />
      <b>{watchLabel(elapsed)}</b>
      <button type="button" className="watch-stop" onClick={onStop}>
        Stop
      </button>
      <button type="button" className="watch-x" aria-label="Cancel the stopwatch" onClick={onCancel}>
        <Close size={14} />
      </button>
    </span>
  );
}
