"use client";
import { useState, useTransition } from "react";
import { setAiCredits } from "@/lib/actions";
import type { AiSpend } from "@/lib/ai-usage";

/** "$0.81" for spend; small amounts get a third decimal so a few öre still shows. */
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

/**
 * The kitchen owner's Claude spending: this month, all time, and what's left of the credits
 * they've bought. Only rendered for the owner (the database hands nobody else the numbers).
 */
export function AiSpendCard({ spend }: { spend: AiSpend }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(spend.creditsUsd?.toString() ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const left = spend.creditsUsd !== null ? spend.creditsUsd - spend.totalUsd : null;
  const used = spend.creditsUsd ? Math.min(1, spend.totalUsd / spend.creditsUsd) : null;

  function save() {
    const n = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setError("A dollar amount, like 10.");
    setError("");
    start(async () => {
      const res = await setAiCredits(n);
      if (res.error) setError(res.error);
      else setEditing(false);
    });
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="eyebrow">Claude spending</h2>
        <span className="eyebrow">Only you see this</span>
      </div>
      <div className="ai-card">
        <div className="ai-stats">
          <div>
            <span className="v">{usd(spend.monthUsd)}</span>
            <span className="l">This month · {spend.monthCalls} {spend.monthCalls === 1 ? "call" : "calls"}</span>
          </div>
          <div>
            <span className="v">{usd(spend.totalUsd)}</span>
            <span className="l">All time · {spend.totalCalls} {spend.totalCalls === 1 ? "call" : "calls"}</span>
          </div>
          {left !== null && (
            <div>
              <span className="v" data-low={left < 1 || undefined}>{usd(Math.max(0, left))}</span>
              <span className="l">Left of {usd(spend.creditsUsd!)}</span>
            </div>
          )}
        </div>
        {used !== null && (
          <div className="ai-bar" aria-hidden="true">
            <i style={{ width: `${used * 100}%` }} />
          </div>
        )}

        {editing ? (
          <div className="ai-credits">
            <label>
              <span>Credits bought ($)</span>
              <input className="input" inputMode="decimal" value={value} placeholder="10" onChange={(e) => setValue(e.target.value)} autoFocus />
            </label>
            <button type="button" className="text-btn" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn accent" disabled={pending} onClick={save}>{pending ? "Saving" : "Save"}</button>
          </div>
        ) : (
          <button type="button" className="text-btn primary ai-edit" onClick={() => setEditing(true)}>
            {spend.creditsUsd === null ? "Add the credits you've bought" : "Topped up? Update credits"}
          </button>
        )}
        {error && <p className="error">{error}</p>}
        <p className="ai-note">Sauced&rsquo;s own count at list prices. console.anthropic.com has the exact bill.</p>
      </div>
    </section>
  );
}
