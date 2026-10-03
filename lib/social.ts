import "server-only";
// Readers for links shared from social apps. A video's recipe usually lives in its caption
// (TikTok) or description (YouTube), so these return that text plus a credit line for
// textToRecipe (lib/text-recipe.ts) to structure. Every request goes through lib/safe-fetch.ts.
//
//   TikTok    public oEmbed (https://www.tiktok.com/oembed?url=…): `title` is the full caption.
//             Short links (vm./vt.tiktok.com, tiktok.com/t/…) are followed to the video first.
//   YouTube   the watch page's ytInitialPlayerResponse.videoDetails (title, description, channel).
//   Pinterest the pin's outbound link (the recipe site), which the caller then imports.
//   Instagram, Facebook, Threads: posts sit behind a login, so a friendly "send a screenshot".
// Anything else is not social: the caller reads it as a recipe page (JSON-LD).

import { decodeEntities } from "@/lib/recipe-jsonld";
import { BAD_LINK, LinkError, checkUrl, fetchJson, fetchPage, resolveLink } from "@/lib/safe-fetch";

export type SocialPlatform = "tiktok" | "youtube" | "pinterest" | "instagram" | "facebook" | "threads";

export type SocialRead =
  /** Text to structure with textToRecipe. */
  | { kind: "text"; site: string; text: string; source: string; url: string; titleHint: string; recipeLinks: string[] }
  /** The post just points at a recipe page (Pinterest): import that instead. */
  | { kind: "link"; site: string; url: URL };

const LOGIN_WALL = (name: string) => `${name} doesn't let apps read posts. Share a screenshot of the caption instead.`;
const TIKTOK_FAILED = "Couldn't read that TikTok. It may be private or deleted.";
const YOUTUBE_FAILED = "Couldn't read that YouTube video. It may be private or age-restricted.";
const PIN_NO_LINK = "That pin doesn't link to a recipe page. Open the pin's website and share that instead.";
const PIN_NOT_A_PIN = "Share a single pin, not a board or profile.";

const MAX_TEXT = 20_000;

// ── Which app ──────────────────────────────────────────────

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** The social app a link belongs to, or null for an ordinary web page. */
export function socialPlatform(u: URL): SocialPlatform | null {
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (hostIs(host, "tiktok.com")) return "tiktok";
  if (hostIs(host, "youtube.com") || hostIs(host, "youtu.be") || hostIs(host, "youtube-nocookie.com")) return "youtube";
  if (host === "pin.it" || /(^|\.)pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host)) return "pinterest";
  if (hostIs(host, "instagram.com") || hostIs(host, "instagr.am")) return "instagram";
  if (hostIs(host, "facebook.com") || hostIs(host, "fb.com") || hostIs(host, "fb.watch")) return "facebook";
  if (hostIs(host, "threads.net") || hostIs(host, "threads.com")) return "threads";
  return null;
}

/** Read what a social link says. Throws LinkError (with a friendly message) when it can't. */
export async function readSocial(u: URL, platform: SocialPlatform): Promise<SocialRead> {
  switch (platform) {
    case "tiktok":
      return readTikTok(u);
    case "youtube":
      return readYouTube(u);
    case "pinterest":
      return readPinterest(u);
    case "instagram":
      throw new LinkError(LOGIN_WALL("Instagram"), `login wall ${u.href}`);
    case "facebook":
      throw new LinkError(LOGIN_WALL("Facebook"), `login wall ${u.href}`);
    case "threads":
      throw new LinkError(LOGIN_WALL("Threads"), `login wall ${u.href}`);
  }
}

// ── TikTok ─────────────────────────────────────────────────

const TIKTOK_POST = /^\/@[^/]*\/(?:video|photo)\/(\d{6,25})/;

/** "https://www.tiktok.com/@user/video/123" from any form of a post URL, or null. */
export function tiktokPostUrl(u: URL): string | null {
  const m = TIKTOK_POST.exec(u.pathname);
  if (m) return `https://www.tiktok.com${m[0]}`;
  const legacy = /^\/v\/(\d{6,25})(?:\.html)?/.exec(u.pathname); // m.tiktok.com/v/123.html
  if (legacy) return `https://www.tiktok.com/@/video/${legacy[1]}`;
  return null;
}

async function readTikTok(u: URL): Promise<SocialRead> {
  let post = tiktokPostUrl(u);
  if (!post) {
    // A short link: vm.tiktok.com/ZM…, vt.tiktok.com/…, www.tiktok.com/t/…
    const to = await resolveLink(u, (x) => socialPlatform(x) === "tiktok" && tiktokPostUrl(x) !== null);
    post = tiktokPostUrl(to);
    if (!post) throw new LinkError(TIKTOK_FAILED, `tiktok short link went to ${to.href}`);
  }

  let json: unknown;
  try {
    ({ json } = await fetchJson(new URL(`https://www.tiktok.com/oembed?url=${encodeURIComponent(post)}`)));
  } catch (e) {
    if (e instanceof LinkError) throw new LinkError(TIKTOK_FAILED, `tiktok oembed: ${e.message}`);
    throw e;
  }
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const caption = typeof o.title === "string" ? o.title : "";
  if (!caption.trim()) throw new LinkError(TIKTOK_FAILED, `tiktok oembed without caption for ${post}`);

  const handle =
    (typeof o.author_unique_id === "string" && o.author_unique_id) ||
    (typeof o.author_url === "string" && /\/@([^/?#]+)/.exec(o.author_url)?.[1]) ||
    "";
  const name = typeof o.author_name === "string" ? o.author_name.trim() : "";
  const credit = handle ? `@${handle}` : name;
  const url = handle ? post.replace("/@/", `/@${handle}/`) : post;
  const text = cleanCaption(caption);
  return {
    kind: "text",
    site: "TikTok",
    text,
    source: credit ? `TikTok · ${credit}` : "TikTok",
    url,
    titleHint: captionTitle(text),
    recipeLinks: [],
  };
}

/**
 * TikTok's oEmbed caption arrives on one line: put list markers ("▪️", "•", "1️⃣") back
 * on lines of their own and drop the trailing run of hashtags. textToRecipe does the rest.
 */
export function cleanCaption(caption: string): string {
  return caption
    .replace(/\r\n?/g, "\n")
    .replace(/\s*[▪▫◾◽•▸►🔸🔹]\uFE0F?\s*/gu, "\n- ")
    .replace(/\s*(\d{1,2})\uFE0F?\u20E3\s*/g, "\n$1. ") // keycap numbers 1️⃣ → "1. "
    .replace(/\s*\u{1F51F}\s*/gu, "\n10. ") // 🔟
    .replace(/(?:\s*#[^\s#]+)+\s*$/u, "") // trailing hashtags
    .replace(/\n-[ \t]*(?=\n|$)/g, "") // a marker with nothing after it
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/** The caption's first line, if it's short enough to be a name ("Lemon pasta 🍋"). */
function captionTitle(text: string): string {
  // "🍋 LEMON PASTA 🍋 Stop eating…" → "LEMON PASTA"; "Mom's potatoes✨ For the Potatoes:" → "Mom's potatoes"
  const first = text.split("\n")[0].replace(/#[^\s#]+/g, "");
  const chunk = first
    .split(/\p{Extended_Pictographic}|[.!?]\s/u)
    .map((c) => c.replace(/[\uFE0F\u200D]/g, "").trim())
    .find((c) => c.length >= 3);
  return chunk && chunk.length <= 80 && !chunk.endsWith(":") ? chunk : "";
}

// ── YouTube ────────────────────────────────────────────────

/** The 11-character video id from watch, youtu.be, shorts, live and embed links. */
export function youtubeId(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (hostIs(host, "youtu.be")) return ok(u.pathname.split("/")[1]);
  const v = ok(u.searchParams.get("v"));
  if (v) return v;
  const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
  return ok(m?.[1]);
}

type VideoDetails = { title: string; description: string; author: string; playable: boolean };

/** Find `ytInitialPlayerResponse = {…}` in the page and parse just that object (no eval). */
export function youtubeDetails(html: string): VideoDetails | null {
  const at = html.search(/ytInitialPlayerResponse\s*=\s*\{/);
  if (at < 0) return null;
  const json = balancedObject(html, html.indexOf("{", at));
  if (!json) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const d = (o.videoDetails ?? {}) as Record<string, unknown>;
  const status = ((o.playabilityStatus ?? {}) as Record<string, unknown>).status;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  if (!s(d.title) && !s(d.shortDescription)) return null;
  return { title: s(d.title), description: s(d.shortDescription), author: s(d.author), playable: status === "OK" };
}

/** The JSON object starting at `start` (a "{"), respecting strings; null if it never closes. */
function balancedObject(s: string, start: number): string | null {
  if (start < 0 || s[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+\.\S+/gi;
const HAS_URL = /\bhttps?:\/\/\S+|\bwww\.\S+\.\S+/i;
const CHAPTER_RE = /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?(?:\s|$)/;
const PROMO_RE =
  /\b(?:sponsor(?:ed)?|affiliate|promo code|discount code|use (?:my )?code|paid partnership|patreon|merch|amazon storefront|subscribe|newsletter|business inquir(?:y|ies)|#ad)\b/i;
const SOCIAL_LABEL_RE = /^(?:instagram|insta|tiktok|facebook|twitter|x|threads|pinterest|website|blog|shop|email|snapchat)\s*[:\-–]?\s*$/i;

/** A light clean of a video description: chapters, links, sponsor and "follow me" lines out. */
export function cleanDescription(text: string): string {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    if (CHAPTER_RE.test(line)) continue;
    if (PROMO_RE.test(line)) continue;
    const hadLink = HAS_URL.test(line);
    const rest = line.replace(URL_RE, "").replace(/@[\w.]+/g, "").trim();
    if (hadLink && (rest.length < 3 || /[:\-–→👉⬇️]\s*$/u.test(rest) || SOCIAL_LABEL_RE.test(rest))) continue;
    if (SOCIAL_LABEL_RE.test(rest)) continue;
    if (/^(?:#[^\s#]+\s*)+$/u.test(line)) continue; // a line of hashtags
    out.push(hadLink ? line.replace(URL_RE, "").replace(/\s{2,}/g, " ").trim() : line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
}

/**
 * Links in a description that likely lead to the written recipe ("Full recipe: https://…"),
 * not to the creator's other profiles. At most `max`, in order.
 */
export function recipeLinks(text: string, max = 2): string[] {
  const out: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const line = lines[i];
    // The link may sit on the line after its label ("Recipe:\nhttps://…").
    const label = `${lines[i - 1] ?? ""} ${line}`;
    if (!/\b(?:recipes?|recept|ingredients?|printable|written|blog)\b/i.test(label)) continue;
    for (const m of line.match(/\bhttps?:\/\/[^\s<>"')]+/gi) ?? []) {
      const href = m.replace(/[.,;:!?]+$/, "");
      try {
        const u = new URL(href);
        if (socialPlatform(u) || /(^|\.)(?:amzn\.to|amazon\.[a-z.]+|linktr\.ee|patreon\.com|spotify\.com|apple\.com)$/i.test(u.hostname)) continue;
        if (!out.includes(u.href)) out.push(u.href);
      } catch {
        // not a URL
      }
      if (out.length >= max) break;
    }
  }
  return out;
}

/** "Garlic Gnocchi (Recipe in Description) #shorts" → "Garlic Gnocchi". */
export function cleanVideoTitle(title: string): string {
  return title
    .replace(/#[^\s#]+/g, "")
    .replace(/[([]?\s*(?:full\s+)?recipe\s+(?:is\s+)?(?:in|below|in the)\s+(?:the\s+)?(?:description|comments?)(?:\s+and\s+(?:the\s+)?(?:description|comments?))?[^)\]]*[)\]]?/gi, "")
    .replace(/\s*[|·-]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function readYouTube(u: URL): Promise<SocialRead> {
  const id = youtubeId(u);
  if (!id) throw new LinkError(YOUTUBE_FAILED, `no youtube video id in ${u.href}`);
  const watch = `https://www.youtube.com/watch?v=${id}`;
  let html: string;
  try {
    // SOCS=CAI is "reject all" on YouTube's EU cookie consent page, which would otherwise
    // answer servers in Europe (Vercel dub1) instead of the video.
    ({ html } = await fetchPage(new URL(watch), { headers: { Cookie: "SOCS=CAI" } }));
  } catch (e) {
    if (e instanceof LinkError) throw new LinkError(YOUTUBE_FAILED, `youtube page: ${e.message}`);
    throw e;
  }
  const d = youtubeDetails(html);
  if (!d) throw new LinkError(YOUTUBE_FAILED, `no ytInitialPlayerResponse for ${id}`);
  const title = cleanVideoTitle(d.title);
  const description = cleanDescription(d.description);
  const isShort = /^\/shorts\//.test(u.pathname);
  return {
    kind: "text",
    site: "YouTube",
    text: title && description ? `${title}\n\n${description}` : title || description,
    source: d.author ? `YouTube · ${d.author}` : "YouTube",
    url: isShort ? `https://www.youtube.com/shorts/${id}` : watch,
    titleHint: title,
    recipeLinks: recipeLinks(d.description),
  };
}

// ── Pinterest ──────────────────────────────────────────────

const isPinPath = (u: URL) => /^\/pin\/[^/]+/.test(u.pathname);

/** The pin's outbound link (the site it was saved from), or null. */
export function pinOutboundLink(html: string): string | null {
  const metas = new Map<string, string>();
  const re = /<meta\b([^>]*)>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[1]);
    if (name && content && !metas.has(name)) metas.set(name, decodeEntities(content[1] ?? content[2] ?? "").trim());
  }
  const candidates = [metas.get("pinterestapp:source"), metas.get("og:see_also")];
  const fromJson = /"link"\s*:\s*"(https?:[^"\\]*(?:\\.[^"\\]*)*)"/.exec(html)?.[1];
  if (fromJson) {
    try {
      candidates.push(JSON.parse(`"${fromJson}"`) as string);
    } catch {
      // ignore a malformed string
    }
  }
  for (const c of candidates) {
    if (!c || !/^https?:\/\//i.test(c)) continue;
    try {
      const host = new URL(c).hostname.toLowerCase();
      if (/(^|\.)pinterest\.|^pin\.it$|(^|\.)pinimg\.com$/.test(host)) continue;
      return c;
    } catch {
      // not a URL
    }
  }
  return null;
}

async function readPinterest(u: URL): Promise<SocialRead> {
  let pin = u;
  if (!isPinPath(pin)) {
    // pin.it short links: pin.it/x → api.pinterest.com/url_shortener/x/redirect/ → www.pinterest.com/pin/…
    if (pin.hostname.toLowerCase() !== "pin.it") throw new LinkError(PIN_NOT_A_PIN, `pinterest non-pin ${u.href}`);
    pin = await resolveLink(u, (x) => socialPlatform(x) === "pinterest" && isPinPath(x));
    if (!isPinPath(pin)) throw new LinkError(PIN_NOT_A_PIN, `pin.it went to ${pin.href}`);
  }
  const { html } = await fetchPage(pin);
  const link = pinOutboundLink(html);
  if (!link) throw new LinkError(PIN_NO_LINK, `pin without outbound link ${pin.href}`);
  try {
    return { kind: "link", site: "Pinterest", url: checkUrl(link) };
  } catch (e) {
    throw new LinkError(BAD_LINK, `pin links to refused url ${link}: ${e instanceof Error ? e.message : e}`);
  }
}
