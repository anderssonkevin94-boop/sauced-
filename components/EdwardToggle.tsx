"use client";
import { useBeta } from "@/lib/beta-flag";
import { setEdwardHidden, useEdwardHidden } from "@/lib/edward-hidden";

/** You tab (Beta): turn Edward's help button on or off on this phone (off to begin with). */
export function EdwardToggle() {
  const beta = useBeta();
  const hidden = useEdwardHidden();
  if (!beta) return null;
  return (
    <div className="push-card">
      <p>
        <b>Edward</b> {hidden ? "the helper is off on this phone." : "the helper shows on every page."}
      </p>
      <button type="button" className="text-btn primary" onClick={() => setEdwardHidden(!hidden)}>
        {hidden ? "Show him" : "Hide him"}
      </button>
    </div>
  );
}
