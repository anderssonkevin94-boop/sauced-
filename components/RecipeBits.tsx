"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Share, Sun } from "@/components/icons";

export function Ingredients({ items, recipeId }: { items: string[]; recipeId: string }) {
  const key = `sauced:got:${recipeId}`;
  const [got, setGot] = useState<number[]>([]);

  useEffect(() => {
    try {
      setGot(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);

  const toggle = (i: number) =>
    setGot((prev) => {
      const next = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });

  return (
    <ul className="ingredients">
      {items.map((item, i) => (
        <li key={i}>
          <button type="button" aria-pressed={got.includes(i)} onClick={() => toggle(i)}>
            <span className="check">
              <Check size={14} />
            </span>
            <span>{item}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type Sentinel = { release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };

/** Keeps the phone screen on while cooking, so it doesn't lock with floury hands. */
export function KeepAwake() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const lock = useRef<Sentinel | null>(null);
  const wanted = useRef(false);

  useEffect(() => {
    setSupported("wakeLock" in navigator);
    const reacquire = () => {
      if (wanted.current && document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      lock.current?.release().catch(() => {});
    };
  }, []);

  async function acquire() {
    try {
      const s = (await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock.request(
        "screen",
      )) as Sentinel;
      lock.current = s;
      setOn(true);
      s.addEventListener("release", () => {
        lock.current = null;
        if (!wanted.current) setOn(false);
      });
    } catch {
      wanted.current = false;
      setOn(false);
    }
  }

  async function toggle() {
    if (on) {
      wanted.current = false;
      await lock.current?.release().catch(() => {});
      setOn(false);
    } else {
      wanted.current = true;
      await acquire();
    }
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={on}
      aria-label={on ? "Screen stays on. Tap to allow sleep" : "Keep screen on while cooking"}
      title="Keep screen on"
      onClick={toggle}
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
    // Drop ?saved=1 so a refresh doesn't replay the toast.
    history.replaceState(history.state, "", location.pathname);
  }, []);
  return (
    <div className="toast" role="status">
      <Check size={16} />
      {children}
    </div>
  );
}
