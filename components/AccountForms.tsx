"use client";
import { useActionState } from "react";
import { clearOfflineCopies } from "@/components/Pwa";
import { joinKitchen, renameMe, signOut } from "@/lib/actions";

export function RenameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameMe, undefined);
  return (
    <form action={action} className="field" style={{ marginTop: 20 }}>
      <label className="label" htmlFor="name">Your name</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="name" name="name" className="input" defaultValue={name} maxLength={40} autoComplete="nickname" />
        <button className="btn ghost" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut} onSubmit={clearOfflineCopies}>
      <button className="btn ghost block">Sign out</button>
    </form>
  );
}

export function JoinForm() {
  const [state, action, pending] = useActionState(joinKitchen, undefined);
  return (
    <form action={action}>
      <input className="input" name="name" placeholder="Your name" autoComplete="nickname" maxLength={40} required autoFocus />
      <input className="input" name="code" placeholder="Kitchen code" autoCapitalize="none" autoCorrect="off" required />
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn accent block" disabled={pending}>{pending ? "Joining" : "Join the kitchen"}</button>
    </form>
  );
}
