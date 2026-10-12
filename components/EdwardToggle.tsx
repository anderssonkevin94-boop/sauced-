"use client";
import { setEdwardHidden, useEdwardHidden } from "@/lib/edward-hidden";

/** You tab: turn Edward's help button on or off on this phone (off to begin with). */
export function EdwardToggle() {
  const hidden = useEdwardHidden();
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
