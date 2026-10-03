// Find the link to the written recipe in a caption, a video description or a screenshot's
// text: creators put "Full recipe: mysite.com/…" in captions, YouTube descriptions and pinned
// comments. Pure (no network, no server-only imports) so it runs under plain node for tests;
// the fetching is in lib/link-recipe.ts, through lib/safe-fetch.ts.
//
//   findRecipeLinks("Full recipe at halfbakedharvest.com/one-pot-pasta 👇 #pasta")
//     → ["https://halfbakedharvest.com/one-pot-pasta"]
//
// Links are found with or without "https://" (screenshot text has none), repaired where OCR
// broke them (spaces around dots and slashes, a slug wrapped onto the next line), cleaned of
// tracking parameters and ranked: recipe-looking paths and "full recipe" cues first. Social,
// shop, affiliate, music, link-in-bio and app store links are never candidates, nor are bare
// home pages (they can't say which recipe). Generic short links (bit.ly…) are kept: fetching
// follows their redirects.

const MAX_TEXT = 20_000;
const MAX_LINKS = 3;

/** Top-level domains accepted for links written without "https://" (OCR text). */
const TLDS = new Set(
  (
    "com net org edu gov info biz io co me ly gl gd to tv fm app blog shop store site online xyz page link bio " +
    "recipes recipe kitchen cooking food cafe club life live world today news media studio design " +
    "se no dk fi is de nl be fr it es pt ie uk ch at pl cz eu ca us au nz in jp kr sg za br mx ar cl gr hu ro sk si ee lv lt"
  ).split(" "),
);

/** Hosts that never hold the written recipe (social, shops, affiliates, music, link-in-bio, app stores…). */
const BLOCKED_HOSTS = [
  // social and video
  "instagram.com", "instagr.am", "ig.me", "tiktok.com", "youtube.com", "youtu.be", "youtube-nocookie.com",
  "facebook.com", "fb.com", "fb.me", "fb.watch", "m.me", "messenger.com", "threads.net", "threads.com", "x.com",
  "twitter.com", "t.co", "pinterest.com", "pin.it", "snapchat.com", "snap.com", "reddit.com", "redd.it",
  "linkedin.com", "lnkd.in", "twitch.tv", "vimeo.com", "discord.gg", "discord.com", "wa.me", "whatsapp.com",
  "t.me", "telegram.me", "bsky.app", "tumblr.com", "lemon8-app.com", "patreon.com", "onlyfans.com", "cameo.com",
  // shops and affiliates
  "amazon.com", "amzn.to", "amzn.eu", "amzn.com", "a.co", "shopmy.us", "shopltk.com", "liketoknow.it", "liketk.it",
  "ltk.app", "rstyle.me", "etsy.com", "etsy.me", "ikea.com", "temu.com", "aliexpress.com", "alibaba.com", "ebay.com",
  "walmart.com", "target.com", "bestbuy.com", "shopstyle.com", "howl.me", "magik.ly", "geni.us", "kit.co",
  "skimresources.com", "linksynergy.com", "prf.hn", "awin1.com", "shareasale.com", "anrdoezrs.net", "tkqlhce.com",
  "jdoqocy.com", "dpbolvw.net", "pntra.com", "sovrn.co", "collabs.shop", "shop.app", "myshopify.com",
  "hellofresh.com", "factor75.com", "factormeals.com", "everyplate.com", "greenchef.com", "homechef.com",
  "blueapron.com", "butcherbox.com", "misen.com", "madeincookware.com", "hexclad.com", "carawayhome.com",
  "fromourplace.com", "thrivemarket.com", "drinkag1.com", "athleticgreens.com", "squarespace.com", "skillshare.com",
  "nordvpn.com", "expressvpn.com", "surfshark.com", "audible.com", "joinhoney.com", "betterhelp.com", "manscaped.com",
  "amzlink.to", "barnesandnoble.com", "booksamillion.com", "bookshop.org", "hudsonbooksellers.com", "indigo.ca",
  "waterstones.com", "books.apple.com", "bookdepository.com", "adlibris.com", "bokus.com", "akademibokhandeln.se",
  // music
  "spotify.com", "spoti.fi", "music.apple.com", "podcasts.apple.com", "apple.co", "soundcloud.com", "deezer.com",
  "tidal.com", "epidemicsound.com", "artlist.io", "musicbed.com", "bandcamp.com", "shazam.com",
  // link-in-bio pages
  "linktr.ee", "beacons.ai", "beacons.page", "stan.store", "campsite.bio", "bio.link", "lnk.bio", "linkin.bio",
  "tap.bio", "msha.ke", "solo.to", "carrd.co", "hoo.be", "komi.io", "flow.page", "snipfeed.co", "linkbio.co",
  // app stores and app links
  "apps.apple.com", "itunes.apple.com", "play.google.com", "onelink.me", "app.link", "page.link", "smart.link",
  // everything else that isn't a recipe page
  "google.com", "goo.gl", "forms.gle", "maps.app.goo.gl", "gofundme.com", "paypal.com", "paypal.me", "venmo.com",
  "ko-fi.com", "buymeacoffee.com", "gmail.com", "hotmail.com", "outlook.com", "icloud.com",
];
// Amazon, IKEA and Pinterest have a domain per country (amazon.se, ikea.com/se, pinterest.co.uk…).
const BLOCKED_HOST_RE = /(?:^|\.)(?:amazon|ikea|aliexpress|ebay|pinterest|temu)\.(?:[a-z]{2,3}|com?\.[a-z]{2})$/;

/** Generic short links: kept, since fetching follows them to the real page. */
const SHORTENERS = ["bit.ly", "tinyurl.com", "shorturl.at", "rb.gy", "cutt.ly", "is.gd", "ow.ly", "buff.ly", "t.ly", "s.id", "tiny.cc", "nyti.ms", "trib.al", "dlvr.it"];

const TRACKING = /^(?:utm_.*|fbclid|gclid|dclid|msclkid|igshid|igsh|si|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|ttclid|twclid|epik|s_cid)$/i;

/** Path segments of a shop, a list or a page about the site, never one recipe ("/shop/…", "/about"). */
const BAD_SEGMENT =
  /^(?:shop|store|merch|cart|checkout|products?|collections?|discounts?|coupons?|promo|deals?|giveaways?|affiliates?|sponsors?|cookbooks?|books?|courses?|classes|masterclass|newsletter|subscribe|signup|sign-up|login|about|about-me|about-us|contact|privacy|terms|tags?|category|categories|search|author|podcasts?|gear|equipment|kitchen-tools|tools|wp-content|feed|links?|go|out|ref)$/i;
/** Words in a slug that mean a deal, whatever the rest says ("/spring-sale-20-off"). */
const BAD_SLUG_WORD = /^(?:discount|coupon|promo|giveaway|affiliate|sale|deal|deals|merch)$/i;
const FILE_PATH = /\.(?:jpe?g|png|gif|webp|heic|svg|pdf|mp4|mov|mp3|zip)$/i;

/** Cues on the link's line (or the line above) that it leads to the recipe. */
const STRONG_CUE =
  /\b(?:full|written|printable|complete|whole|detailed|entire)\s+recipes?\b|\brecipes?\s*(?:here|below|link|at|on|is|=|:|-|–|→|>)|\b(?:get|find|grab|see|read)\s+(?:the|my|this)\s+recipe\b|\brecipes?\b|\brecept(?:et)?\b|\bhela\s+receptet\b|\bopskrift\b|\brezept\b|\bricetta\b|\breceta\b|\bingredien(?:ts|ser)\b/i;
const WEAK_CUE = /\blinks?\b|\bl[äa]nk(?:en)?\b|\bblog(?:g|gen)?\b|\bwebsite\b|\bhemsida\b|\bsajt\b|👉|⬇|👇|➡|→|⤵|🔗/iu;
/** Cues that the link is a sponsor, a discount or a gear list: never the recipe. */
const BAD_CUE =
  /\b(?:use\s+(?:my\s+)?code|promo\s*code|discount|coupon|rabatt(?:kod)?|\d{1,2}\s?%\s*(?:off|rabatt)|sponsor(?:ed)?|affiliate|paid\s+partnership|commission|merch|my\s+(?:gear|equipment|kitchen\s+tools|camera)|cookware|knives|shop\s+(?:my|the)|storefront|music\s+by|song|playlist|follow\s+me|podcast)\b/i;
/** Cues that make a link worth less (but still possibly the recipe). */
const SOFT_BAD_CUE = /\b(?:subscribe|newsletter|shop|store|buy|gear|camera|instagram|tiktok|facebook|twitter|pinterest|cookbook|book|course|class|serve\s+(?:it\s+)?with|pair(?:s|ed)?\s+with|also\s+try|more\s+recipes)\b/i;

/** Words in a link's path that say "food": "/creamy-tuscan-chicken-pasta". Whole words, plural allowed. */
const FOOD_WORDS = new Set(
  (
    "chicken beef pork lamb salmon shrimp prawn tuna fish cod pasta noodle ramen rice risotto soup stew curry chili salad " +
    "bread focaccia pizza taco burrito quesadilla burger sandwich wrap cake cookie brownie muffin cupcake pie tart pancake " +
    "waffle bagel scone biscuit cheesecake pudding granola smoothie sauce pesto dressing dip hummus roast bake baked " +
    "casserole lasagna lasagne gnocchi dumpling potato egg tofu vegan vegetarian garlic lemon chocolate vanilla banana " +
    "apple cinnamon butter cream cheese mozzarella parmesan feta halloumi avocado tomato mushroom spinach broccoli " +
    "cauliflower zucchini pumpkin carrot onion bean lentil chickpea quinoa oat oatmeal breakfast lunch dinner dessert " +
    "snack bowl skillet sheet pan pot fryer slow cooker crockpot grilled fried stir fry teriyaki bulgogi tikka masala " +
    "biryani enchilada fajita kebab gyro shawarma falafel meatball steak rib wing orzo udon carbonara bolognese " +
    "alfredo frittata omelette quiche crumble cobbler loaf bun roll " +
    // Swedish
    "lax ost ägg agg paj kaka bröd brod fisk kött kott gröt grot wok bulle räkor rakor soppa gryta sallad pannkakor"
  ).split(" "),
);
/** Long food words and Swedish stems that also count inside compounds ("kycklinggryta", "chocolatechip"). */
const FOOD_STEMS =
  /chicken|chocolate|cookie|pasta|salmon|potato|cheese|lasagn|risotto|kyckling|köttbull|kottbull|fläsk|flask|torsk|soppa|gryta|sallad|bullar|kakor|tårta|tarta|pannkak|våffl|vaffl|potatis|grädd|gradd|choklad|kanel|kardemumma|vanilj|middag|frukost|efterrätt|efterratt|vegetari|vegansk|bakelse|semla|semlor|kladdkaka|chokladboll|kanelbull/i;

function looksLikeFood(path: string): boolean {
  return path
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => FOOD_WORDS.has(w) || FOOD_WORDS.has(w.replace(/(?:e?s)$/, "")) || (w.length >= 5 && FOOD_STEMS.test(w)));
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOSTS.some((d) => hostIs(h, d)) || BLOCKED_HOST_RE.test(h);
}

const isShortener = (host: string) => SHORTENERS.some((d) => hostIs(host.replace(/^www\./, ""), d));

// ── Repairing OCR'd links ──────────────────────────────────

const SPACED_TLD = "com|net|org|se|no|dk|fi|de|nl|co\\.uk|co|io|uk|fr|it|es|ca|au|nz|ie|blog|recipes|kitchen|food|me|info";

/** Undo what screenshot text recognition does to links. Conservative: only joins what can't be prose. */
export function repairLinks(text: string): string {
  return (
    text
      .normalize("NFKC")
      // An address inside another link's query, percent-encoded ("redirect_to=https%3A%2F%2Fsite.se%2Frecept%2F",
      // and in screenshot text "%3A" often reads as "%34"): decoded, and set apart so it's found on its own.
      .replace(/\bhttps?%3[a4]%2f%2f[^\s"'<>()&]+/gi, (m) => {
        const rest = m.replace(/^(https?)%3[a4]%2f%2f/i, "$1://");
        try {
          return ` ${decodeURIComponent(rest.replace(/%(?![0-9a-f]{2})/gi, "%25"))} `;
        } catch {
          return ` ${rest.replace(/%2f/gi, "/")} `;
        }
      })
      .replace(/\r\n?/g, "\n")
      .replace(/[​-‍⁠﻿]/g, "")
      // "https:// site.com", "https: //site.com"
      .replace(/\b(https?)\s*:\s*\/\s*\/\s*/gi, "$1://")
      // "halfbakedharvest . com/…", "site. se/recept" (only with a path after, and a known TLD)
      .replace(new RegExp(`\\b([a-z0-9][a-z0-9-]*)\\s*\\.\\s+(${SPACED_TLD})\\s?\\/`, "gi"), "$1.$2/")
      .replace(new RegExp(`\\b([a-z0-9][a-z0-9-]*)\\s+\\.\\s*(${SPACED_TLD})\\s?\\/`, "gi"), "$1.$2/")
      // "site.com /recipes/x", "site.com/ creamy-pasta"
      .replace(/(\.[a-z]{2,12}) \/(?=[\w-])/gi, "$1/")
      .replace(/(\.[a-z]{2,12}(?:\/[\w.%~-]+)*\/) (?=[\w%][\w%/.~-]*[\w%]-[\w%])/gi, "$1")
      // A slug wrapped onto the next line: "site.com/one-pot-\ncreamy-pasta", "site.com/\none-pot-pasta"
      .replace(/(\.[a-z]{2,12}\/(?:[\w.%~-]*\/)*[\w.%~-]*-)[ \t]*\n[ \t]*(?=[a-z0-9])/gi, "$1")
      .replace(/(\.[a-z]{2,12}\/(?:[\w.%~-]+\/)*)[ \t]*\n[ \t]*(?=[a-z0-9]+(?:-[a-z0-9]+)+)/g, "$1")
  );
}

// ── Finding them ───────────────────────────────────────────

// https://… or www.… or a bare "name.tld/…" (TLD checked afterwards). Stops at whitespace and quotes.
const LINK_RE = /\bhttps?:\/\/[^\s<>"'`|]+|(?<![\w@./-])(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>"'`|]*)?/gi;

/** Trim what isn't part of the link: emoji and anything after them, trailing punctuation, an ellipsis. */
function trimLink(raw: string): string {
  let s = raw.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️⃣].*$/su, "");
  for (let i = 0; i < 3; i++) s = s.replace(/(?:\.\.\.|…)+$/u, "").replace(/[.,;:!?)\]}>'"»”’*_~]+$/u, "");
  // A ")" is part of the link only if the link opened one (Wikipedia style).
  if (s.includes(")") && !s.includes("(")) s = s.slice(0, s.indexOf(")"));
  return s;
}

/** A parsed, cleaned https URL; null when it isn't a plausible public web link. */
export function normalizeLink(raw: string): URL | null {
  const s = trimLink(raw);
  if (!s) return null;
  const hasScheme = /^https?:\/\//i.test(s);
  let u: URL;
  try {
    u = new URL(hasScheme ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]{1,23}$/.test(host)) return null; // a name, not an address
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (!hasScheme && !TLDS.has(tld)) return null; // "e.g", "approx.5", "image.png"
  u.protocol = "https:";
  u.port = "";
  u.hostname = host;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  if (![...u.searchParams.keys()].length) u.search = "";
  return u;
}

type Candidate = { url: URL; score: number; at: number };

/** How likely this link is the written recipe; null when it never is. */
function scoreLink(u: URL, before: string, after: string, lineAbove: string): number | null {
  const host = u.hostname;
  if (isBlockedHost(host)) return null;
  const path = decodeURIComponentSafe(u.pathname).toLowerCase();
  const shortener = isShortener(host);
  if (!shortener && (path === "/" || path === "") && !u.search) return null; // a home page: which recipe?
  if (FILE_PATH.test(path) || /97[89]\d{10}/.test(u.href)) return null; // a file, or a book's ISBN

  // The words around the link on its line; the line above when the link stands alone.
  const near = `${before.slice(-80)} ${after.slice(0, 40)}`;
  const context = before.replace(/[\s\p{P}\p{S}]+/gu, "").length < 4 ? `${lineAbove.slice(-80)} ${near}` : near;
  if (BAD_CUE.test(context)) return null;

  const segments = path.split("/").filter(Boolean);
  const recipePath = /(?:^|\/)(?:recipes?|recept(?:et)?|opskrift(?:er)?|rezepte?|ricett[ae]|recetas?|r)\/[^/]/.test(path);
  if (!shortener && segments.some((s) => BAD_SEGMENT.test(s))) return null;
  if (segments.some((s) => s.split(/[-_]/).some((w) => BAD_SLUG_WORD.test(w)))) return null;

  let score = 0;
  if (recipePath || /(?:^|\.)(?:recipes?|recept)\./.test(host)) score += 3;
  const slug = path.replace(/\/+$/, "").split("/").pop() ?? "";
  if (looksLikeFood(path)) score += 2;
  if (/^[a-z0-9åäöæøéü%]+(?:-[a-z0-9åäöæøéü%]+){2,}$/.test(slug)) score += 1; // a blog post's slug
  if (/(?:recipe|recept|kitchen|kok|food|cook|bake|eat|chef|kitchn|mat|fika|baka)/i.test(host)) score += 1;
  if (STRONG_CUE.test(context)) score += 4;
  else if (WEAK_CUE.test(context)) score += 1;
  if (SOFT_BAD_CUE.test(context) && !STRONG_CUE.test(context)) score -= 2;
  if (shortener) score -= 1; // unknown destination
  return score;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Links in `text` that may lead to the written recipe, best first, at most 3, as https URLs.
 * Empty when there are none ("link in bio" has no link to follow).
 */
export function findRecipeLinks(text: string): string[] {
  if (typeof text !== "string" || !text) return [];
  const fixed = repairLinks(text.slice(0, MAX_TEXT));
  const lines = fixed.split("\n");
  const found = new Map<string, Candidate>();
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // The nearest non-empty line above, for "Full recipe:\nhttps://…".
    let above = "";
    for (let j = i - 1; j >= 0 && j >= i - 2; j--) if (lines[j].trim()) { above = lines[j]; break; }
    for (const m of line.matchAll(LINK_RE)) {
      const start = m.index ?? 0;
      const raw = m[0];
      if (/^mailto:/i.test(raw) || line[start - 1] === "@") continue;
      const u = normalizeLink(raw);
      if (!u) continue;
      const score = scoreLink(u, line.slice(0, start), line.slice(start + raw.length), above);
      if (score === null) continue;
      const key = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
      const prev = found.get(key);
      if (!prev) found.set(key, { url: u, score, at: at++ });
      else if (score > prev.score) prev.score = score;
    }
  }
  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_LINKS)
    .map((c) => c.url.href);
}

/** "halfbakedharvest.com" for a credit line or a message. */
export function linkSite(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
