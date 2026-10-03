"use client";
import "@/app/styles/together.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RecipePicker } from "@/components/RecipePicker";
import type { Recipe } from "@/lib/types";

/** "Cook together…": pick the other recipes to make alongside this one, then start. Pairings come first. */
export function TogetherPicker({
  current,
  recipes,
  pairs = [],
}: {
  current: Pick<Recipe, "id" | "title">;
  recipes: Pick<Recipe, "id" | "title" | "photoUrl">[];
  pairs?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="text-btn together-open" onClick={() => setOpen(true)}>
        + Cook together with another recipe
      </button>
      {open && (
        <RecipePicker
          heading="Cook together"
          lede={
            <>
              With <b>{current.title}</b>. Pick what else you&rsquo;re making; the steps get lined up so it&rsquo;s all ready at once.
            </>
          }
          recipes={recipes}
          exclude={[current.id]}
          suggested={pairs}
          max={5}
          confirm={(n) => (n ? `Cook ${n + 1} recipes together` : "Pick at least one more")}
          onConfirm={(ids) => router.push(`/cook?r=${[current.id, ...ids].join(",")}`)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
