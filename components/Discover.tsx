"use client";
import "@/app/styles/discover.css";
import { useEffect, useRef, useState } from "react";
import { DiscoverHitSheet, HitFacts } from "@/components/DiscoverHitSheet";
import { Clock, Close, Search } from "@/components/icons";
import { discoverRecipes, type DiscoverHit, type DiscoverResult } from "@/lib/discover";
import { initials, tileColor } from "@/lib/parse";

// Session, not local: back from a recipe or /new restores the list, tomorrow starts fresh.
const RESULTS_KEY = "sauced:discover";
const RECENT_KEY = "sauced:discover:recent";
const MAX_RECENT = 6;
const SUGGESTIONS = ["Kanelbullar", "Lasagne", "Pad thai", "Köttbullar", "Banana bread", "Kladdkaka", "Ramen"];
const OFFLINE = "Couldn't reach the kitchen. Check your connection and try again.";

type Results = { query: string; hits: DiscoverHit[] };
type Status = { kind: "idle" } | { kind: "searching"; query: string } | { kind: "error"; query: string; error: string };

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage, key: string, value: unknown) {
  try {
    if (value == null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {}
}

export function Discover({ available }: { available: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState<DiscoverHit | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const run = useRef(0); // bumped by every search and Cancel; stale answers are dropped
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readJson<Results>(sessionStorage, RESULTS_KEY);
    if (saved && typeof saved.query === "string" && Array.isArray(saved.hits)) {
      setResults(saved);
      setQ(saved.query);
    }
    const r = readJson<string[]>(localStorage, RECENT_KEY);
    if (Array.isArray(r)) setRecent(r.filter((s) => typeof s === "string").slice(0, MAX_RECENT));
    setReady(true);
  }, []);

  const searching = status.kind === "searching";
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(() => setSlow(true), 35_000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [searching]);

  function remember(query: string) {
    setRecent((prev) => {
      const next = [query, ...prev.filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, MAX_RECENT);
      writeJson(localStorage, RECENT_KEY, next);
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    writeJson(localStorage, RECENT_KEY, null);
  }

  async function search(raw: string) {
    const query = raw.trim().replace(/\s+/g, " ");
    if (!query || searching) return;
    input.current?.blur(); // drops the keyboard so the waiting state is visible
    setQ(query);
    setStatus({ kind: "searching", query });
    const id = ++run.current;
    let res: DiscoverResult;
    try {
      res = await discoverRecipes(query);
    } catch {
      res = { ok: false, error: OFFLINE };
    }
    if (id !== run.current) return;
    if (!res.ok) {
      setStatus({ kind: "error", query, error: res.error });
      return;
    }
    const next = { query: res.query || query, hits: res.hits };
    setResults(next);
    writeJson(sessionStorage, RESULTS_KEY, next);
    setStatus({ kind: "idle" });
    if (next.hits.length) remember(query);
  }

  // The request can't be aborted, so Cancel just stops listening for it.
  function cancel() {
    run.current++;
    setStatus({ kind: "idle" });
  }

  function clear() {
    setQ("");
    setResults(null);
    setStatus({ kind: "idle" });
    writeJson(sessionStorage, RESULTS_KEY, null);
    input.current?.focus();
  }

  if (!available) {
    return (
      <div className="empty discover-off">
        <p className="display">Not set up yet</p>
        <p>
          Discover uses Claude to search recipe sites, just like Tidy up. It needs the Claude key on the server. The README
          has the two steps.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        role="search"
        className="discover-form"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <label className="search">
          <Search size={18} />
          <input
            ref={input}
            type="search"
            placeholder="What do you feel like making?"
            aria-label="Dish to search for"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            maxLength={80}
            disabled={searching}
          />
          {q && !searching && (
            <button type="button" className="discover-clear" aria-label="Clear search" onClick={clear}>
              <Close size={18} />
            </button>
          )}
        </label>
      </form>

      {!ready ? null : status.kind === "searching" ? (
        <Searching query={status.query} slow={slow} onCancel={cancel} />
      ) : status.kind === "error" ? (
        <div className="discover-error" role="alert">
          <p>{status.error}</p>
          <button type="button" className="btn ghost" onClick={() => search(status.query)}>
            Try again
          </button>
        </div>
      ) : results ? (
        <Hits results={results} onOpen={setOpen} />
      ) : (
        <Ideas recent={recent} onPick={search} onClearRecent={clearRecent} />
      )}

      {open && <DiscoverHitSheet key={open.id} hit={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Ideas({ recent, onPick, onClearRecent }: { recent: string[]; onPick: (q: string) => void; onClearRecent: () => void }) {
  return (
    <>
      <section className="discover-ideas">
        <h2 className="eyebrow">Try</h2>
        <div className="discover-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onPick(s)}>
              {s}
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="discover-recent">
          <div className="section-head">
            <h2 className="eyebrow">Recent</h2>
            <button type="button" className="text-btn" onClick={onClearRecent}>
              Clear
            </button>
          </div>
          <ul>
            {recent.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => onPick(s)}>
                  <Clock size={18} />
                  <span>{s}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Searching({ query, slow, onCancel }: { query: string; slow: boolean; onCancel: () => void }) {
  return (
    <>
      <div className="discover-wait">
        <p role="status">
          <strong>Searching recipe sites for “{query}”…</strong>
          <span>{slow ? "Still reading reviews. Nearly there." : "This takes about half a minute."}</span>
        </p>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ul className="discover-skeleton" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <span className="discover-bone tile" />
            <span className="text">
              <span className="discover-bone" style={{ width: "34%" }} />
              <span className="discover-bone" style={{ width: `${78 - i * 9}%`, height: 16 }} />
              <span className="discover-bone" style={{ width: "92%" }} />
              <span className="discover-bone" style={{ width: "64%" }} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Hits({ results, onOpen }: { results: Results; onOpen: (h: DiscoverHit) => void }) {
  const { query, hits } = results;
  if (hits.length === 0) {
    return (
      <div className="empty">
        <p>Nothing well-rated turned up for “{query}”. Try another name for the dish, in Swedish or English.</p>
      </div>
    );
  }
  return (
    <section>
      <h2 className="eyebrow discover-count">
        {hits.length} {hits.length === 1 ? "recipe" : "recipes"} for “{query}”
      </h2>
      <ul className="list discover-hits">
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" className="row discover-hit" onClick={() => onOpen(h)}>
              <span className="tile" style={{ background: tileColor(h.url || h.id) }} aria-hidden="true">
                {initials(h.title)}
              </span>
              <span className="text">
                <span className="discover-source">{h.source}</span>
                <span className="discover-title">{h.title}</span>
                <HitFacts hit={h} />
                {h.summary && <span className="discover-summary">{h.summary}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
