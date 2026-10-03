"use client";
import "@/app/styles/editor.css";
import { useEffect, useState, useTransition } from "react";
import { IngredientFields } from "@/components/IngredientFields";
import { StepFields } from "@/components/StepFields";
import { saveLines } from "@/lib/actions";

export type Editing = {
  field: "steps" | "ingredients";
  /** Step number (0-based, sections not counted) to put the cursor in. */
  focusStep?: number;
  /** Open with a new blank step after this one (-1: at the very start), cursor in it. */
  insertAfter?: number;
};

/**
 * The step cards (or the ingredients) over the page, for changes on the fly: edit, drag to
 * reorder, add, remove. Saves only that part of the recipe. Used by the recipe page and cook mode.
 */
export function EditSheet({
  recipeId,
  meId,
  editing,
  initial,
  onClose,
  onSaved,
}: {
  recipeId: string;
  meId: string;
  editing: Editing;
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const changed = text !== initial;

  // The page behind shouldn't scroll along.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function save() {
    setError("");
    start(async () => {
      const res = await saveLines(recipeId, editing.field, text);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  function cancel() {
    if (changed && !confirm("Throw away your changes?")) return;
    onClose();
  }

  return (
    <div className="edit-sheet" role="dialog" aria-modal="true" aria-label={editing.field === "steps" ? "Edit steps" : "Edit ingredients"}>
      <div className="topbar edit-sheet-top">
        <button type="button" className="text-btn" onClick={cancel}>Cancel</button>
        <span className="eyebrow">{editing.field === "steps" ? "Steps" : "Ingredients"}</span>
        <button type="button" className="text-btn primary" disabled={!changed || busy || pending} onClick={save}>
          {pending ? "Saving" : "Save"}
        </button>
      </div>
      <div className="edit-sheet-body">
        {editing.field === "steps" ? (
          <>
            <p className="hint-line">Drag a card by its number to move it. × removes it.</p>
            <StepFields
              value={text}
              onChange={setText}
              userId={meId}
              focusStep={editing.focusStep}
              insertAfter={editing.insertAfter}
              onBusy={setBusy}
            />
          </>
        ) : (
          <IngredientFields value={text} onChange={setText} />
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
