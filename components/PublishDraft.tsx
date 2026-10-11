"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishRecipe } from "@/lib/actions";
import { useBeta } from "@/lib/beta-flag";

/** On your own draft: "only you can see this", and the button that shows it to the kitchen. */
export function PublishDraft({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const beta = useBeta();

  async function publish(post: boolean) {
    setBusy(true);
    const res = await publishRecipe(recipeId);
    setBusy(false);
    if (res.error) return setError(res.error);
    // "Publish & post": back to the recipe with the post sheet open.
    if (post) router.replace(`/r/${recipeId}?post=1`);
    router.refresh();
  }
  return (
    <div className="push-card">
      <p>
        <b>Draft.</b> Only you can see this until you publish it.
      </p>
      <span className="publish-actions">
        <button type="button" className={beta ? "text-btn" : "btn accent"} disabled={busy} onClick={() => publish(false)}>
          {busy ? "Publishing" : "Publish"}
        </button>
        {beta && (
          <button type="button" className="btn accent" disabled={busy} onClick={() => publish(true)}>
            Publish &amp; post
          </button>
        )}
      </span>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
