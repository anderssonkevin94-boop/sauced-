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
import type { CookedEntry } from "@/lib/types";

const SHOWN = 5;

/** "I cooked this" with a comment and a photo, and everyone's history for the recipe. */
export function CookLog({ recipeId, entries, meId }: { recipeId: string; entries: CookedEntry[]; meId: string }) {
  const [today] = useState(localDay);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const mine = entries.filter((e) => e.cook.id === meId).length;
  const shown = all ? entries : entries.slice(0, SHOWN);

  function remove(e: CookedEntry) {
    if (!confirm(`Remove ${dayLabel(e.on, today).toLowerCase()} from the log?`)) return;
    setError("");
    start(async () => {
      const res = await unlogCooked(e.id, recipeId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className="section cook-log" id="cooked">
      <div className="section-head">
        <h2 className="eyebrow">Cooked</h2>
        {entries.length > 0 && <span className="eyebrow">{entries.length}×</span>}
      </div>

      <p className="log-summary" suppressHydrationWarning>{summary(entries.length, mine, entries[0], today)}</p>

      {open ? (
        <Composer recipeId={recipeId} meId={meId} today={today} onDone={() => setOpen(false)} />
      ) : (
        <button type="button" className="btn ghost block log-btn" onClick={() => setOpen(true)}>
          <Pot size={20} /> I cooked this
        </button>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {entries.length > 0 && (
        <ul className="log-list" aria-busy={pending || undefined}>
          {shown.map((e) => (
            <li key={e.id}>
              <Link href={`/u/${e.cook.id}`} aria-label={`${e.cook.name}'s profile`}>
                <Avatar name={e.cook.name} id={e.cook.id} />
              </Link>
              <div className="text">
                <p>
                  <Link href={`/u/${e.cook.id}`} className="name-link">
                    {e.cook.id === meId ? "You" : e.cook.name}
                  </Link>{" "}
                  <span className="muted" suppressHydrationWarning>{dayLabel(e.on, today)}</span>
                </p>
                {e.note && <p className="log-note">{e.note}</p>}
                {e.photoUrl && (
                  <a href={e.photoUrl} target="_blank" rel="noopener noreferrer" className="log-photo">
                    <img src={e.photoUrl} alt={`${e.cook.name}'s photo`} loading="lazy" />
                  </a>
                )}
              </div>
              {e.cook.id === meId && (
                <button type="button" className="row-x" aria-label={`Remove ${dayLabel(e.on, today)} from the log`} disabled={pending} onClick={() => remove(e)}>
                  <Close size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {entries.length > SHOWN && (
        <button type="button" className="text-btn more-log" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

/** Day (today unless changed), a comment and a photo, all but the day optional. */
export function Composer({
  recipeId,
  meId,
  today,
  onDone,
  autoFocus = true,
}: {
  recipeId: string;
  meId: string;
  today: string;
  onDone: () => void;
  autoFocus?: boolean;
}) {
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
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
      const res = await logCooked(recipeId, day, note, photo);
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
            {pending ? "Logging" : "Log it"}
          </button>
        </span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function summary(total: number, mine: number, latest: CookedEntry | undefined, today: string): string {
  if (!total || !latest) return "Nobody's logged this one yet.";
  const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
  const last = dayLabel(latest.on, today);
  const when = last === "Today" || last === "Yesterday" ? last.toLowerCase() : `on ${last}`;
  if (mine === total) return `You've made this ${times(total)}, last ${when}.`;
  if (!mine) return `Made ${times(total)} in the kitchen, last ${when}.`;
  return `Made ${times(total)} in the kitchen, ${times(mine)} by you. Last ${when}.`;
}
