"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Close, Flame } from "@/components/icons";
import { HeatPanel } from "@/components/StepFields";
import { saveLines } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { uploadPhoto } from "@/lib/photo";
import { sectionName, withoutStep } from "@/lib/recipe";
import { joinStep, splitStep, switchAppliance, type Heat } from "@/lib/step";

/**
 * Cook mode's step, editable where it stands: the words, heat and time, and the photo,
 * with Cancel and Save where Back and Next were. Renders cook mode's body and bottom bar.
 */
export function StepCardEditor({
  recipeId,
  userId,
  steps,
  index,
  stepCount,
  onDone,
}: {
  recipeId: string;
  userId: string;
  /** All the recipe's step lines. */
  steps: string[];
  /** The step's index in sectionize order (section headings don't count). */
  index: number;
  stepCount: number;
  onDone: () => void;
}) {
  const router = useRouter();
  let n = -1;
  const at = steps.findIndex((l) => !sectionName(l) && ++n === index);
  const [start] = useState(() => splitStep(steps[at] ?? ""));
  const [text, setText] = useState(start.text);
  const [heat, setHeat] = useState<Heat | null>(start.heat);
  const [heatOpen, setHeatOpen] = useState(false);
  const [photo, setPhoto] = useState(start.photo);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startSave] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  const line = joinStep({ text: text.replace(/\s*\n\s*/g, " "), heat, photo });
  const changed = line !== joinStep(start);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    grow(el);
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      setPhoto(await uploadPhoto(file, userId));
    } catch {
      setError("That photo didn't upload. Try another.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    if (at < 0) return onDone();
    // Emptied out: that's removing the step.
    if (!text.trim() && !confirm("Remove this step from the recipe?")) return;
    setError("");
    const next = text.trim() ? steps.map((l, i) => (i === at ? line : l)) : withoutStep(steps, index);
    startSave(async () => {
      const res = await saveLines(recipeId, "steps", next.join("\n"));
      if (res.error) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  function cancel() {
    if (changed && !confirm("Throw away your changes to this step?")) return;
    onDone();
  }

  const preview = photoUrl(photo);

  return (
    <>
      <div className="cook-body">
        <div className="cook-screen step-editing">
          <p className="eyebrow cook-meta">
            Editing step {index + 1} of {stepCount}
          </p>
          <textarea
            ref={box}
            className="cook-step cook-step-input"
            value={text}
            rows={2}
            aria-label={`Step ${index + 1}`}
            placeholder="What happens in this step?"
            onChange={(e) => {
              setText(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              // A step is one line: Enter saves.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
            }}
          />

          {heat || heatOpen ? (
            <HeatPanel
              heat={heat}
              onAppliance={(a) => heat?.appliance !== a && setHeat(switchAppliance(heat, a))}
              onChange={setHeat}
              onClose={() => {
                setHeat(null);
                setHeatOpen(false);
              }}
            />
          ) : null}

          {(preview || uploading) && (
            <div className="step-photo cook-edit-photo">
              {preview && <img src={preview} alt="" />}
              {uploading && <span className="busy">Adding photo</span>}
              {preview && !uploading && (
                <button type="button" className="icon-btn" aria-label="Remove photo" onClick={() => setPhoto(null)}>
                  <Close size={16} />
                </button>
              )}
            </div>
          )}

          <div className="card-tools">
            {!heat && !heatOpen && (
              <button type="button" className="chip" onClick={() => setHeatOpen(true)}>
                <Flame size={15} /> Heat &amp; time
              </button>
            )}
            {!uploading && (
              <label className="chip">
                <Camera size={15} /> {preview ? "New photo" : "Photo"}
                <input type="file" accept="image/*" hidden onChange={addPhoto} />
              </label>
            )}
          </div>

          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>

      <nav className="cook-nav" aria-label="Save or cancel">
        <button type="button" className="btn ghost" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="btn accent" disabled={pending || uploading || !changed} onClick={save}>
          {pending ? "Saving" : "Save step"}
        </button>
      </nav>
    </>
  );
}

function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}
