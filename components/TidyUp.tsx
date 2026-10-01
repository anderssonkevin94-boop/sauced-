"use client";
import "@/app/styles/tidy.css";
import { useState, useTransition } from "react";
import { Back, Camera, Close, Wand } from "@/components/icons";
import { shrink } from "@/lib/photo";
import { tidyRecipe, type TidyFields } from "@/lib/tidy";

type Current = { title: string; ingredients: string; steps: string; serves: string; time: string; notes: string };

// Server actions accept ~1 MB by default, so keep the photo comfortably under that.
const MAX_PHOTO_B64 = 900_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}

/** Big enough for handwriting, small enough to send: Claude scales anything larger down anyway. */
async function photoData(file: File): Promise<string> {
  for (const max of [1568, 1200, 900]) {
    const data = await toBase64(await shrink(file, max));
    if (data.length <= MAX_PHOTO_B64) return data;
  }
  throw new Error("too big");
}

/** What's already in the form, as plain text Claude can tidy. */
function describe(f: Current): string {
  return [
    f.title && `Title: ${f.title}`,
    f.serves && `Serves: ${f.serves}`,
    f.time && `Time: ${f.time}`,
    f.ingredients && `Ingredients:\n${f.ingredients}`,
    f.steps && `Method:\n${f.steps}`,
    f.notes && `Notes:\n${f.notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const hasContent = (f: Current) => [f.title, f.ingredients, f.steps, f.notes].some((v) => v.trim());

function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

export function TidyUp({
  current,
  onTidied,
}: {
  current: Current;
  /** `typed` means the form itself was tidied, so the person's own choices (like kind) stay. */
  onTidied: (fields: TidyFields, from: "paste" | "typed") => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"paste" | "typed" | null>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setReading(true);
    try {
      setPhoto(await photoData(file));
    } catch {
      setError("Couldn't read that photo. Try another.");
    } finally {
      setReading(false);
    }
  }

  function run(from: "paste" | "typed") {
    const input = from === "typed" ? { text: describe(current) } : { text, image: photo ?? undefined };
    // Asking before the call, not after, so nobody waits 20 seconds to then say no.
    if (from === "paste" && hasContent(current) && !confirm("Replace what's in the form with the tidied recipe?")) return;
    setError("");
    setRunning(from);
    startTransition(async () => {
      try {
        const res = await tidyRecipe(input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onTidied(res.fields, from);
        setText("");
        setPhoto(null);
        setOpen(false);
      } catch {
        setError("Couldn't reach the kitchen. Check your connection and try again.");
      } finally {
        setRunning(null);
      }
    });
  }

  const busy = pending || reading;
  const canPaste = (text.trim().length > 0 || !!photo) && !busy;

  return (
    <section className={`tidy${open ? " open" : ""}`}>
      <button type="button" className="tidy-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tidy-icon">
          <Wand size={20} />
        </span>
        <span className="tidy-copy">
          <strong>Tidy up</strong>
          <span>Paste a recipe or snap a photo. Claude sorts it into the usual format.</span>
        </span>
        <Back size={18} className="tidy-chev" />
      </button>

      {open && (
        <div className="tidy-body">
          <textarea
            className="textarea"
            placeholder="Paste anything"
            aria-label="Recipe to tidy"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              grow(e.target);
            }}
            maxLength={20_000}
            disabled={pending}
          />

          {photo ? (
            <div className="tidy-photo">
              <img src={`data:image/jpeg;base64,${photo}`} alt="Photo to tidy" />
              <span>Photo added</span>
              <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setPhoto(null)} disabled={pending}>
                <Close size={18} />
              </button>
            </div>
          ) : (
            <label className="photo-pick">
              <Camera />
              {reading ? "Reading photo" : "Add photo"}
              <input type="file" accept="image/*" hidden onChange={onPhoto} disabled={busy} />
            </label>
          )}

          <button type="button" className="btn accent block" onClick={() => run("paste")} disabled={!canPaste}>
            {running === "paste" ? "Tidying…" : "Tidy up"}
          </button>
          {hasContent(current) && (
            <button type="button" className="btn ghost block" onClick={() => run("typed")} disabled={busy}>
              {running === "typed" ? "Tidying…" : "Tidy what I've typed"}
            </button>
          )}

          {pending && <p className="tidy-note">Usually takes 10–30 seconds.</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
