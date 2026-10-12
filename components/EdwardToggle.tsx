"use client";
import { useBeta } from "@/lib/beta-flag";
import { setEdwardHidden, useEdwardHidden } from "@/lib/edward-hidden";

/** You tab (Beta): show or hide Edward's help button on this phone. */
export function EdwardToggle() {
  const beta = useBeta();
  const hidden = useEdwardHidden();
  if (!beta) return null;
  return (
    <div className="push-card">
      <p>
        <b>Edward</b> {hidden ? "is hidden on this phone." : "the helper shows on every page."}
      </p>
      <button type="button" className="text-btn primary" onClick={() => setEdwardHidden(!hidden)}>
        {hidden ? "Show him" : "Hide him"}
      </button>
    </div>
  );
}
