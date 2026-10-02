"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Google sign-in first. Email codes stay as the fallback (rather than magic links: a link
// opens Safari, not the home-screen app, so the sign-in would land in the wrong place).
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(location.search).get("error") === "google") {
      setError("Google sign-in didn't go through. Try again, or use an email code.");
    }
  }, []);

  async function google() {
    setBusy(true);
    setError("");
    // Same-window redirect: on iPhone this keeps the sign-in inside the home-screen app.
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setBusy(false);
      setError("Couldn't start Google sign-in. Try again, or use an email code.");
    }
  }

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

      {!sent && (
        <>
          <button type="button" className="btn block google-btn" onClick={google} disabled={busy}>
            <GoogleG />
            Continue with Google
          </button>
          <p className="auth-or">or use an email code</p>
        </>
      )}

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
            {busy ? "One moment" : "Email me a code"}
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

/** Google's "G", in its own colours as Google asks for sign-in buttons. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
