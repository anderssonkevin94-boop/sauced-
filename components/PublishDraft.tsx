"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishRecipe } from "@/lib/actions";

/** On your own draft: "only you can see this", and the button that shows it to the kitchen. */
export function PublishDraft({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="push-card">
      <p>
        <b>Draft.</b> Only you can see this until you publish it.
      </p>
      <button
        type="button"
        className="btn accent"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await publishRecipe(recipeId);
          setBusy(false);
          if (res.error) setError(res.error);
          else router.refresh();
        }}
      >
        {busy ? "Publishing" : "Publish"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
