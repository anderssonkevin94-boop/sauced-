// POST /api/share: "Save to Sauced" from the iPhone share sheet. An Apple Shortcut sends a
// shared link or text (a copied caption, or a screenshot's text read on the phone) with the
// cook's personal import key; this turns it into a recipe and saves it to the kitchen.
// The contract (request, response, messages) is in lib/share-api.ts.
//
// Authenticated by the import key, not cookies (proxy.ts lets this path through). The key is
// checked with the database BEFORE any URL is fetched, so this can't be used as an open
// fetch proxy. Expected failures answer 200 with { ok: false, message } because the Shortcut
// just shows `message`; only malformed requests get a 400. Details go to the server log.
//
// A caption, description or screenshot that points at the written recipe ("Full recipe:
// mysite.com/…") is saved from that page (lib/recipe-links.ts finds the link), crediting both.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { withImportKey } from "@/lib/ai-usage";
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { isRecipe, recipeFromLink, recipeFromTextLinks, safeTextToRecipe, structurePass } from "@/lib/link-recipe";
import { toLines } from "@/lib/parse";
import { checkUrl } from "@/lib/safe-fetch";
import { IMPORT_KEY_PREFIX, type ShareResponse } from "@/lib/share-api";
import { PLATFORM_NAMES, socialPlatform } from "@/lib/social";
import type { TidyFields } from "@/lib/tidy";

// Reading the page within 22 s, then Claude structuring it (when a key is set) within the rest.
export const maxDuration = 60;
/** Claude's structuring must be done by this long into a request, leaving time to save. */
const STRUCTURE_DEADLINE_MS = 52_000;
/** No linked page is fetched after this long into a request, leaving time to save. */
const LINKS_DEADLINE_MS = 22_000;

const MAX_BODY = 200_000; // bytes
const MAX_TEXT = 20_000; // chars
const KEY_RE = new RegExp(`^${IMPORT_KEY_PREFIX}[0-9a-f]{48}$`); // supabase/share.sql: 'sauced_' + 24 random bytes in hex

const NOT_CONNECTED =
  "This Shortcut isn't connected to Sauced. Open Sauced → You → Save from other apps to set it up again.";
const NO_RECIPE = "Couldn't find a recipe in that. Try a screenshot of the ingredients and steps.";
const DEMO_MODE = "Sauced is in demo mode.";
const BAD_REQUEST = "That share didn't come through right. Try again.";
const NOTHING = "Nothing to save: share a link, some text or a screenshot.";
const TOO_MANY = "That's a lot of recipes at once. Try again in a few minutes.";
const TRY_LATER = "Couldn't reach Sauced right now. Try again in a moment.";
const SAVE_FAILED = "Couldn't save that recipe. Try again in a moment.";

function reply(body: ShareResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const fail = (message: string, status = 200) => reply({ ok: false, message }, status);

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  // 1. The key's shape, before anything else.
  // Trimmed: a pasted key may carry a stray space or newline.
  const key = (req.headers.get("authorization") ?? "").trim().replace(/^Bearer\s+/i, "").trim();
  if (!KEY_RE.test(key)) return fail(NOT_CONNECTED); // 200: the Shortcut shows how to fix it

  // 2. The body: JSON, at most 200 KB, a url and/or text.
  const body = await readBody(req);
  if (body === "too big") return fail("That's too much to save in one go. Share less text.", 400);
  if (body === null) return fail(BAD_REQUEST, 400);
  const input = readInput(body);
  if (typeof input === "string") return fail(input, 400);

  if (DEMO) return fail(DEMO_MODE);

  // 3. Abuse limits (per server instance), then whose key it is.
  const keyId = createHash("sha256").update(key).digest("hex");
  if (!allow(keyHits, keyId, 20)) return fail(TOO_MANY);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (badKeyHits.get(ip) && !allow(badKeyHits, ip, 30, false)) return fail(TOO_MANY);

  const sb = supabase();
  const owner = await sb.rpc("import_key_owner", { key });
  if (owner.error) {
    console.error("share: import_key_owner failed", owner.error.code, owner.error.message);
    return fail(TRY_LATER);
  }
  if (typeof owner.data !== "string") {
    allow(badKeyHits, ip, 30); // count failed keys per address
    return fail(NOT_CONNECTED);
  }

  // 4. Read the recipe: the link first, then the text (only now that the key is known).
  // Claude's part is logged for the owner's spending card under this key (no session here).
  const found = await withImportKey(key, async () => {
    const read = await readShared(input, t0);
    return read.ok ? { ...read, fields: await structurePass(read.fields, "share", t0 + STRUCTURE_DEADLINE_MS) } : read;
  });
  if (!found.ok) return fail(found.message);

  // 5. Save it as the key's owner.
  const f = found.fields;
  const title = f.title.replace(/\s+/g, " ").trim().slice(0, 120) || "Shared recipe";
  const lines = (s: string) => toLines(s).slice(0, 150).map((l) => l.slice(0, 1000));
  const saved = await sb.rpc("import_recipe", {
    key,
    title,
    ingredients: lines(f.ingredients),
    steps: lines(f.steps),
    notes: f.notes.trim().slice(0, 5000),
    serves: f.serves.trim().slice(0, 100),
    total_time: f.time.trim().slice(0, 100),
  });
  if (saved.error || typeof saved.data !== "string") {
    console.error("share: import_recipe failed", saved.error?.code, saved.error?.message);
    return fail(SAVE_FAILED);
  }
  revalidatePath("/");
  return reply({
    ok: true,
    message: `Saved to Sauced: ${title}${found.from ? ` (from ${found.from})` : ""}`,
    title,
    recipeUrl: `${req.nextUrl.origin}/r/${saved.data}`,
  });
}

// ── The request ────────────────────────────────────────────

/** The parsed JSON body; null when it isn't JSON; "too big" past MAX_BODY. */
async function readBody(req: NextRequest): Promise<unknown | null | "too big"> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY) return "too big";
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return "too big";
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

type Input = { url: string; text: string };

/** The url and text, or a message for a malformed request. */
function readInput(body: unknown): Input | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return BAD_REQUEST;
  const b = body as Record<string, unknown>;
  if ((b.url !== undefined && b.url !== null && typeof b.url !== "string") || (b.text !== undefined && b.text !== null && typeof b.text !== "string")) {
    return BAD_REQUEST;
  }
  let url = typeof b.url === "string" ? b.url.trim() : "";
  let text = typeof b.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";

  // Apps often share "Look at this! https://vm.tiktok.com/…" as text, or put it in the url field.
  if (url && !/^https?:\/\//i.test(url)) url = firstUrl(url) ?? url;
  if (!url && text) {
    const found = firstUrl(text);
    if (found && text.replace(found, "").trim().length < 300) url = found;
  }
  if (url.length > 2000) url = "";
  if (!url && !text) return NOTHING;
  if (url && text === url) text = "";
  return { url, text };
}

/** The shared link for the notes' credit line, only if it's a plain public web address. */
function creditUrl(url: string): string | undefined {
  if (!url) return undefined;
  try {
    return checkUrl(url).href;
  } catch {
    return undefined;
  }
}

function firstUrl(s: string): string | null {
  return /\bhttps?:\/\/[^\s<>"]+/i.exec(s)?.[0].replace(/[.,;:!?)\]]+$/, "") ?? null;
}

/** "Screenshot" for text read off a phone screen (status bar, short broken lines), else "Shared text". */
function textSource(text: string): "Screenshot" | "Shared text" {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const top = lines.slice(0, 4).join(" ");
  if (/^\d{1,2}[:.]\d{2}\b/.test(lines[0] ?? "") || /\b(?:5G|4G|LTE|\d{1,3} ?%)\b/.test(top)) return "Screenshot";
  if (lines.length >= 8) {
    const short = lines.filter((l) => l.length <= 40 && !/[.!?:]$/.test(l)).length;
    if (short / lines.length > 0.6) return "Screenshot";
  }
  return "Shared text";
}

// ── Reading it ─────────────────────────────────────────────

/** `from`: the recipe site's name, when the recipe came from a page the post or text links to. */
type Found = { ok: true; fields: TidyFields; from?: string } | { ok: false; message: string };

async function readShared({ url, text }: Input, t0: number): Promise<Found> {
  const deadline = t0 + LINKS_DEADLINE_MS;
  let urlError = "";
  if (url) {
    const res = await recipeFromLink(url, "share", { deadline });
    if (res.ok) return { ok: true, fields: res.fields, from: linkedSite(url, res.source) };
    urlError = res.error;
  }
  if (text) {
    const source = textSource(text);
    const credit = creditUrl(url);
    const r = safeTextToRecipe(text, { source, url: credit }, "share");
    // "Full recipe: mysite.com/…" in the text: the written recipe beats the text.
    const linked = await recipeFromTextLinks(text, {
      tag: "share",
      deadline,
      credit: textCredit(source, credit),
      skip: url ? [url] : [],
      caption: r,
    });
    if (linked) return { ok: true, fields: linked.fields, from: linked.source.site || undefined };
    if (r && isRecipe(r)) return { ok: true, fields: r.fields };
    console.error("share: no recipe in text", source, `${text.length} chars`, `confidence ${r?.confidence ?? "error"}`);
  }
  // The link's reason ("Instagram doesn't let apps read posts…") says more than the text's.
  return { ok: false, message: urlError || NO_RECIPE };
}

/** The site's name when a social link's recipe came from another page (the one its caption links to). */
function linkedSite(shared: string, source: { site: string; url: string }): string | undefined {
  try {
    if (!socialPlatform(new URL(shared)) || socialPlatform(new URL(source.url))) return undefined;
  } catch {
    return undefined;
  }
  return source.site || undefined;
}

/** The notes' second line for a recipe found through a link in shared text. */
function textCredit(source: "Screenshot" | "Shared text", url: string | undefined): string {
  if (url) {
    const platform = socialPlatform(new URL(url));
    return `Shared from ${platform ? PLATFORM_NAMES[platform] : new URL(url).hostname.replace(/^www\./, "")}: ${url}`;
  }
  return source === "Screenshot" ? "From a screenshot" : "From shared text";
}

// ── Supabase, as nobody ────────────────────────────────────

let client: SupabaseClient | undefined;

/** The anon client with no user session: the import key is the only credential. */
function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

// ── Rate limits ────────────────────────────────────────────
// In memory, per server instance: a burst guard, not a quota. Vercel may run several
// instances and recycles them, so the real ceiling is higher and resets on cold starts.

const WINDOW_MS = 10 * 60_000;
const MAX_TRACKED = 5_000;
const keyHits = new Map<string, number[]>(); // 20 shares per key per 10 min
const badKeyHits = new Map<string, number[]>(); // 30 unknown keys per address per 10 min

/** Whether another hit is allowed under `limit` per window; records it when `record`. */
function allow(map: Map<string, number[]>, id: string, limit: number, record = true): boolean {
  const now = Date.now();
  const hits = (map.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    map.set(id, hits);
    return false;
  }
  if (record) hits.push(now);
  if (hits.length) map.set(id, hits);
  else map.delete(id);
  if (map.size > MAX_TRACKED) {
    for (const [k, v] of map) if (!v.some((t) => now - t < WINDOW_MS)) map.delete(k);
    if (map.size > MAX_TRACKED) map.delete(map.keys().next().value as string);
  }
  return true;
}
