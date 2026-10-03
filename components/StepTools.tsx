"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil, Plus, Reorder, Trash } from "@/components/icons";
import { saveLines } from "@/lib/actions";
import { uploadPhoto } from "@/lib/photo";
import { sectionName, withoutStep } from "@/lib/recipe";
import { joinStep, splitStep } from "@/lib/step";
import type { Editing } from "@/components/EditSheet";

/**
 * The quiet "Edit" under a step card, which opens into: edit, add a step after, reorder,
 * remove. `open`/`onOpen` let a page keep the tools open from card to card while you work.
 */
export function StepTools({
  recipeId,
  userId,
  steps,
  index,
  step,
  open,
  onOpen,
  onEdit,
  compact = false,
}: {
  recipeId: string;
  /** The signed-in cook, for photo uploads. */
  userId: string;
  /** All the recipe's step lines, for removing one. */
  steps: string[];
  /** The step's index in sectionize order (what cook mode and the recipe page use). */
  index: number;
  /** The step's number among steps only (0-based), for the editor's focus. */
  step: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  onEdit: (e: Editing) => void;
  /** In a list of steps: shorter labels, and Reorder and Done live once by the heading instead. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  // This step's line, found the way sectionize counts (headings don't count).
  let n = -1;
  const at = steps.findIndex((l) => !sectionName(l) && ++n === index);
  const hasPhoto = at >= 0 && !!splitStep(steps[at]).photo;

  /** A photo straight onto this step, saved right away. */
  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || at < 0) return;
    setError("");
    setUploading(true);
    try {
      const photo = await uploadPhoto(file, userId);
      const next = [...steps];
      next[at] = joinStep({ ...splitStep(steps[at]), photo });
      const res = await saveLines(recipeId, "steps", next.join("\n"));
      if (res.error) setError(res.error);
      else router.refresh();
    } catch {
      setError("That photo didn't upload. Try another.");
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    if (!confirm("Remove this step from the recipe?")) return;
    setError("");
    start(async () => {
      const res = await saveLines(recipeId, "steps", withoutStep(steps, index).join("\n"));
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="card-tools closed" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="card-edit" onClick={() => onOpen(true)}>
          <Pencil size={14} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="card-tools" role="group" aria-label="Change this step" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="chip" onClick={() => onEdit({ field: "steps", focusStep: step })}>
        <Pencil size={15} /> {compact ? "Edit" : "Edit text"}
      </button>
      <label className="chip" aria-disabled={uploading || undefined}>
        <Camera size={15} /> {uploading ? "Adding photo" : hasPhoto ? "New photo" : "Photo"}
        <input type="file" accept="image/*" hidden disabled={uploading} onChange={addPhoto} />
      </label>
      <button type="button" className="chip" onClick={() => onEdit({ field: "steps", insertAfter: step })}>
        <Plus size={15} /> {compact ? "Add after" : "Step after"}
      </button>
      {!compact && (
        <button type="button" className="chip" onClick={() => onEdit({ field: "steps" })}>
          <Reorder size={15} /> Reorder
        </button>
      )}
      <button type="button" className="chip danger" disabled={pending} onClick={remove}>
        <Trash size={15} /> {pending ? "Removing" : "Remove"}
      </button>
      {!compact && (
        <button type="button" className="text-btn primary done" onClick={() => onOpen(false)}>
          Done
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
