"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Share, Sun } from "@/components/icons";
import { ingredientSections, splitIngredient } from "@/lib/recipe";

/** A set of ticked-off indexes kept for this browser session (ingredients got, steps done). */
export function useTicked(key: string) {
  const [ticked, setTicked] = useState<number[]>([]);

  useEffect(() => {
    try {
      setTicked(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);

  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });

  return [ticked, toggle] as const;
}

/** Ingredient checklist by section, amounts scaled and in bold. Shared with cook mode's "Get ready". */
export function Ingredients({ lines, recipeId, factor = 1 }: { lines: string[]; recipeId: string; factor?: number }) {
  const [got, toggle] = useTicked(`sauced:got:${recipeId}`);
  const sections = useMemo(() => ingredientSections(lines), [lines]);

  return sections.map((s, si) => (
    <div key={si} className="ing-group">
      {s.name && <h3 className="sub-head">{s.name}</h3>}
      <ul className="ingredients">
        {s.items.map(({ index, text }) => {
          const { amount, rest } = splitIngredient(text, factor);
          return (
            <li key={index}>
              <button type="button" aria-pressed={got.includes(index)} onClick={() => toggle(index)}>
                <span className="check">
                  <Check size={14} />
                </span>
                <span>
                  {amount && <b>{amount}</b>} {rest}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  ));
}

/**
 * Holds a screen wake lock while `wanted`, so the phone doesn't lock with floury hands.
 * The browser drops the lock whenever the page is hidden, so it's taken again on return.
 */
export function useWakeLock(wanted: boolean) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setSupported("wakeLock" in navigator), []);

  useEffect(() => {
    if (!wanted || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    setFailed(false);

    async function acquire() {
      if (lock || document.visibilityState !== "visible") return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (!live) return void s.release().catch(() => {});
        lock = s;
        setOn(true);
        s.addEventListener("release", () => {
          lock = null;
          setOn(false);
        });
      } catch {
        // Low Power Mode and some webviews refuse; nothing to do but say so.
        if (live) setFailed(true);
      }
    }

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
      setOn(false);
    };
  }, [wanted]);

  return { supported, on, failed };
}

/** Toggle for keeping the screen on while reading a recipe. Cook mode keeps it on by itself. */
export function KeepAwake() {
  const [want, setWant] = useState(false);
  const { supported, failed } = useWakeLock(want);

  useEffect(() => {
    if (failed) setWant(false);
  }, [failed]);

  if (!supported) return null;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={want}
      aria-label={want ? "Screen stays on. Tap to allow sleep" : "Keep screen on while cooking"}
      title="Keep screen on"
      onClick={() => setWant(!want)}
    >
      <Sun />
    </button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = location.href.split("?")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {}
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" className="icon-btn" aria-label={copied ? "Link copied" : "Share"} onClick={share}>
      {copied ? <Check size={18} /> : <Share />}
    </button>
  );
}

export function Toast({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Drop ?saved=1 so a refresh doesn't replay the toast; keep anything else (like ?x=2).
    const u = new URL(location.href);
    u.searchParams.delete("saved");
    history.replaceState(history.state, "", u);
  }, []);
  return (
    <div className="toast" role="status">
      <Check size={16} />
      {children}
    </div>
  );
}
