"use client";
import "@/app/styles/discover.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { DiscoverHitSheet, HitFacts } from "@/components/DiscoverHitSheet";
import { Clock, Close, Search } from "@/components/icons";
import { DRAFT_FAILED, okToReplaceDraft, saveImportDraft } from "@/components/importDraft";
import { discoverRecipes, type DiscoverHit, type DiscoverResult } from "@/lib/discover";
import { importFromLink, type LinkImportResult } from "@/lib/import-link";
import { initials, tileColor } from "@/lib/parse";

// Session, not local: back from a recipe or /new restores the list, tomorrow starts fresh.
const RESULTS_KEY = "sauced:discover";
const RECENT_KEY = "sauced:discover:recent";
const MAX_RECENT = 6;
const MAX_QUERY = 80;
const SUGGESTIONS = ["Kanelbullar", "Lasagne", "Pad thai", "Köttbullar", "Banana bread", "Kladdkaka", "Ramen"];
const OFFLINE = "Couldn't reach the kitchen. Check your connection and try again.";
const HOW = "Works with most recipe sites (ICA, Arla, Köket, BBC Good Food…). Sauced reads the recipe and converts it to metric.";

// Searching one trusted site at a time beats wading through ad-heavy results. `sv` picks "recept" or "recipe".
const SITES = [
  { name: "ICA", host: "ica.se", sv: true },
  { name: "Arla", host: "arla.se", sv: true },
  { name: "Köket", host: "koket.se", sv: true },
  { name: "Coop", host: "coop.se", sv: true },
  { name: "BBC Good Food", host: "bbcgoodfood.com", sv: false },
  // Allrecipes and Serious Eats block server requests, so their links can't be imported.
  { name: "RecipeTin Eats", host: "recipetineats.com", sv: false },
  { name: "King Arthur", host: "kingarthurbaking.com", sv: false },
];
type Site = (typeof SITES)[number];

// Swedish dish words without å/ä/ö, so "kanelbullar" searches for "recept" and lands on Swedish sites.
const SWEDISH = /[åäö]|bullar|bulle|kaka|kakor|gryta|soppa|kyckling|potatis|korv|janssons|pytt|raggmunk|kalops|semla|semlor|lussekatt|\blax\b|\bsill\b|\bpaj\b/i;

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

const tidyQuery = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY);

function webQuery(dish: string, site?: Site): string {
  const swedish = site ? site.sv : SWEDISH.test(dish);
  const word = /recept|recipe/i.test(dish) ? "" : swedish ? " recept" : " recipe";
  return `${dish}${word}${site ? ` site:${site.host}` : ""}`;
}

const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/** The first web address in what was typed or pasted (share sheets wrap it in the page title), or null. */
function findUrl(text: string): string | null {
  const t = text.trim();
  const found = t.match(/https?:\/\/[^\s<>"'`]+/i)?.[0];
  // A bare "ica.se/recept/…" or "www.…" counts too; a dish name never has a dot before a slash.
  const bare = /^(?:www\.)?(?:[\p{L}\d-]+\.)+\p{L}{2,}(?:\/\S*)?$/iu.test(t) && (/^www\./i.test(t) || t.includes("/"));
  const raw = found ?? (bare ? `https://${t}` : null);
  if (!raw) return null;
  try {
    const u = new URL(raw.replace(/[.,;:!?)\]}»”’]+$/, ""));
    return u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function useRecent() {
  const [recent, setRecent] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const r = readJson<string[]>(localStorage, RECENT_KEY);
    if (Array.isArray(r)) setRecent(r.filter((s) => typeof s === "string").slice(0, MAX_RECENT));
    setReady(true);
  }, []);

  function remember(query: string) {
    setRecent((prev) => {
      const next = [query, ...prev.filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, MAX_RECENT);
      writeJson(localStorage, RECENT_KEY, next);
      return next;
    });
  }

  function clear() {
    setRecent([]);
    writeJson(localStorage, RECENT_KEY, null);
  }

  return { recent, ready, remember, clear };
}

/** Reads a recipe page into the new-recipe form. Leaving the page abandons a pending import. */
function useLinkImport() {
  const router = useRouter();
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function start(url: string) {
    if (busy || !okToReplaceDraft()) return;
    setError("");
    setBusy(true);
    let res: LinkImportResult;
    try {
      res = await importFromLink(url);
    } catch {
      res = { ok: false, error: OFFLINE };
    }
    if (!alive.current) return;
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // The banner reads "Imported from ICA": the site, not the recipe title (that's already in the form).
    const from = res.source.url || url;
    if (!saveImportDraft(res.fields, { title: res.source.site || hostOf(from), url: from }, res.photoPath)) {
      setError(DRAFT_FAILED);
      setBusy(false);
      return;
    }
    router.push("/new"); // stays busy until the form takes over
  }

  return { busy, error, start, setError };
}
type LinkImport = ReturnType<typeof useLinkImport>;

export function Discover({ available }: { available: boolean }) {
  return (
    <>
      {available ? <AiSearch /> : <WebSearch />}
      <LinkCard />
    </>
  );
}

function SearchField({
  inputRef,
  value,
  onChange,
  onSubmit,
  onClear,
  disabled = false,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <form
      role="search"
      className="discover-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="search">
        <Search size={18} />
        <input
          ref={inputRef}
          type="search"
          placeholder="What do you feel like making?"
          aria-label="Dish to search for, or a recipe link"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          maxLength={2000} // room for a pasted link
          disabled={disabled}
        />
        {value && !disabled && (
          <button type="button" className="discover-clear" aria-label="Clear search" onClick={onClear}>
            <Close size={18} />
          </button>
        )}
      </label>
    </form>
  );
}

/** Shown instead of search when a link lands in the dish field. */
function LinkInField({ url, imp }: { url: string; imp: LinkImport }) {
  return (
    <div className="discover-pasted">
      <p>That's a link to {hostOf(url)}.</p>
      <button
        type="button"
        className="btn accent block"
        onClick={() => imp.start(url)}
        disabled={imp.busy}
        aria-busy={imp.busy}
      >
        {imp.busy ? "Reading the recipe…" : "Import this recipe"}
      </button>
      {imp.error && (
        <p className="error" role="alert">
          {imp.error}
        </p>
      )}
    </div>
  );
}

// ── Without a Claude key: search Google, paste the link back ──

/** A link that opens in a new tab, or, with nothing to search yet, a button that sends you to the field. */
function WebLink({
  href,
  className,
  onOpen,
  onEmpty,
  linkRef,
  children,
}: {
  href: string | null;
  className: string;
  onOpen: () => void;
  onEmpty: () => void;
  linkRef?: Ref<HTMLAnchorElement>;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <button type="button" className={`${className} discover-idle`} onClick={onEmpty}>
        {children}
      </button>
    );
  }
  // A real anchor, not window.open after an await: iOS only allows new windows straight from a tap.
  return (
    <a ref={linkRef} className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
      {children}
    </a>
  );
}

function WebSearch() {
  const [q, setQ] = useState("");
  const { recent, ready, remember, clear: clearRecent } = useRecent();
  const imp = useLinkImport();
  const input = useRef<HTMLInputElement>(null);
  const go = useRef<HTMLAnchorElement>(null);
  const dish = tidyQuery(q);
  const link = findUrl(q);
  const focus = () => input.current?.focus();
  const opened = () => remember(dish);

  function submit() {
    if (link) imp.start(link);
    else if (dish) {
      input.current?.blur();
      go.current?.click(); // still inside the keypress, so the new tab is allowed
    } else focus();
  }

  return (
    <>
      <SearchField
        inputRef={input}
        value={q}
        onChange={(v) => {
          setQ(v);
          imp.setError("");
        }}
        onSubmit={submit}
        onClear={() => {
          setQ("");
          focus();
        }}
        disabled={imp.busy}
      />

      {link ? (
        <LinkInField url={link} imp={imp} />
      ) : (
        <>
          {ready && <Fill recent={recent} onPick={setQ} onClearRecent={clearRecent} />}

          <WebLink
            linkRef={go}
            className="btn block discover-go"
            href={dish ? google(webQuery(dish)) : null}
            onOpen={opened}
            onEmpty={focus}
          >
            <Search size={18} />
            Search Google
          </WebLink>

          <section className="discover-sites">
            <h2 className="eyebrow">Or search one site</h2>
            <div className="discover-chips">
              {SITES.map((s) => (
                <WebLink
                  key={s.host}
                  className="chip"
                  href={dish ? google(webQuery(dish, s)) : null}
                  onOpen={opened}
                  onEmpty={focus}
                >
                  {s.name}
                </WebLink>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** Recent searches (or ideas, the first time) that fill the field; searching is still a tap away. */
function Fill({ recent, onPick, onClearRecent }: { recent: string[]; onPick: (q: string) => void; onClearRecent: () => void }) {
  const items = recent.length ? recent : SUGGESTIONS;
  return (
    <section className="discover-fill">
      <div className="section-head">
        <h2 className="eyebrow">{recent.length ? "Recent" : "Try"}</h2>
        {recent.length > 0 && (
          <button type="button" className="text-btn" onClick={onClearRecent}>
            Clear
          </button>
        )}
      </div>
      <div className="chips">
        {items.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => onPick(s)}>
            {recent.length > 0 && <Clock size={16} />}
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Paste a link (both modes) ──

function LinkCard() {
  const [text, setText] = useState("");
  const imp = useLinkImport();
  const input = useRef<HTMLInputElement>(null);

  function submit() {
    const url = findUrl(text);
    if (!url) {
      imp.setError("That doesn't look like a link. Copy the address of the recipe page and paste it here.");
      input.current?.focus();
      return;
    }
    setText(url);
    imp.start(url);
  }

  // Runs on the tap itself, so iOS shows its Paste prompt. Saying no just leaves you in the field.
  async function paste() {
    imp.setError("");
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      input.current?.focus();
      return;
    }
    const url = findUrl(clip);
    if (url) {
      setText(url);
    } else {
      imp.setError("There's no link on the clipboard. Copy the recipe page's address, then tap Paste.");
      input.current?.focus();
    }
  }

  return (
    <section className="card discover-link" aria-labelledby="discover-link-title">
      <h2 id="discover-link-title" className="discover-link-title">
        Found one? Paste the link
      </h2>
      <form
        className="discover-link-form"
        noValidate // our own check accepts "ica.se/…" and links wrapped in shared text
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="discover-link-row">
          <input
            ref={input}
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="https://…"
            aria-label="Recipe link"
            maxLength={2000}
            value={text}
            readOnly={imp.busy}
            onChange={(e) => {
              setText(e.target.value);
              imp.setError("");
            }}
          />
          <button type="button" className="btn ghost discover-paste" onClick={paste} disabled={imp.busy}>
            Paste
          </button>
        </div>
        <button type="submit" className="btn accent block" disabled={imp.busy || !text.trim()} aria-busy={imp.busy}>
          {imp.busy ? "Reading the recipe…" : "Import"}
        </button>
      </form>
      {imp.error && (
        <p className="error" role="alert">
          {imp.error}
        </p>
      )}
      <p className="discover-note" role="status">
        {imp.busy ? "Usually just a few seconds." : HOW}
      </p>
    </section>
  );
}

// ── With a Claude key: Claude searches and ranks recipe sites ──

function AiSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { recent, ready, remember, clear: clearRecent } = useRecent();
  const [open, setOpen] = useState<DiscoverHit | null>(null);
  const [slow, setSlow] = useState(false);
  const imp = useLinkImport();
  const run = useRef(0); // bumped by every search and Cancel; stale answers are dropped
  const input = useRef<HTMLInputElement>(null);
  const link = findUrl(q);

  useEffect(() => {
    const saved = readJson<Results>(sessionStorage, RESULTS_KEY);
    if (saved && typeof saved.query === "string" && Array.isArray(saved.hits)) {
      setResults(saved);
      setQ(saved.query);
    }
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

  async function search(raw: string) {
    const query = tidyQuery(raw);
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

  return (
    <>
      <SearchField
        inputRef={input}
        value={q}
        onChange={(v) => {
          setQ(v);
          imp.setError("");
        }}
        onSubmit={() => (link ? imp.start(link) : search(q))}
        onClear={clear}
        disabled={searching || imp.busy}
      />

      {!ready ? null : link && !searching ? (
        <LinkInField url={link} imp={imp} />
      ) : status.kind === "searching" ? (
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
