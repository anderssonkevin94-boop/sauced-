"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Email codes rather than magic links: a link opens Safari, not the home-screen app,
// so the sign-in would land in the wrong place on iPhone.
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="auth">
      <h1 className="wordmark">
        Sauced<i>.</i>
      </h1>
      <p className="lede">The recipes you make up, and the ones you swear by.</p>

      {!sent ? (
        <form onSubmit={send}>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button className="btn accent block" disabled={busy || !email}>
            {busy ? "Sending" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="muted" style={{ fontSize: 15 }}>We sent a code to {email}.</p>
          <input
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
          />
          {error && <p className="error">{error}</p>}
          <button className="btn accent block" disabled={busy || code.length < 6}>
            {busy ? "Checking" : "Sign in"}
          </button>
          <button type="button" className="text-btn" onClick={() => { setSent(false); setCode(""); setError(""); }}>
            Use a different email
          </button>
        </form>
      )}
    </main>
  );
}
