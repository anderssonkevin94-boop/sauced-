"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, Close, Seal, Spark } from "@/components/icons";
import { IngredientFields } from "@/components/IngredientFields";
import { StepFields } from "@/components/StepFields";
import { StopwatchControl, useStopwatches, watchTime } from "@/components/Stopwatch";
import { TidyUp } from "@/components/TidyUp";
import type { FormState } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { uploadPhoto } from "@/lib/photo";
import type { TidyFields } from "@/lib/tidy";
import type { Recipe } from "@/lib/types";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

type Fields = {
  title: string;
  kind: string;
  ingredients: string;
  steps: string;
  notes: string;
  serves: string;
  time: string;
  photoPath: string;
};

const DRAFT_KEY = "sauced:draft";
/** Remembers whether this person likes the rows or the plain text boxes. */
const MODE_KEY = "sauced:form-mode";

/** Set on the draft by Discover's "Try it"; lives only in the draft, never in the saved recipe. */
type ImportedFrom = { title: string; url: string };

function fromRecipe(r?: Recipe): Fields {
  return {
    title: r?.title ?? "",
    kind: r?.kind ?? "experiment",
    ingredients: r?.ingredients.join("\n") ?? "",
    steps: r?.steps.join("\n") ?? "",
    notes: r?.notes ?? "",
    serves: r?.serves ?? "",
    time: r?.time ?? "",
    photoPath: r?.photoPath ?? "",
  };
}

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

export function RecipeForm({
  action,
  recipe,
  userId,
  cancelHref,
  heading,
  canTidy = false,
}: {
  action: Action;
  recipe?: Recipe;
  userId: string;
  cancelHref: string;
  heading: string;
  /** Set by the page when the server has an Anthropic key. */
  canTidy?: boolean;
}) {
  const isNew = !recipe;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [f, setF] = useState<Fields>(() => fromRecipe(recipe));
  const [restored, setRestored] = useState(false);
  const [imported, setImported] = useState<ImportedFrom | null>(null);
  const [uploading, setUploading] = useState(false);
  const [stepBusy, setStepBusy] = useState(false);
  // "Time the cook": kept over a reload, for writing the recipe down while making it.
  const cookWatch = useStopwatches<"cook">(`sauced:cook-watch:${recipe?.id ?? "new"}`);
  const [photoError, setPhotoError] = useState("");
  const [tidied, setTidied] = useState(false);
  const beforeTidy = useRef<Fields | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [asText, setAsTextState] = useState(false);

  useEffect(() => {
    try {
      setAsTextState(localStorage.getItem(MODE_KEY) === "text");
    } catch {}
  }, []);

  function setAsText(v: boolean) {
    setAsTextState(v);
    try {
      localStorage.setItem(MODE_KEY, v ? "text" : "rows");
    } catch {}
  }

  // A half-typed recipe at 1am should survive a closed tab.
  useEffect(() => {
    if (!isNew) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const { importedFrom, ...draft } = JSON.parse(saved) as Fields & { importedFrom?: ImportedFrom };
        if (draft.title || draft.ingredients || draft.steps || draft.notes) {
          setF({ ...fromRecipe(), ...draft });
          setRestored(true);
          if (importedFrom?.url) setImported(importedFrom);
        }
      }
    } catch {}
  }, [isNew]);

  useEffect(() => {
    formRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea.textarea").forEach(grow);
    if (!isNew) return;
    try {
      // Keeps the import banner if they leave and come back before saving.
      localStorage.setItem(DRAFT_KEY, JSON.stringify(imported ? { ...f, importedFrom: imported } : f));
    } catch {}
  }, [f, isNew, imported]);

  // Switching to the text view: size the boxes to what's already in them.
  useEffect(() => {
    formRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea.textarea").forEach(grow);
  }, [asText]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setF(fromRecipe());
    setRestored(false);
    setImported(null);
    setTidied(false);
  };

  // Functional update: the tidy call takes a while and people keep typing meanwhile.
  function fillFromTidy(t: TidyFields, from: "paste" | "typed") {
    setF((p) => {
      beforeTidy.current = p;
      return { ...p, ...t, kind: from === "typed" ? p.kind : t.kind };
    });
    setTidied(true);
    setRestored(false);
  }

  function undoTidy() {
    if (beforeTidy.current) setF(beforeTidy.current);
    beforeTidy.current = null;
    setTidied(false);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    setUploading(true);
    try {
      const path = await uploadPhoto(file, userId);
      setF((p) => ({ ...p, photoPath: path }));
    } catch {
      setPhotoError("That photo didn't upload. Try another.");
    } finally {
      setUploading(false);
    }
  }

  function onSubmit() {
    if (isNew) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
  }

  const canSave = f.title.trim().length > 0 && !uploading && !stepBusy && !pending;
  const preview = photoUrl(f.photoPath || null);

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit}>
      <div className="topbar">
        <Link href={cancelHref} className="text-btn">Cancel</Link>
        <span className="eyebrow">{heading}</span>
        <button type="submit" className="text-btn primary" disabled={!canSave}>
          {pending ? "Saving" : "Save"}
        </button>
      </div>

      <div className="form">
        {restored && (
          <div className="banner">
            {imported ? (
              <span>
                Imported from{" "}
                {/^https?:\/\//i.test(imported.url) ? (
                  <a href={imported.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline" }}>
                    {imported.title || "the web"}
                  </a>
                ) : (
                  imported.title || "the web"
                )}
                . Give it a look, then save.
              </span>
            ) : (
              <span>Picked up your unsaved draft.</span>
            )}
            <button type="button" onClick={discardDraft}>Start over</button>
          </div>
        )}

        {canTidy && <TidyUp current={f} onTidied={fillFromTidy} />}

        {tidied && (
          <div className="banner" role="status">
            <span>Tidied. Give it a look, then save.</span>
            <button type="button" onClick={undoTidy}>Undo</button>
          </div>
        )}

        <input
          className="input title-input"
          name="title"
          placeholder="What did you make?"
          value={f.title}
          onChange={set("title")}
          autoFocus={isNew && !restored}
          autoComplete="off"
          maxLength={120}
          aria-label="Recipe name"
          required
        />

        <div className="segmented" role="radiogroup" aria-label="Kind">
          <label>
            <input type="radio" name="kind" value="experiment" checked={f.kind === "experiment"} onChange={set("kind")} />
            <Spark className="experiment" size={14} />
            Experiment
          </label>
          <label>
            <input type="radio" name="kind" value="classic" checked={f.kind === "classic"} onChange={set("kind")} />
            <Seal className="classic" size={14} />
            Tried &amp; true
          </label>
        </div>

        <div className="field">
          <input type="hidden" name="photoPath" value={f.photoPath} />
          {preview ? (
            <div className="photo-preview">
              <img src={preview} alt="" />
              <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setF((p) => ({ ...p, photoPath: "" }))}>
                <Close size={18} />
              </button>
            </div>
          ) : (
            <label className="photo-pick">
              <Camera />
              {uploading ? "Adding photo" : "Add a photo"}
              <input type="file" accept="image/*" hidden onChange={onPhoto} disabled={uploading} />
            </label>
          )}
          {photoError && <p className="error">{photoError}</p>}
        </div>

        <div className="field">
          <div className="label">
            <label htmlFor={asText ? "ingredients" : undefined}>Ingredients</label>
            <TextToggle asText={asText} onChange={setAsText} />
          </div>
          {asText ? (
            <>
              <p className="hint-line">One per line, amount first · “Sauce:” starts a section</p>
              <textarea
                id="ingredients"
                name="ingredients"
                className="textarea"
                placeholder={"2 eggs\n50 g parmesan, grated\nSalt, to taste"}
                value={f.ingredients}
                onChange={(e) => {
                  set("ingredients")(e);
                  grow(e.target);
                }}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="ingredients" value={f.ingredients} />
              <IngredientFields value={f.ingredients} onChange={(v) => setF((p) => ({ ...p, ingredients: v }))} />
            </>
          )}
        </div>

        <div className="field">
          <div className="label">
            <label htmlFor={asText ? "steps" : undefined}>Method</label>
          </div>
          {asText ? (
            <>
              <p className="hint-line">One step per line · heat goes last, like [Oven 200°C fan · 25 min]</p>
              <textarea
                id="steps"
                name="steps"
                className="textarea"
                placeholder={"Get the pan properly hot\nEggs in, stir gently\nCheese at the very end"}
                value={f.steps}
                onChange={(e) => {
                  set("steps")(e);
                  grow(e.target);
                }}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="steps" value={f.steps} />
              <StepFields value={f.steps} onChange={(v) => setF((p) => ({ ...p, steps: v }))} userId={userId} onBusy={setStepBusy} />
            </>
          )}
        </div>

        <div className="pair">
          <div className="field">
            <label className="label" htmlFor="serves">Serves</label>
            <input id="serves" name="serves" className="input" placeholder="2" value={f.serves} onChange={set("serves")} inputMode="text" />
          </div>
          <div className="field">
            <label className="label" htmlFor="time">Time</label>
            <input id="time" name="time" className="input" placeholder="20 min" value={f.time} onChange={set("time")} />
            <StopwatchControl
              className="text-btn watch-start"
              label="Time the cook"
              running={cookWatch.isRunning("cook")}
              elapsed={cookWatch.elapsed("cook")}
              onStart={() => cookWatch.start("cook")}
              onStop={() => {
                const { time, unit } = watchTime(cookWatch.stop("cook"));
                setF((p) => ({ ...p, time: `${time} ${unit}` }));
              }}
              onCancel={() => cookWatch.cancel("cook")}
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="notes">
            Notes <span className="hint">The story, what to change</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            className="textarea"
            placeholder="Invented after Sam's birthday. Needs more garlic."
            value={f.notes}
            onChange={(e) => {
              set("notes")(e);
              grow(e.target);
            }}
          />
        </div>

        {state?.error && <p className="error" role="alert">{state.error}</p>}

        <button type="submit" className="btn accent block" disabled={!canSave}>
          {pending ? "Saving" : isNew ? "Save to the kitchen" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/** Switches ingredients and method between rows of boxes and one plain text box (handy for pasting). */
function TextToggle({ asText, onChange }: { asText: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="hint mode-toggle" onClick={() => onChange(!asText)}>
      {asText ? "Use boxes" : "Type as text"}
    </button>
  );
}
