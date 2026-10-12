"use client";
import { useEffect, useRef } from "react";
import "@/app/styles/list.css";
import { setEdwardHidden } from "@/lib/edward-hidden";

// Shown once per device after an update with new things in it. Bump RELEASE for the next one.
const KEY = "sauced:whats-new";
const RELEASE = "2026-10-feed";

const NEW: [string, string][] = [
  ["Feed", "What you cook goes on the new Feed tab (untick “Feed” to skip it). Friends comment and give Edwards."],
  ["Ratings", "Scores show as Edward’s bow ties: 4.3 is four and a bit."],
  ["Shopping list", "Add your own items at the bottom, tap Go shopping to get it sorted by aisle, and send your list to a friend with the share button."],
  ["Drafts", "Tick Draft on a new recipe to keep it to yourself until it’s ready."],
  ["+ button", "New recipe, or Explore to find one on the web (Discover moved here)."],
  ["Light or dark", "You tab → Appearance."],
];

export function WhatsNew() {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === RELEASE) return;
    } catch {
      return;
    }
    // A moment after opening, so it doesn't fight the page loading in.
    const t = setTimeout(() => ref.current?.showModal(), 600);
    return () => clearTimeout(t);
  }, []);

  function done(edward: boolean) {
    try {
      localStorage.setItem(KEY, RELEASE);
    } catch {}
    if (edward) setEdwardHidden(false);
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="shop-sheet whats-new" aria-labelledby="whats-new-title" onClose={() => done(false)}>
      <div className="shop-sheet-top">
        <div className="shop-sheet-grip" aria-hidden="true" />
        <h2 id="whats-new-title">New in Sauced</h2>
      </div>
      <div className="shop-sheet-body">
        <ul className="whats-new-list">
          {NEW.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
          <li className="whats-new-edward">
            <span className="edward-face">
              <img src="/edward-3.webp" alt="" width={173} height={192} className="only-light" />
              <img src="/edward-dark-3.webp" alt="" width={173} height={192} className="only-dark" />
            </span>
            <span>
              <b>Edward</b>
              <span>
                A helper who answers cooking questions in Swedish, converts units, adds things to your list and saves recipes he gives you. He’s off to begin
                with: turn him on here, or later under You → Edward.
              </span>
            </span>
          </li>
        </ul>
        <div className="whats-new-actions">
          <button type="button" className="btn accent block" onClick={() => done(true)}>
            Turn on Edward
          </button>
          <button type="button" className="btn ghost block" onClick={() => done(false)}>
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}
