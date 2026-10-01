"use server";
// Import from link: read the recipe data most recipe sites embed in the page
// (schema.org Recipe JSON-LD), convert it to metric with plain code, and return it
// as form fields. No AI, no account, no key.
//
// The server fetches a URL someone typed, so it only talks to public web servers:
// http(s) on the default ports, a real hostname (no bare IPs, no localhost/.local),
// and every address the name resolves to must be public. Redirects are followed by
// hand (max 4) and each hop is checked again. The parsing lives in lib/recipe-jsonld.ts
// and the unit conversion in lib/metric.ts.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { TidyFields } from "@/lib/tidy";
import { requireMe } from "@/lib/data";
import { recipeFromHtml } from "@/lib/recipe-jsonld";

export type LinkSource = {
  title: string; // the recipe's name on the site
  site: string; // site name, e.g. "ICA", "BBC Good Food"
  url: string; // final page url (after redirects)
  rating: number | null; // aggregate rating out of 5 if the page has one
  ratingCount: number | null;
};

export type LinkImportResult = { ok: true; fields: TidyFields; source: LinkSource } | { ok: false; error: string };

const MAX_URL = 2000;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv,en;q=0.8",
};

const BAD_LINK = "That link doesn't look right.";
const CANT_OPEN = "Couldn't open that page. Check the link and try again.";
const TOO_SLOW = "That site took too long to answer.";
const NO_RECIPE = "Couldn't find a recipe on that page. Try another site.";

/** A refusal with a friendly message; anything else thrown is logged and shown as CANT_OPEN. */
class LinkError extends Error {
  friendly: string;
  constructor(friendly: string, detail: string) {
    super(detail);
    this.friendly = friendly;
  }
}

/** Fetch a recipe page and turn its embedded recipe data into metric form fields. */
export async function importFromLink(url: string): Promise<LinkImportResult> {
  await requireMe(); // only kitchen members (outside the try: it redirects by throwing)

  let start: URL;
  try {
    start = checkUrl(typeof url === "string" ? url : "");
  } catch (e) {
    console.error("import-link: bad url", e instanceof Error ? e.message : e);
    return { ok: false, error: BAD_LINK };
  }

  try {
    const { html, finalUrl } = await fetchPage(start);
    const recipe = recipeFromHtml(html, finalUrl);
    if (!recipe) {
      console.error("import-link: no Recipe JSON-LD", finalUrl);
      return { ok: false, error: NO_RECIPE };
    }
    return { ok: true, fields: recipe.fields, source: recipe.source };
  } catch (e) {
    if (e instanceof LinkError) {
      console.error("import-link:", e.message);
      return { ok: false, error: e.friendly };
    }
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      console.error("import-link: timeout", start.href);
      return { ok: false, error: TOO_SLOW };
    }
    console.error("import-link: fetch failed", start.href, e);
    return { ok: false, error: CANT_OPEN };
  }
}

// ── The link ───────────────────────────────────────────────

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".corp", ".intranet", ".arpa"];

/** Parse and check a URL without touching the network. Throws on anything not plainly public http(s). */
function checkUrl(raw: string): URL {
  let text = raw.trim();
  if (!text || text.length > MAX_URL) throw new Error(`length ${text.length}`);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`; // "ica.se/recept/..." typed without a scheme
  const u = new URL(text);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`protocol ${u.protocol}`);
  if (u.username || u.password) throw new Error("credentials in url");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error(`port ${u.port}`);
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isIP(host.replace(/^\[|\]$/g, "")) || /^[\d.]+$/.test(host) || host.startsWith("[")) {
    throw new Error(`ip host ${host}`);
  }
  if (!host.includes(".") || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error(`blocked host ${host}`);
  }
  u.hash = "";
  return u;
}

/** Resolve the hostname and refuse unless every address is public. */
async function checkHost(u: URL): Promise<void> {
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(u.hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new LinkError(CANT_OPEN, `dns ${u.hostname}: ${e instanceof Error ? e.message : e}`);
  }
  if (!addrs.length) throw new LinkError(CANT_OPEN, `dns ${u.hostname}: no addresses`);
  const bad = addrs.find((a) => !isPublicAddress(a.address));
  if (bad) throw new LinkError(BAD_LINK, `non-public address ${bad.address} for ${u.hostname}`);
}

// ── Addresses ──────────────────────────────────────────────

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}

function isPublicV4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast 224/4, reserved 240/4, broadcast
  return true;
}

/** "::ffff:7f00:1" → [0,0,0,0,0,0xffff,0x7f00,1]. Handles "::" and a trailing dotted IPv4. */
function ipv6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    s = s.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const n = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return n.length === 8 && n.every((x) => Number.isFinite(x)) ? n : null;
}

function isPublicV6(ip: string): boolean {
  const h = ipv6Hextets(ip);
  if (!h) return false;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (h.slice(0, 7).every((x) => x === 0)) return false; // :: and ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return isPublicV4(v4(h[6], h[7])); // IPv4-mapped
  if (h.slice(0, 6).every((x) => x === 0)) return false; // IPv4-compatible (deprecated)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return isPublicV4(v4(h[6], h[7])); // NAT64
  if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((h[0] & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (h[0] === 0x2002) return isPublicV4(v4(h[1], h[2])); // 6to4 wraps an IPv4 address
  return true;
}

function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip.replace(/%.*$/, ""));
  if (kind === 4) return isPublicV4(ip);
  if (kind === 6) return isPublicV6(ip);
  return false;
}

// ── Fetching ───────────────────────────────────────────────

async function fetchPage(start: URL): Promise<{ html: string; finalUrl: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS); // one budget for every hop and the body
  let url = start;
  for (let hop = 0; ; hop++) {
    await checkHost(url);
    const res = await fetch(url, { redirect: "manual", signal, headers: HEADERS, cache: "no-store" });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const location = res.headers.get("location");
      if (!location) throw new LinkError(CANT_OPEN, `redirect without location from ${url.href}`);
      if (hop >= MAX_REDIRECTS) throw new LinkError(CANT_OPEN, `too many redirects from ${start.href}`);
      try {
        url = checkUrl(new URL(location, url).href);
      } catch (e) {
        throw new LinkError(BAD_LINK, `redirect to refused url ${location}: ${e instanceof Error ? e.message : e}`);
      }
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new LinkError(CANT_OPEN, `http ${res.status} from ${url.href}`);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
      await res.body?.cancel().catch(() => {});
      throw new LinkError(CANT_OPEN, `content-type "${type}" from ${url.href}`);
    }
    return { html: await readText(res, type), finalUrl: url.href };
  }
}

/** The body as text, at most MAX_BYTES (a recipe's JSON-LD sits well inside that). */
async function readText(res: Response, contentType: string): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= MAX_BYTES) await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.byteLength, bytes.byteLength - at));
    bytes.set(part, at);
    at += part.byteLength;
    if (at >= bytes.byteLength) break;
  }
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
