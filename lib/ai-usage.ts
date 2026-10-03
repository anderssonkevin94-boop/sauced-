import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";

// What Claude costs the kitchen: every call's tokens, priced here and logged with
// log_ai_usage() (supabase/schema.sql), for the owner's card on the You tab. The app's own
// count at list prices; console.anthropic.com has the exact bill.
//
// Calls from the app come with a member's session. The share sheet has none, so it runs its
// work inside withImportKey() and the key vouches for the log instead.

/** $ per million tokens, and per web search. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const WEB_SEARCH = 10 / 1000;

/** Enough of a Messages API response to price it. */
type Billed = {
  model: string;
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    server_tool_use?: { web_search_requests?: number | null } | null;
  };
};

const keyStore = new AsyncLocalStorage<{ key: string }>();

/** Runs `fn` with the share sheet's import key standing in for a session when logging. */
export function withImportKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return keyStore.run({ key }, fn);
}

/** The price of one response at list prices. Unknown models are priced as Sonnet. */
export function costOf(res: Billed): number {
  const p = PRICES[res.model.replace(/-\d{8}$/, "")] ?? PRICES["claude-sonnet-5-5"];
  const u = res.usage;
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
      1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH
  );
}

/** Logs a Claude call. Never throws: a failed log mustn't fail an import. */
export async function recordUsage(purpose: "tidy" | "import" | "discover", res: Billed): Promise<void> {
  if (DEMO) return;
  try {
    const key = keyStore.getStore()?.key ?? null;
    const sb = key ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : await supabaseServer();
    const u = res.usage;
    const { error } = await sb.rpc("log_ai_usage", {
      key,
      purpose,
      model: res.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      web_searches: u.server_tool_use?.web_search_requests ?? 0,
      cost_usd: Math.round(costOf(res) * 1_000_000) / 1_000_000,
    });
    if (error) console.error("ai-usage: log failed", error.code, error.message);
  } catch (e) {
    console.error("ai-usage: log failed", e);
  }
}

export type AiSpend = { monthUsd: number; totalUsd: number; monthCalls: number; totalCalls: number; creditsUsd: number | null };

/** The owner's spending summary; null for everyone else (the database gives them nothing). */
export async function aiSpend(): Promise<AiSpend | null> {
  if (DEMO) return { monthUsd: 0.214, totalUsd: 0.346, monthCalls: 9, totalCalls: 14, creditsUsd: 10 };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("ai_spend");
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return {
    monthUsd: Number(row.month_usd),
    totalUsd: Number(row.total_usd),
    monthCalls: Number(row.month_calls),
    totalCalls: Number(row.total_calls),
    creditsUsd: row.credits_usd === null ? null : Number(row.credits_usd),
  };
}
