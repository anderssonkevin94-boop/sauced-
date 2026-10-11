"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import "@/app/styles/cooklog.css";
import "@/app/styles/feed.css";
import "@/app/styles/list.css";
import { Camera, Close } from "@/components/icons";
import { createPost } from "@/lib/actions";
import { photoUrl } from "@/lib/config";
import { edwards } from "@/lib/parse";
import { uploadPhoto } from "@/lib/photo";

/** On your own recipe: "Post to the feed", with a photo (the cover if you don't pick one), a comment and a rating. */
export function PostRecipe({ recipeId, meId, posted, openNow = false }: { recipeId: string; meId: string; posted: boolean; openNow?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Opened straight away when the cook chose "Post it to the feed" (new recipe, a draft, or the Feed's Post button).
  const [open, setOpen] = useState(openNow);
  const [done, setDone] = useState(posted);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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

  function post() {
    setError("");
    start(async () => {
      const res = await createPost(recipeId, note, photo, rating);
      if (res.error) return setError(res.error);
      setDone(true);
      setOpen(false);
      router.push("/feed");
    });
  }

  const preview = photoUrl(photo);

  return (
    <>
      <div className="push-card">
        {done ? (
          <p>
            <b>On the feed.</b>{" "}
            <Link href="/feed" className="name-link">
              See it
            </Link>
          </p>
        ) : (
          <p>
            <b>Show it off:</b> put this recipe on the feed.
          </p>
        )}
        <button type="button" className={done ? "text-btn" : "btn accent"} onClick={() => setOpen(true)}>
          {done ? "Post again" : "Post to the feed"}
        </button>
      </div>

      <dialog ref={ref} className="shop-sheet post-sheet" aria-labelledby="post-title" onClose={() => setOpen(false)}>
        <div className="shop-sheet-top">
          <div className="topbar">
            <h2 id="post-title">Post to the feed</h2>
            <button type="button" className="text-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
        <div className="shop-sheet-body composer">
          <textarea
            className="textarea"
            rows={3}
            value={note}
            maxLength={500}
            placeholder="Say something about it"
            aria-label="Comment"
            onChange={(e) => setNote(e.target.value)}
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
          <div className="rate">
            <div className="rate-head">
              <span className="who-label">Rating</span>
              <span className="rate-value" aria-live="polite">
                {rating === null ? <span className="muted">Not rated</span> : edwards(rating)}
              </span>
              {rating !== null && (
                <button type="button" className="text-btn" onClick={() => setRating(null)}>
                  Clear
                </button>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={rating ?? 2.5}
              data-unset={rating === null || undefined}
              aria-label="Rating, 0 to 5 Edwards"
              onChange={(e) => setRating(Math.round(Number(e.target.value) * 10) / 10)}
              onPointerDown={() => rating === null && setRating(2.5)}
            />
          </div>
          <div className="composer-bar">
            {!preview && !uploading && (
              <label className="chip">
                <Camera size={16} /> Photo
                <input type="file" accept="image/*" hidden onChange={onPhoto} />
              </label>
            )}
            <span className="composer-actions">
              <button type="button" className="btn accent" disabled={pending || uploading} onClick={post}>
                {pending ? "Posting" : "Post"}
              </button>
            </span>
          </div>
          {!preview && <p className="muted post-hint">No photo? The recipe&rsquo;s cover is used.</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </dialog>
    </>
  );
}
