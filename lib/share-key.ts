"use server";
// The cook's personal import key for the "Save to Sauced" Shortcut (see lib/share-api.ts
// and supabase/share.sql). The key is shown once, right after it's made; only a hash is stored.
import { DEMO } from "@/lib/config";
import { requireMe } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";

export type KeyResult = { ok: true; key: string } | { ok: false; error: string };
export type DoneResult = { ok: true } | { ok: false; error: string };

const DEMO_ERROR = "Save to Sauced isn't available in demo mode.";

/** Make (or replace) the signed-in cook's key. The old key stops working. */
export async function createImportKey(): Promise<KeyResult> {
  await requireMe();
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("new_import_key");
  if (error || typeof data !== "string" || !data) {
    return { ok: false, error: "Couldn't make a key. Try again in a moment." };
  }
  return { ok: true, key: data };
}

/** Turn off Save to Sauced for the signed-in cook. */
export async function revokeImportKey(): Promise<DoneResult> {
  await requireMe();
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("revoke_import_key");
  if (error) return { ok: false, error: "Couldn't turn it off. Try again in a moment." };
  return { ok: true };
}

/** Whether the signed-in cook has a key. False in demo mode or if the check fails. */
export async function hasImportKey(): Promise<boolean> {
  await requireMe();
  if (DEMO) return false;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("has_import_key");
  return !error && data === true;
}
