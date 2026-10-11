"use client";
import { useRouter } from "next/navigation";
import { setBeta, useBeta } from "@/lib/beta-flag";

/** The owner's switch for trying new features on this phone before everyone gets them. */
export function BetaToggle() {
  const on = useBeta();
  const router = useRouter();
  function flip() {
    setBeta(!on);
    router.refresh();
  }
  return (
    <div className="push-card">
      <p>
        <b>Beta {on ? "is on" : "is off"}</b> on this phone. {on ? "You see the new features; nobody else does." : "Try new features here before everyone gets them."}
      </p>
      <button type="button" className={on ? "text-btn" : "btn accent"} onClick={flip}>
        {on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
