"use client";
import "@/app/styles/cooklog.css";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/bits";
import { Camera, Close, Pot } from "@/components/icons";
import { logCooked, unlogCooked } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { dayLabel, localDay } from "@/lib/parse";
import { uploadPhoto } from "@/lib/photo";
import type { Cook, CookedEntry } from "@/lib/types";

const SHOWN = 5;

type Group = {
  key: string;
  /** One row per person; the first is whoever logged it when they cooked too. */
  rows: CookedEntry[];
  on: string;
  note: string;
  photoUrl: string | null;
  loggedBy: string | null;
};

/** Rows logged together ("You & Rasmus") as one cook, newest first. */
function groupCooks(entries: CookedEntry[]): Group[] {
  const out: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const e of entries) {
    const key = e.groupId ?? e.id;
    const g = byKey.get(key);
    if (g) g.rows.push(e);
    else {
      const ng = { key, rows: [e], on: e.on, note: e.note, photoUrl: e.photoUrl, loggedBy: e.loggedBy };
      byKey.set(key, ng);
      out.push(ng);
    }
  }
  for (const g of out) g.rows.sort((a, b) => Number(b.cook.id === g.loggedBy) - Number(a.cook.id === g.loggedBy));
  return out;
}

/** "You & Rasmus", "You, Rasmus & Ida". */
function names(rows: CookedEntry[], meId: string): string {
  const n = rows.map((r) => (r.cook.id === meId ? "You" : r.cook.name));
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}

/** "I cooked this" with a comment, a photo and who you cooked with; and everyone's history for the recipe. */
export function CookLog({ recipeId, entries, meId, cooks = [] }: { recipeId: string; entries: CookedEntry[]; meId: string; cooks?: Cook[] }) {
  const [today] = useState(localDay);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const groups = groupCooks(entries);
  const mine = groups.filter((g) => g.rows.some((r) => r.cook.id === meId)).length;
  const shown = all ? groups : groups.slice(0, SHOWN);

  function remove(g: Group) {
    const loggedIt = g.loggedBy === meId;
    const mineRow = g.rows.find((r) => r.cook.id === meId);
    const row = loggedIt ? g.rows[0] : mineRow;
    if (!row) return;
    const question =
      !loggedIt && g.rows.length > 1
        ? `Take yourself off this cook? It stays in ${names(g.rows.filter((r) => r.cook.id !== meId), meId)}'s log.`
        : `Remove ${dayLabel(g.on, today).toLowerCase()} from the log${g.rows.length > 1 ? " for everyone on it" : ""}?`;
    if (!confirm(question)) return;
    setError("");
    start(async () => {
      const res = await unlogCooked(row.id, recipeId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className="section cook-log" id="cooked">
      <div className="section-head">
        <h2 className="eyebrow">Cooked</h2>
        {groups.length > 0 && <span className="eyebrow">{groups.length}×</span>}
      </div>

      <p className="log-summary" suppressHydrationWarning>{summary(groups.length, mine, groups[0]?.on, today)}</p>

      {open ? (
        <Composer recipeId={recipeId} meId={meId} cooks={cooks} today={today} onDone={() => setOpen(false)} />
      ) : (
        <button type="button" className="btn ghost block log-btn" onClick={() => setOpen(true)}>
          <Pot size={20} /> I cooked this
        </button>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {groups.length > 0 && (
        <ul className="log-list" aria-busy={pending || undefined}>
          {shown.map((g) => (
            <li key={g.key}>
              <span className="avatars" data-n={Math.min(g.rows.length, 3)}>
                {g.rows.slice(0, 3).map((r) => (
                  <Link key={r.id} href={`/u/${r.cook.id}`} aria-label={`${r.cook.name}'s profile`}>
                    <Avatar name={r.cook.name} id={r.cook.id} />
                  </Link>
                ))}
              </span>
              <div className="text">
                <p>
                  {g.rows.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && (i === g.rows.length - 1 ? " & " : ", ")}
                      <Link href={`/u/${r.cook.id}`} className="name-link">
                        {r.cook.id === meId ? "You" : r.cook.name}
                      </Link>
                    </span>
                  ))}{" "}
                  <span className="muted" suppressHydrationWarning>{dayLabel(g.on, today)}</span>
                </p>
                {g.note && <p className="log-note">{g.note}</p>}
                {g.photoUrl && (
                  <a href={g.photoUrl} target="_blank" rel="noopener noreferrer" className="log-photo">
                    <img src={g.photoUrl} alt={`Photo from ${names(g.rows, meId)}`} loading="lazy" />
                  </a>
                )}
              </div>
              {(g.loggedBy === meId || g.rows.some((r) => r.cook.id === meId)) && (
                <button type="button" className="row-x" aria-label={`Remove ${dayLabel(g.on, today)} from the log`} disabled={pending} onClick={() => remove(g)}>
                  <Close size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.length > SHOWN && (
        <button type="button" className="text-btn more-log" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${groups.length}`}
        </button>
      )}
    </section>
  );
}

/** Day (today unless changed), a comment and a photo, all but the day optional. */
export function Composer({
  recipeId,
  meId,
  cooks = [],
  today,
  onDone,
  autoFocus = true,
}: {
  recipeId: string;
  meId: string;
  /** Everyone in the kitchen, to tick who cooked it with you. */
  cooks?: Cook[];
  today: string;
  onDone: () => void;
  autoFocus?: boolean;
}) {
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [withIds, setWithIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      setPhoto(await uploadPhoto(file, meId));
    } catch {
      setError("That photo didn't upload. Try another.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError("");
    start(async () => {
      const res = await logCooked(recipeId, day, note, photo, withIds);
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  const preview = photoUrl(photo);

  return (
    <div className="composer">
      <textarea
        ref={noteRef}
        className="textarea"
        rows={2}
        value={note}
        maxLength={280}
        placeholder="How did it go? Anything to change next time?"
        aria-label="Comment"
        autoFocus={autoFocus}
        onChange={(e) => {
          setNote(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight + 2}px`;
        }}
      />

      {(preview || uploading) && (
        <div className="step-photo composer-photo">
          {preview && <img src={preview} alt="" />}
          {uploading && <span className="busy">Adding photo</span>}
          {preview && !uploading && (
            <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setPhoto(null)}>
              <Close size={16} />
            </button>
          )}
        </div>
      )}

      {cooks.length > 1 && (
        <div className="who-cooked" role="group" aria-label="Who cooked">
          <span className="who-label">Who cooked</span>
          <span className="chip" aria-pressed="true" aria-disabled="true">
            You
          </span>
          {cooks
            .filter((c) => c.id !== meId)
            .map((c) => {
              const on = withIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => setWithIds((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                >
                  <Avatar name={c.name} id={c.id} />
                  {c.name.split(" ")[0]}
                </button>
              );
            })}
        </div>
      )}

      <div className="composer-bar">
        {!preview && !uploading && (
          <label className="chip">
            <Camera size={16} /> Photo
            <input type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
        )}
        <label className="chip date-chip">
          <span className="sr-only">Day</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} />
        </label>
        <span className="composer-actions">
          <button type="button" className="text-btn" onClick={onDone}>Cancel</button>
          <button type="button" className="btn accent" disabled={pending || uploading} onClick={save}>
            {pending ? "Logging" : withIds.length ? `Log it for ${withIds.length + 1}` : "Log it"}
          </button>
        </span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function summary(total: number, mine: number, latestOn: string | undefined, today: string): string {
  if (!total || !latestOn) return "Nobody's logged this one yet.";
  const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
  const last = dayLabel(latestOn, today);
  const when = last === "Today" || last === "Yesterday" ? last.toLowerCase() : `on ${last}`;
  if (mine === total) return `You've made this ${times(total)}, last ${when}.`;
  if (!mine) return `Made ${times(total)} in the kitchen, last ${when}.`;
  return `Made ${times(total)} in the kitchen, ${times(mine)} by you. Last ${when}.`;
}
