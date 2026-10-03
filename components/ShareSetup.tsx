"use client";
import { useRef, useState } from "react";
import "@/app/styles/share.css";
import { Check } from "@/components/icons";
import { SHORTCUT_ICLOUD_URL } from "@/lib/share-api";
import { createImportKey, revokeImportKey } from "@/lib/share-key";

type Busy = "create" | "revoke" | null;

const FIND_IT = "If you don't see it, scroll the share sheet to the end and tap Edit Actions… to add it.";

export function ShareSetup({ connected: initiallyConnected }: { connected: boolean }) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [key, setKey] = useState<string | null>(null); // only right after making it
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);
  const keyBox = useRef<HTMLDivElement>(null);

  async function makeKey(replace: boolean) {
    if (replace && !confirm("Your old key stops working; paste the new one into the Shortcut.")) return;
    setBusy("create");
    setError(null);
    setCopied(null);
    try {
      const res = await createImportKey();
      if (res.ok) {
        setKey(res.key);
        setConnected(true);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't reach Sauced. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    if (!confirm("Turn off Save to Sauced? The Shortcut stops working until you set it up again.")) return;
    setBusy("revoke");
    setError(null);
    try {
      const res = await revokeImportKey();
      if (res.ok) {
        setKey(null);
        setConnected(false);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't reach Sauced. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function selectKey() {
    const el = keyBox.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
  }

  async function copyKey() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied("yes");
    } catch {
      selectKey();
      setCopied("manual");
    }
  }

  return (
    <section className="card section share">
      <p className="label">Save from other apps</p>
      <p className="share-pitch">Share a TikTok, YouTube link or a screenshot to Sauced from any app.</p>

      {key ? (
        <ol className="share-steps">
          <li>
            <div className="share-step-body">
              <p className="share-step-title">Copy your key</p>
              <div
                ref={keyBox}
                className="share-key"
                onClick={selectKey}
                translate="no"
                spellCheck={false}
              >
                {key}
              </div>
              <button type="button" className="btn accent block" onClick={copyKey}>
                {copied === "yes" ? (
                  <>
                    <Check size={18} /> Copied
                  </>
                ) : (
                  "Copy key"
                )}
              </button>
              {copied === "manual" && (
                <p className="share-note" role="status">Couldn&apos;t copy automatically. The key is selected, tap Copy.</p>
              )}
              <p className="share-warn">Keep this to yourself — it lets the Shortcut save recipes as you.</p>
              <p className="share-note">You won&apos;t see this key again. Make a new one any time.</p>
            </div>
          </li>
          <li>
            <div className="share-step-body">
              <p className="share-step-title">Put the Shortcut on your phone</p>
              <a className="btn ghost block" href={SHORTCUT_ICLOUD_URL}>Add the Shortcut</a>
              <p className="share-note">When it asks, paste your key.</p>
            </div>
          </li>
          <li>
            <div className="share-step-body">
              <p className="share-step-title">Then in any app: Share → Save to Sauced.</p>
              <p className="share-note">{FIND_IT}</p>
            </div>
          </li>
        </ol>
      ) : connected ? (
        <div className="share-connected">
          <p className="share-status">
            <span className="share-dot" aria-hidden="true"><Check size={14} /></span>
            Connected
          </p>
          <p className="share-note">In any app: Share → Save to Sauced. {FIND_IT}</p>
          <p className="share-note">Your key is hidden for safety. Need it again? Make a new one.</p>
        </div>
      ) : (
        <ol className="share-steps">
          <li>
            <span>Tap <b>Set it up</b> to make your personal key, then copy it.</span>
          </li>
          <li>
            <span>Add the Shortcut. When it asks, paste your key.</span>
          </li>
          <li>
            <span>Then in any app: Share → Save to Sauced. {FIND_IT}</span>
          </li>
        </ol>
      )}

      {error && <p className="error share-error" role="alert">{error}</p>}

      {key ? (
        <button type="button" className="btn ghost block share-done" onClick={() => {
            setKey(null);
            setError(null);
          }}>
          Done
        </button>
      ) : connected ? (
        <div className="share-actions">
          <a className="btn ghost block" href={SHORTCUT_ICLOUD_URL}>Add the Shortcut again</a>
          <div className="share-row">
            <button type="button" className="btn ghost" onClick={() => makeKey(true)} disabled={busy !== null}>
              {busy === "create" ? "Making…" : "New key"}
            </button>
            <button type="button" className="btn danger" onClick={turnOff} disabled={busy !== null}>
              {busy === "revoke" ? "Turning off…" : "Turn off"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn accent block share-go"
          onClick={() => makeKey(false)}
          disabled={busy !== null}
        >
          {busy === "create" ? "Setting up…" : "Set it up"}
        </button>
      )}

      <ul className="share-tips">
        <li>Instagram: share a screenshot of the caption — Instagram doesn&apos;t let apps read posts.</li>
        <li>Recipes that are only spoken in a video can&apos;t be read.</li>
      </ul>
    </section>
  );
}
