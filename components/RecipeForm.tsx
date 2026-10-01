"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, Close, Seal, Spark } from "@/components/icons";
import type { FormState } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { uploadPhoto } from "@/lib/photo";
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
}: {
  action: Action;
  recipe?: Recipe;
  userId: string;
  cancelHref: string;
  heading: string;
}) {
  const isNew = !recipe;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [f, setF] = useState<Fields>(() => fromRecipe(recipe));
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // A half-typed recipe at 1am should survive a closed tab.
  useEffect(() => {
    if (!isNew) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as Fields;
        if (draft.title || draft.ingredients || draft.steps || draft.notes) {
          setF(draft);
          setRestored(true);
        }
      }
    } catch {}
  }, [isNew]);

  useEffect(() => {
    formRef.current?.querySelectorAll("textarea").forEach(grow);
    if (!isNew) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
    } catch {}
  }, [f, isNew]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setF(fromRecipe());
    setRestored(false);
  };

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

  const canSave = f.title.trim().length > 0 && !uploading && !pending;
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
            <span>Picked up your unsaved draft.</span>
            <button type="button" onClick={discardDraft}>Start over</button>
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
          <label className="label" htmlFor="ingredients">
            Ingredients <span className="hint">One per line</span>
          </label>
          <textarea
            id="ingredients"
            name="ingredients"
            className="textarea"
            placeholder={"2 eggs\nA fistful of parmesan\nWhatever hot sauce was open"}
            value={f.ingredients}
            onChange={(e) => {
              set("ingredients")(e);
              grow(e.target);
            }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="steps">
            Method <span className="hint">One step per line</span>
          </label>
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
        </div>

        <div className="pair">
          <div className="field">
            <label className="label" htmlFor="serves">Serves</label>
            <input id="serves" name="serves" className="input" placeholder="2" value={f.serves} onChange={set("serves")} inputMode="text" />
          </div>
          <div className="field">
            <label className="label" htmlFor="time">Time</label>
            <input id="time" name="time" className="input" placeholder="20 min" value={f.time} onChange={set("time")} />
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
