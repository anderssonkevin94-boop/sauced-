import "server-only";
// Fetching a URL someone typed or shared, safely. The server only talks to public web
// servers: http(s) on the default ports, a real hostname (no bare IPs, no localhost/.local),
// and every address the name resolves to must be public. Redirects are followed by hand
// (max 4) and each hop is checked again. One time budget covers every hop and the body,
// and bodies are capped. Used by Import from link (lib/import-link.ts), the social link
// readers (lib/social.ts) and Save to Sauced (app/api/share/route.ts).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_URL = 2000;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 3_000_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const TIMEOUT_MS = 10_000;
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv,en;q=0.8",
};

export const BAD_LINK = "That link doesn't look right.";
export const CANT_OPEN = "Couldn't open that page. Check the link and try again.";
export const TOO_SLOW = "That site took too long to answer.";

/** A refusal with a friendly message; anything else thrown is logged and shown as CANT_OPEN. */
export class LinkError extends Error {
  friendly: string;
  constructor(friendly: string, detail: string) {
    super(detail);
    this.friendly = friendly;
  }
}

/** The friendly message for anything a fetch threw, logging the detail under `tag`. */
export function friendlyError(e: unknown, tag: string, href: string): string {
  if (e instanceof LinkError) {
    console.error(`${tag}:`, e.message);
    return e.friendly;
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    console.error(`${tag}: timeout`, href);
    return TOO_SLOW;
  }
  console.error(`${tag}: fetch failed`, href, e);
  return CANT_OPEN;
}

// ── The link ───────────────────────────────────────────────

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".corp", ".intranet", ".arpa"];

/** Parse and check a URL without touching the network. Throws on anything not plainly public http(s). */
export function checkUrl(raw: string): URL {
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

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip.replace(/%.*$/, ""));
  if (kind === 4) return isPublicV4(ip);
  if (kind === 6) return isPublicV6(ip);
  return false;
}

// ── Fetching ───────────────────────────────────────────────

export type FetchOptions = {
  /** Extra request headers (e.g. a consent cookie); merged over the browser-like defaults. */
  headers?: Record<string, string>;
};

/**
 * GET `start`, following redirects by hand and checking every hop. Returns the final
 * response (status 2xx, body unread) and its URL. With `stopAt`, a redirect target that
 * matches is returned as soon as it is reached, without fetching it (`res` is then null).
 */
async function follow(
  start: URL,
  signal: AbortSignal,
  headers: Record<string, string>,
  stopAt?: (u: URL) => boolean,
): Promise<{ res: Response | null; url: URL }> {
  let url = start;
  for (let hop = 0; ; hop++) {
    if (hop > 0 && stopAt?.(url)) return { res: null, url };
    await checkHost(url);
    const res = await fetch(url, { redirect: "manual", signal, headers, cache: "no-store" });

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
    return { res, url };
  }
}

/** Fetch an HTML page (redirects re-checked, 10 s, 3 MB). Throws LinkError / TimeoutError. */
export async function fetchPage(start: URL, opts: FetchOptions = {}): Promise<{ html: string; finalUrl: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS); // one budget for every hop and the body
  const { res, url } = await follow(start, signal, { ...BROWSER_HEADERS, ...opts.headers });
  if (!res) throw new LinkError(CANT_OPEN, `no response from ${url.href}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new LinkError(CANT_OPEN, `content-type "${type}" from ${url.href}`);
  }
  return { html: await readText(res, type, MAX_BYTES), finalUrl: url.href };
}

/** Fetch a JSON document, e.g. an oEmbed answer (redirects re-checked, 10 s, 1 MB). */
export async function fetchJson(start: URL, opts: FetchOptions = {}): Promise<{ json: unknown; finalUrl: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const headers = { ...BROWSER_HEADERS, Accept: "application/json,*/*;q=0.5", ...opts.headers };
  const { res, url } = await follow(start, signal, headers);
  if (!res) throw new LinkError(CANT_OPEN, `no response from ${url.href}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/json/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new LinkError(CANT_OPEN, `content-type "${type}" from ${url.href}`);
  }
  const text = await readText(res, type, MAX_JSON_BYTES);
  try {
    return { json: JSON.parse(text) as unknown, finalUrl: url.href };
  } catch {
    throw new LinkError(CANT_OPEN, `bad json from ${url.href}`);
  }
}

/**
 * Follow a short link's redirects (each hop checked) to where it points, without reading
 * the destination page once `done` says the URL is the one wanted. Returns the last URL.
 */
export async function resolveLink(start: URL, done: (u: URL) => boolean, opts: FetchOptions = {}): Promise<URL> {
  if (done(start)) return start;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const { res, url } = await follow(start, signal, { ...BROWSER_HEADERS, ...opts.headers }, done);
  await res?.body?.cancel().catch(() => {});
  return url;
}

/** The body as text, at most `max` bytes (a recipe's JSON-LD sits well inside 3 MB). */
/** Fetch a picture (redirects re-checked, 10 s, 8 MB): its bytes, or a LinkError when it isn't one. */
export async function fetchImage(start: URL): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const headers = { ...BROWSER_HEADERS, Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8" };
  const { res, url } = await follow(start, signal, headers);
  if (!res) throw new LinkError(CANT_OPEN, `no response from ${url.href}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(?:jpeg|jpg|png|webp|avif|gif)/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new LinkError(CANT_OPEN, `content-type "${type}" from ${url.href}`);
  }
  const bytes = await readBytes(res, MAX_IMAGE_BYTES + 1);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new LinkError(CANT_OPEN, `image over ${MAX_IMAGE_BYTES} bytes at ${url.href}`);
  return bytes;
}

/** The body, cut off at `max` bytes. */
async function readBytes(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= max) await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.byteLength, bytes.byteLength - at));
    bytes.set(part, at);
    at += part.byteLength;
    if (at >= bytes.byteLength) break;
  }
  return bytes;
}

async function readText(res: Response, contentType: string, max: number): Promise<string> {
  const bytes = await readBytes(res, max);
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
