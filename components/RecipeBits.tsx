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

  const clear = () => {
    setTicked([]);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  };

  return [ticked, toggle, clear] as const;
}

/**
 * Ingredients left out of this cook ("don't have it"), shared by the list and the step cards.
 * Kept for the browser session like the ticks, so it carries into cook mode and back.
 */
export const useSkipped = (recipeId: string) => useTicked(`sauced:skip:${recipeId}`);

/**
 * Ingredient checklist by section, amounts scaled and in bold. Shared with cook mode's "Get ready".
 * With `skipped`, each line also gets a "don't have it" button that leaves it out of the steps.
 */
export function Ingredients({
  lines,
  recipeId,
  factor = 1,
  skipped,
  onSkip,
}: {
  lines: string[];
  recipeId: string;
  factor?: number;
  skipped?: number[];
  onSkip?: (index: number) => void;
}) {
  const [got, toggle] = useTicked(`sauced:got:${recipeId}`);
  const sections = useMemo(() => ingredientSections(lines), [lines]);

  return sections.map((s, si) => (
    <div key={si} className="ing-group">
      {s.name && <h3 className="sub-head">{s.name}</h3>}
      <ul className="ingredients">
        {s.items.map(({ index, text }) => {
          const { amount, rest } = splitIngredient(text, factor);
          const out = !!skipped?.includes(index);
          return (
            <li key={index} className={onSkip ? "can-skip" : undefined} data-skipped={out || undefined}>
              <button type="button" className="tick" aria-pressed={got.includes(index)} disabled={out} onClick={() => toggle(index)}>
                <span className="check">
                  <Check size={14} />
                </span>
                <span>
                  {amount && <b>{amount}</b>} {rest}
                  {out && <em className="left-out">Leaving out</em>}
                </span>
              </button>
              {onSkip && (
                <button
                  type="button"
                  className="skip-btn"
                  aria-pressed={out}
                  aria-label={out ? `Put ${rest.split(",")[0]} back in` : `Don't have ${rest.split(",")[0]}: leave it out`}
                  title={out ? "Put it back" : "Don't have it"}
                  onClick={() => onSkip(index)}
                >
                  {out ? <Undo size={18} /> : <NotHave size={18} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  ));
}

/** "Leaving out: garlic, parmesan · Put back": shown above the list while anything is left out. */
export function SkippedNote({ lines, skipped, onReset }: { lines: string[]; skipped: number[]; onReset: () => void }) {
  const names = useMemo(() => {
    const list = ingredientSections(lines).flatMap((s) => s.items);
    return list.filter((i) => skipped.includes(i.index)).map((i) => splitIngredient(i.text).rest.split(",")[0].trim());
  }, [lines, skipped]);
  if (!names.length) return null;
  return (
    <p className="skipped-note">
      <span>
        Leaving out <b>{names.join(", ")}</b>. The steps skip {names.length === 1 ? "it" : "them"}.
      </span>
      <button type="button" className="text-btn primary" onClick={onReset}>Put back</button>
    </p>
  );
}

const NotHave = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M6.5 17.5l11-11" />
  </svg>
);
const Undo = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 7L5 11l4 4" />
    <path d="M5 11h9a5 5 0 010 10h-2" />
  </svg>
);

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
