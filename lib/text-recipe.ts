// Turn free text (a social media caption, OCR'd screenshot text, a YouTube description,
// a pasted message) into the app's recipe fields with plain rules — no AI, no account.
// Pure module: runs in the browser (screenshot import) and on the server (link import).
//
// The steps, roughly:
// 1. Clean each line: emojis and bullets out (remembered as "this was a list item"),
//    keycap numbers to "1.", hashtags, @mentions, links, app chrome ("Reply", "2d",
//    "12.3K"), sponsor text and "link in bio" chatter. Repair OCR wraps.
// 2. Walk the lines with a small state machine: headings (English and Swedish) switch
//    between ingredients, method, notes and skipped blocks (chapters, gear, socials).
//    Without headings, lines are judged by their look: an amount first → ingredient,
//    an imperative sentence → step.
// 3. Finish: ingredient lines amount-first and metric (lib/metric), steps split into
//    sentences when long, serves/time from "Serves 4", "Tid: 30 min", "Prep 10 · Cook 20".
// Nothing is invented: every ingredient, amount and step comes from the text.

import { parseAmount } from "@/lib/recipe";
import { ingredientToMetric, textToMetric } from "@/lib/metric";
import type { TidyFields } from "@/lib/tidy";

export type TextRecipeOptions = {
  /** Where it came from, for the notes credit line, e.g. "TikTok · @someone" or "Screenshot". */
  source?: string;
  /** Link to credit in the notes, if any. */
  url?: string;
  /** A title to use when the text has no obvious one (e.g. the video title). */
  titleHint?: string;
};

export type TextRecipeResult = {
  fields: TidyFields;
  /** 0–1: how sure the rules are this is a recipe (found ingredient amounts, headings, steps). */
  confidence: number;
};

const MAX_TEXT = 20_000;
const MAX_LINES = 200;
const MAX_LINE = 600;
const MAX_TITLE = 120;
const MAX_NOTES = 5;

type Line = { text: string; bullet: boolean; num: number | null; blank: boolean };
type Step = { text: string; numbered: boolean; heading?: boolean };
type Meta = { serves: string; total: number | null; totalHi: number | null; prep: number | null; cook: number | null };

// ── Patterns ───────────────────────────────────────────────

const EMOJI_CHARS = String.raw`\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}\uFE0E\uFE0F\u20E3\u200D♪♫♬`;
const EMOJI_RUN = new RegExp(`[${EMOJI_CHARS}]+`, "gu");
const STARTS_EMOJI = new RegExp(`^\\s*[${EMOJI_CHARS}]`, "u");
const BULLET_CHARS = String.raw`\-–—*•·∙●○◦‣⁃▪▫■□◆◇►▶▸▹➤➔➜→⇒⇨✓✔☑✗✘★☆✦✧❖>+`;
const LEAD = new RegExp(`^(?:[${BULLET_CHARS}${EMOJI_CHARS}]\\s*)+`, "u");

// One number, the same shapes lib/recipe.ts reads: "1 1/2", "1½", "½", "1/2", "1.5", "12".
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛⅕]|[½⅓⅔¼¾⅛⅕]|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(?:g|gr|grams?|kg|mg|ml|cl|dl|l|liters?|litres?|msk|tsk|krm|tbsp|tbs|tsp|cups?|oz|lbs?|pounds?|st|stk|pcs|pieces?|cloves?|klyftor|klyfta|burkar|burk|cans?|tins?|förp|förpackningar|förpackning|paket|pkt|nypor|nypa|pinch(?:es)?|knippen?|bunch(?:es)?|skivor|skiva|slices?|kvistar|kvist|sprigs?|handfuls?|näve|sticks?)`;
const AMOUNT_ONLY = new RegExp(`^(?:ca\\.?\\s*|~\\s*)?${NUM}(?:\\s*[-–]\\s*${NUM})?(?:\\s*${UNIT}\\.?)?$`, "iu");
const TRAILING_AMOUNT = new RegExp(
  `^([^\\d(][^\\d]{0,50}?)\\s*(?:[-–—:=]\\s*|\\(\\s*|\\s+)((?:ca\\.?\\s*)?${NUM}(?:\\s*[-–]\\s*${NUM})?)(\\s*${UNIT}\\.?)?\\s*\\)?$`,
  "iu",
);
const GLUED_UNIT = new RegExp(`^((?:ca\\.?\\s*)?${NUM})(g|kg|ml|cl|dl|l|msk|tsk|krm|st)(?![\\p{L}])`, "iu");
// "Step 1:", "Steg 2", "(3)", "4.", "5)", "6 - Boil".
const NUM_MARK = /^(?:(?:step|steg|stage)\s*(\d{1,2})\s*[:.)\-–]?\s*|\((\d{1,2})\)\s*|#?(\d{1,2})\s*[.)](?!\d)\s*|(\d{1,2})\s*[-–:]\s+(?=\p{L}))/iu;

const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|se|ly|to|co|io|net|org|me|link|gl|tv|be|nu|app)\/\S*/giu;
const ZERO_WIDTH = /[\u200B\u200C\u2060\uFEFF\u00AD]/g;
const SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]/g;

// Headings that run into the text on one line: "…so good! Ingredients: pasta, …".
const INLINE_HEAD =
  /(?<=\S)[ \t]+((?:here'?s\s+|här är\s+)?(?:what\s+|vad\s+)?(?:ingredients|ingredienser|du behöver|you(?:'ll|’ll| will)? need|method|instructions|directions|gör så här|så gör du|instruktioner|tillagning)\s*:)/giu;

// ── Words ──────────────────────────────────────────────────

const EN_VERBS =
  "add arrange assemble bake baste beat blanch blend blitz boil braise bring broil brush caramelise caramelize char chill chop coat combine cook cool cover crack crisp crumble crush cut deglaze deseed dice dip discard dissolve divide drain dredge drizzle drop dust empty finish flatten flip fluff fold form fry garnish grab grate grease grill grind halve heat insert knead ladle layer leave let line load marinate massage measure melt microwave mince mix move open pat peel pick pierce pipe pit place plate poach pop portion pour preheat prep prepare press prick pulse puree purée put reduce refrigerate reheat remove repeat reserve rest return rinse roast roll rub saute sauté scatter scoop score scrape sear season separate serve set shake shape shred sieve sift simmer skewer skim slice slide smash smear soak soften spoon spray spread sprinkle squeeze stack start steam steep stir strain stuff swirl take taste tear thicken thread throw toast top toss transfer trim turn use wash whip whisk wipe wrap zest get keep make give allow check continue fill lay lower pull raise replace slather smother store sweat tuck wilt";
const SV_VERBS =
  "baka blanda blötlägg bred bryn bräsera börja dela doppa dra droppa fräs fyll fördela förvälla garnera gnid gratinera grilla grädda gör ha hacka finhacka grovhacka hetta häll kavla klicka knåda koka kyl lägg låt marinera mixa montera mosa panera pensla picka plocka pressa puttra reducera ringla riv rosta rulla rör salta servera sila sjud skala skiva skrapa skär skölj slå smaka smält smöra smörj spara späd sprid stek ställ strimla strö sätt ta tillaga tillsätt tina toppa torka tvätta tärna vispa vänd värm väg vik ös ugnsbaka frys täck forma krydda jäs";
const VERBS = new Set(`${EN_VERBS} ${SV_VERBS}`.split(" "));
const LEAD_ADVERBS = new Set(
  "then now next finally first firstly lastly afterwards meanwhile gently carefully slowly quickly lightly and just simply also sen sedan nu först därefter slutligen försiktigt snabbt långsamt och bara också".split(" "),
);
const SEQUENCE =
  /^(?:then|next|now|finally|first(?:ly)?|lastly|after(?:wards)?|once|when|while|meanwhile|in the meantime|in a|in the|into a|on a|using|sen|sedan|därefter|nu|till sist|slutligen|sist|först|när|medan|under tiden|efter(?:åt)?|i en|i ett|i stekpannan|i kastrullen|på en|på ett)\b/i;
const CHAT_IMPERATIVE = /^(?:make|try|gör|testa|prova|save|spara|follow|följ|tag|tagga|share|dela)\s+(?:this|these|it|me|us|det(?:ta| här)?|den(?: här)?|mig|oss|a friend|receptet)\b/i;

const STOP =
  /(?:^|[^\p{L}'’])(?:i|i'm|im|i've|i'd|we|we're|you|you're|your|this|that|it|it's|is|are|was|were|so|my|me|our|jag|du|ni|vi|det|detta|är|var|blev|min|mitt|mina|mig|har|have|has|had|will|would|could|should|can|kan|ska|skulle|really|very|super|sjukt|grymt)(?=$|[^\p{L}'’])/iu;
const CHATTER = /^(?:omg|lol|wow|yum+y?|so good|so easy|best|delicious|amazing|perfect|easy|quick|simple|cheap|healthy|cozy|creamy|tasty|gott|godast|enkelt|snabbt|perfekt|love|älskar|mums|nom+|yes+|ja+)$/i;

const NOTE_ANY =
  /^(?:tips?|pro ?tips?|top tip|hot tip|note|nb|obs!?|ps|p\.s\.?|psst|förvaring|storage|leftovers|rester|keeps|håller|freezes?|fryser|kan frysas|can be (?:frozen|stored|made)|make ahead|swap|byt (?:ut )?|substitut\w*|instead of|istället för|vegan(?:skt)?(?: option| alternativ)?|vegetarian|serve (?:it )?with|servera (?:med|gärna|till)|goes (?:great|well|perfect(?:ly)?) with|passar (?:bra|perfekt|utmärkt) (?:med|till)|perfect with|works (?:great|well) with|funkar (?:bra|också)|also works|you can (?:also|use|swap|add|make)|du kan (?:också|byta|använda))(?![\p{L}\p{N}])/iu;
const NOTE_LABEL =
  /^(?:tips?|pro ?tips?|top tip|hot tip|note|nb|obs!?|ps|p\.s\.?|psst|förvaring|storage|leftovers|rester|make ahead|swap|byt (?:ut )?|substitut\w*|optional|valfritt|you can (?:also|use|swap|add|make)|du kan (?:också|byta|använda))(?![\p{L}\p{N}])/iu;

// ── Junk: chatter, sponsors, app chrome ─────────────────────

const JUNK: RegExp[] = [
  /\blink (?:is )?in (?:my |the |our )?bio\b/i,
  /\blänk(?:en)? (?:finns )?i (?:min |vår )?bio\b/i,
  /\bsave (?:this|it)(?: recipe| post| video)? (?:for later|for (?:the|your) next)\b/i,
  /\bsave (?:this|the) (?:recipe|post|video)\b/i,
  /\bsave for later\b/i,
  /\bspara (?:receptet|inlägget|videon|klippet)\b/i,
  /\bspara (?:\p{L}+ )?(?:till|för) senare\b/iu,
  /\bfollow (?:me|us)\b/i,
  /\bfollow for more\b/i,
  /\bfollow @/i,
  /\bfölj (?:mig|oss)\b/i,
  /\bfölj för (?:fler|mer)\b/i,
  /\b(?:full|printable|complete|written) recipe (?:is )?(?:on|at|in|over on|linked|below|available)\b/i,
  /\bhela receptet (?:finns )?(?:på|i)(?![\p{L}])/iu,
  /\brecept(?:et)? (?:finns )?(?:på (?:min|vår|bloggen|hemsidan)|i (?:bio|kommentarerna|länken))\b/i,
  /\brecipe (?:is )?(?:below|in (?:the )?(?:comments|caption|description))\b/i,
  /^(?:recipe|recept(?:et)?) (?:below|nedan|här|here)\b/i,
  /\brecept(?:et)? nedan\b/i,
  /\bcomment\b.*\b(?:below|for the recipe|and i'?ll)\b/i,
  /\bkommentera\b/i,
  /\btag (?:a |your )?(?:friend|someone|bestie|partner)\b/i,
  /\btagga\b/i,
  /\bshare (?:this|with (?:a|your) friend)\b/i,
  /\bdela (?:gärna|detta|med en vän)\b/i,
  /\bsubscribe\b/i,
  /\bprenumerera\b/i,
  /\bturn on (?:post )?notifications\b/i,
  /\bhit the bell\b/i,
  /\blike (?:and|&) (?:subscribe|share|follow|save)\b/i,
  /\bdouble tap\b/i,
  /\bdubbel ?tryck/i,
  /\blet me know\b/i,
  /\bberätta (?:gärna )?(?:i kommentarerna|vad ni tycker)\b/i,
  /\bwhat should i (?:make|cook) next\b/i,
  /\bvad ska jag (?:laga|göra) härnäst\b/i,
  /\bhope you (?:enjoy|like|love)\b/i,
  /\bhoppas (?:ni|du) (?:gillar|tycker om|gillade)\b/i,
  /\bthanks? (?:you )?for watching\b/i,
  /\btack för att (?:du|ni) (?:tittade|kollade)\b/i,
  /\bsponsor(?:ed|s)?\b/i,
  /\bsponsra[dt]\b/i,
  /\b(?:i|in) (?:samarbete|collaboration|partnership) med\b/i,
  /\bin (?:collaboration|partnership) with\b/i,
  /\bpaid partnership\b/i,
  /\bbetalt samarbete\b/i,
  /\bannonslänk\b/i,
  /\baffiliate\b/i,
  /\b(?:use|my) (?:promo |discount )?code\b/i,
  /\brabattkod\b/i,
  /\bpromo code\b/i,
  /\b\d+\s?% (?:off|rabatt)\b/i,
  /\bfree shipping\b/i,
  /\bfri frakt\b/i,
  /^\[?ad\]?\s*[|:]/i,
  /\bswipe (?:for|to|left|right|up)\b/i,
  /\bsvep (?:för|till|vänster|höger)(?![\p{L}])/iu,
  /^(?:instagram|insta|ig|tiktok|youtube|facebook|fb|twitter|pinterest|snapchat|website|webbsida|hemsida|blog|blogg|merch|patreon|spotify|e-?mail|mejl|business|kontakt|contact)\s*[:\-–|]/i,
  /^(?:(?:original\s+)?(?:recipe|recept(?:et)?)\s*)?(?:by|from|från|av|credit|cred|inspo|inspiration|inspired by|inspirerad av|inspirerat av|adapted from|via|cc|h\/t)?\s*:?\s*$/i,
  /^(?:enjoy|njut|smaklig måltid|bon app[ée]tit|yum+|mm+|so good|så gott|nom+|happy cooking|god aptit|that'?s it|klart|done)\W*$/i,
];

const CHROME_WORDS = new Set(
  "like likes liked reply replies svara svar gilla gillar gilla-markera gilla-markeringar follow following followers följ följer följare share shares dela delningar send skicka save saved spara sparat sparade comment comments kommentar kommentarer more mer translate translation översättning visa view see hide dölj original audio sound ljud originalljud author skapare creator verified edited redigerad pinned fäst ago sedan igår yesterday posts inlägg reels explore utforska inbox inkorg profile profil friends vänner duet duett stitch remix repost reposta report rapportera subscribe subscribed prenumerera views visningar · • | - … ...".split(
    " ",
  ),
);
const TIMESTAMP_TOKEN = /^\d{1,2}(?:s|m|h|d|w|v|t|y|tim|mån|år)$/i;
const COUNTER_TOKEN = /^(?:\d{1,3}(?:[.,]\d{1,3})?\s?(?:k|m|tn|mn|mil)|\d{1,3}(?:[,.\s]\d{3})+)$/i;
const CHROME_LINES: RegExp[] = [
  /^(?:for you|för dig|just now|nyss|igår|yesterday|following for you|för dig följer|följer för dig)$/i,
  /^(?:liked by|gillas av|gillat av|liked by creator|gillat av skaparen)\b/i,
  /^(?:view|visa|see|se)\s+(?:all\s+|alla\s+)?(?:[\d.,]+\s*[km]?\s+)?(?:more\s+|fler\s+)?(?:comments?|kommentarer|repl(?:y|ies)|svar)\b/i,
  /^(?:add|write|lägg till|skriv)\s+(?:a\s+|en\s+)?(?:comment|kommentar|message|meddelande)/i,
  /^(?:\.\.\.|…)\s*(?:more|mer)$/i,
  /^(?:see|visa|show) (?:more|mer|less|mindre|translation|översättning|original)$/i,
  /^(?:original (?:audio|sound)|originalljud(?:et)?)\b/i,
  /^\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?$/i,
  /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*[-–—|:]?\s*\S/,
  /^\d{1,3}\s?%$/,
  /^\d[\d.,]*\s?(?:k|m|tn|mn|mil|md)$/i,
  /^(?:lte|4g|5g|3g|wi-?fi|e)$/i,
  /^[<‹]\s*\p{L}+$/u,
  /^(?:sponsored|sponsrad|sponsrat|annons|reklam|ad|paid partnership|betalt samarbete|edited|redigerad|pinned|fäst)$/i,
  /^(?:add to (?:shopping list|cart|plan|collection)|lägg (?:till )?i (?:inköpslistan?|varukorgen|samling)|print|skriv ut|jump to recipe|hoppa till receptet|rate|betygsätt|betyg\b.*|rating\b.*|\(\d+\)|\d+ (?:ratings?|betyg|röster|reviews?|recensioner))$/i,
  /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|maj|may|jun|jul|aug|sep|okt|oct|nov|dec)[a-zé]*\.?(?:\s+\d{4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)$/i,
  /^\d+\s*(?:days?|dagar|hours?|timmar|tim|weeks?|veckor|minutes?|minuter|min|months?|månader)\s+(?:ago|sedan)$/i,
  /^(?:\d[\d.,]*\s*[km]?\s+)?(?:likes?|gilla-markeringar|comments?|kommentarer|repl(?:y|ies)|svar|shares?|delningar|views?|visningar|saves?|followers|följare)$/i,
];

// ── Small helpers ──────────────────────────────────────────

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const endsSentence = (s: string) => /[.!?]["”')]*$/.test(s);
const lowerFirst = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const isAllCaps = (s: string) => /\p{Lu}.*\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s);
const sentenceCase = (s: string) => (isAllCaps(s) ? upperFirst(s.toLowerCase()) : s);

/** "chefsam.eats", "anna_b", "maja92": the shape of a social handle. */
function isHandle(token: string): boolean {
  const t = token.replace(/^@/, "");
  return (
    /^[a-z0-9][a-z0-9._]{2,28}[a-z0-9_]$/.test(t) && /[._\d]/.test(t) && (t.match(/[a-z]/g)?.length ?? 0) >= 3 && !/^\d/.test(t)
  );
}

function stripLead(s: string): string {
  return s.replace(LEAD, "").trim();
}

const NOT_INGREDIENT_AFTER =
  /^-?\s*(?:min\b|mins?\b|minut|minute|sek|sec|second|h\b|hrs?\b|hour|timm|tim\b|°|grader|degree|dagar|days?\b|%|x\b|times\b|gånger|ggr|ingredien|steps?\b|steg\b|ways?\b|sätt\b|recipes?\b|recept|years?\b|år\b|people|personer|portion|servings?\b|pers\b|port\b|likes?\b|followers|comments?\b|kommentar|k\b)/i;

/** The line starts with an ingredient amount ("200 g", "2 msk", "1 1/2 cups", "3 eggs"), not a time or count. */
function amountLead(t: string): boolean {
  const a = parseAmount(t);
  if (a.qty === null) return false;
  if (!a.unit && NOT_INGREDIENT_AFTER.test(a.item)) return false;
  if (!a.unit && STOP.test(a.item)) return false;
  return true;
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", "a dozen": "12", half: "½", "half a": "½", "half an": "½", "a half": "½",
  en: "1", ett: "1", två: "2", tre: "3", fyra: "4", fem: "5", sex: "6", sju: "7", åtta: "8", nio: "9", tio: "10",
  elva: "11", tolv: "12", "en halv": "½", "ett halvt": "½", "ett dussin": "12",
};
const NUMBER_WORD =
  /^(a dozen|half an?|a half|half|en halv|ett halvt|ett dussin|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)\s+(?=\p{L})/iu;
const A_UNIT =
  /^(?:an?|en|ett|some|lite|några)\s+(?:pinch|handful|splash|dash|drizzle|knob|bunch|clove|can|tin|cup|sprig|few|couple|little|squeeze|nypa|näve|skvätt|klick|knippe|burk|klyfta|kvist|bit|par)\b/i;
const SALT =
  /^(?:salt|pepper|peppar|svartpeppar|black pepper|olive oil|olivolja|oil|olja|water|vatten|butter|smör|flingsalt|sea salt)(?:\s*(?:&|and|och|\+|,)\s*(?:black |svart|nymald |freshly ground |fresh )?(?:pepper|peppar|salt))?(?:\s*,?\s*(?:to taste|efter smak|for (?:frying|serving|garnish|cooking)|till (?:stekning|servering)))?$/i;
const X_COUNT = /^(?:\p{L}[\p{L} -]{1,30}\s*[x×]\s*\d{1,2}|\d{1,2}\s*[x×]\s+\p{L}[\p{L} -]{1,30})$/iu;
const TRAIL_NAME_BAD = /^(?:day|dag|part|del|episode|avsnitt|step|steg|week|vecka|version|round|top|nr|no|number|serves|portioner|tid|time|total|prep|cook|page|sida)$/i;

/** "Smör 50 g", "Pasta - 200g", "Garlic (3 cloves)" → [amount, name], or null. */
function trailingAmount(t: string, needUnit: boolean): [string, string] | null {
  const m = TRAILING_AMOUNT.exec(t);
  if (!m) return null;
  const name = m[1].replace(/[\s:\-–—=(]+$/, "").trim();
  if (!name || words(name) > 5 || TRAIL_NAME_BAD.test(name) || STOP.test(name)) return null;
  if (needUnit && !m[3]) return null;
  if (!m[3] && words(name) > 3) return null;
  return [`${m[2].trim()}${m[3] ? ` ${m[3].trim()}` : ""}`, name];
}

function imperative(t: string): boolean {
  const ws = t
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .split(/[\s,;:]+/);
  let i = 0;
  while (i < ws.length - 1 && LEAD_ADVERBS.has(ws[i])) i++;
  const w = (ws[i] ?? "").replace(/[^\p{L}-]/gu, "");
  if (!VERBS.has(w)) return false;
  if (ws[i + 1] === "of" || ws[i + 1] === "av") return false; // "Zest of 1 lemon"
  return true;
}

function stepLike(t: string): boolean {
  if (CHAT_IMPERATIVE.test(t)) return false;
  return imperative(t) || (SEQUENCE.test(t) && t.length >= 15);
}

function isJunk(fragment: string): boolean {
  const f = fragment.trim();
  return JUNK.some((re) => re.test(f));
}

/** Remove junk sentences/fragments from a line; keep the rest with its own separators. */
function stripJunk(t: string): string {
  if (!JUNK.some((re) => re.test(t))) return t;
  const pieces = t.split(/((?<=[.!?…])\s+|\s+[|–—]\s+|\s+-\s+(?=\p{L})|\s*👉\s*)/u);
  let out = "";
  for (let i = 0; i < pieces.length; i += 2) {
    const p = pieces[i];
    if (!p?.trim() || isJunk(p)) continue;
    out += out ? `${pieces[i - 1] ?? " "}${p}` : p;
  }
  return out.trim();
}

function isChrome(t: string): boolean {
  if (CHROME_LINES.some((re) => re.test(t))) return true;
  if (isHandle(t)) return true;
  const toks = t.split(/\s+/);
  // "chef_anna · 2d", "anna_b Follow"
  if (toks.length >= 2 && isHandle(toks[0]) && toks.slice(1).every((x) => chromeToken(x))) return true;
  if (toks.every((x) => chromeToken(x)) && toks.some((x) => !/^\d+$/.test(x))) return true;
  return false;
}

function chromeToken(x: string): boolean {
  const w = x.toLowerCase().replace(/[!.,:]+$/, "");
  return CHROME_WORDS.has(w) || TIMESTAMP_TOKEN.test(w) || COUNTER_TOKEN.test(w) || w === "";
}

// ── Sentences and lists ────────────────────────────────────

const ABBREVIATION = /(?:^|[\s(])(?:ca|t\.ex|bl\.a|e\.g|i\.e|approx|appr|ung|resp|ex|obs|nr|no|vs|dr|mr|mrs|ms|st|osv|dvs|pga|tbsp|tsp|oz|lb|pkt|förp)\.$|°\s?[CF]\.$/i;

/** Sentences, not split after "ca.", "t.ex.", "°C." or inside decimal numbers. */
function splitSentences(s: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["”')]*\s+(?=["“(]?[\p{Lu}\d])/gu;
  let start = 0;
  for (const m of s.matchAll(re)) {
    const end = m.index + m[0].trimEnd().length;
    const before = s.slice(Math.max(start, m.index - 8), m.index + 1);
    if (m[0][0] === "." && ABBREVIATION.test(before)) continue;
    out.push(s.slice(start, end).trim());
    start = m.index + m[0].length;
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

/** "pasta, garlic, chili and parmesan" → four items. Commas inside brackets stay. */
function splitList(s: string): string[] {
  const t = s.replace(/[.!]+$/, "").replace(/\([^)]*\)/g, (m) => m.replace(/,/g, "\u0001"));
  const parts = t.split(/\s*[,;]\s*/);
  const last = parts.pop() ?? "";
  // Only the last item may hold "and": "…, chili and parmesan".
  const tail = last.split(/\s+(?:and|och|&|\+|plus|samt)\s+/i);
  return [...parts, ...tail].map((p) => p.replace(/\u0001/g, ",").trim()).filter(Boolean);
}

const PREP_WORDS =
  /^(?:and |och |or |eller )?(?:finely|roughly|thinly|freshly|lightly|coarsely|very|grovt|fint|tunt)?\s*(?:chopped|minced|diced|sliced|grated|crushed|shredded|julienned|torn|juiced|zested|beaten|sifted|cooked|uncooked|peeled|deseeded|seeded|halved|quartered|cubed|drained|rinsed|melted|softened|divided|packed|boneless|skinless|skin-on|bone-in|cold|warm|hot|room temperature|at room temperature|fresh|dried|frozen|thawed|optional|to taste|for garnish|for serving|for frying|plus (?:more|extra)|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|riven|rivet|rivna|skivad|skivade|tärnad|tärnade|pressad|pressade|smält|rumsvarmt?|kallt?|avrunnen|avrunna|skalad|skalade|delad|delade|strimlad|strimlade|kokt|kokta|okokt|valfritt|efter smak|till servering|till garnering|till stekning|or|eller)\b/i;

/** One ingredient line from the text → one or more ingredient lines (lists and OCR merges split). */
function expandIngredient(text: string, forceList: boolean): string[] {
  let t = text.trim();
  if (!t) return [];
  // " | " and " · " separate items on one line.
  if (/\s[|·•]\s/.test(t)) return t.split(/\s+[|·•]\s+/).flatMap((p) => expandIngredient(p, forceList));
  if (t.includes(",")) {
    const parts = splitList(t);
    const withAmount = parts.filter((p) => amountLead(p)).length;
    const short = parts.every((p) => words(p) <= 4 && !PREP_WORDS.test(p));
    if (
      parts.length >= 2 &&
      (forceList ||
        withAmount >= 2 ||
        (parts.length >= 3 && short) ||
        (parts.length === 2 && short && withAmount === 0 && parts.every((p) => words(p) <= 3)))
    ) {
      return parts.flatMap((p) => splitMerged(p));
    }
  } else if (forceList && /\s(?:and|och|&)\s/i.test(t) && !SALT.test(t) && words(t) <= 8) {
    return splitList(t).flatMap((p) => splitMerged(p));
  }
  t = t.replace(/[,;]\s*$/, "");
  return splitMerged(t);
}

/** OCR glued two lines together: "200 g smör 2 msk olja" → two lines. */
function splitMerged(t: string): string[] {
  if (!amountLead(t)) return [t];
  const re = new RegExp(`(?<=\\p{L}\\)?)\\s+(?=${NUM}\\s*${UNIT}\\.?\\s+\\p{L}|\\d{1,2}\\s+\\p{L}{3,})`, "giu");
  const cuts: number[] = [];
  for (const m of t.matchAll(re)) {
    const before = t.slice(0, m.index).trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    if (/^(?:or|eller|plus|about|ca|cirka|approx|to|till|x|à|of|av|per|and|och|\+|for|för|med|with)$/.test(before)) continue;
    if ((t.slice(0, m.index).match(/\(/g)?.length ?? 0) > (t.slice(0, m.index).match(/\)/g)?.length ?? 0)) continue;
    cuts.push(m.index);
  }
  if (!cuts.length) return [t];
  const out: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    out.push(t.slice(prev, c).trim());
    prev = c;
  }
  out.push(t.slice(prev).trim());
  return out.every((p) => p.length >= 3 && amountLead(p)) ? out : [t];
}

/** Amount first, number words as digits, metric. */
function fixIngredient(text: string): string {
  let t = stripLead(text).replace(/\s+/g, " ").trim();
  t = t.replace(/^(\d+)\s*[x×]\s+/i, "$1 "); // "2x eggs"
  const times = /^(.+?)\s*[x×]\s*(\d+)$/i.exec(t); // "Garlic x3"
  if (times && !/\d/.test(times[1])) t = `${times[2]} ${lowerFirst(times[1])}`;
  if (!amountLead(t)) {
    const trail = trailingAmount(t, false);
    if (trail) t = `${trail[0]} ${lowerFirst(trail[1])}`;
  }
  const word = NUMBER_WORD.exec(t);
  if (word) t = `${NUMBER_WORDS[word[1].toLowerCase()]} ${t.slice(word[0].length)}`;
  t = t.replace(GLUED_UNIT, "$1 $2");
  t = ingredientToMetric(t);
  return t
    .replace(/\s+/g, " ")
    .replace(/[.;,:]+$/, "")
    .trim()
    .slice(0, MAX_LINE);
}

// ── Serves and time ────────────────────────────────────────

const DUR = String.raw`(?:(?<h>\d+(?:[.,]\d+)?|an?|en|ett|one|half an?|en halv)\s*(?:h|hrs?|hours?|tim(?:me|mar)?|t)\b(?:\s*(?:and|och|&|,)?\s*(?<hm>\d+)\s*(?:m|mins?|minutes?|minuter)\b)?|(?<m>\d+)(?:\s*[-–]\s*(?<m2>\d+))?\s*(?:m|mins?|minutes?|minuter)\b)`;
const ABOUT = String.raw`(?:ca\.?|cirka|about|approx\.?|around|under|only|bara|ungefär|~|just)?\s*`;
const TOTAL_RE = new RegExp(
  String.raw`\b(?:total(?:\s*time)?|totalt?\s*tid|tot\.?\s*tid|totaltid|tid|time|ready in|done in|klar(?:t)? på|klar inom|på bordet (?:på|inom)|takes|tar)\s*[:\-–]?\s*${ABOUT}${DUR}`,
  "giu",
);
const PREP_RE = new RegExp(
  String.raw`\b(?:prep(?:aration)?(?:\s*time)?|förberedelse(?:r|tid)?|förb\.?(?:\s*tid)?|active time|aktiv tid|hands[- ]on(?:\s*time)?)\s*[:\-–]?\s*${ABOUT}${DUR}`,
  "giu",
);
const COOK_RE = new RegExp(
  String.raw`\b(?:cook(?:ing)?\s*time|cook(?=\s*:?\s*\d)|bake(?=\s*:?\s*\d)|bake\s*time|baking\s*time|koktid|ugnstid|tillagningstid|tillagning|stektid)\s*[:\-–]?\s*${ABOUT}${DUR}`,
  "giu",
);
const LISTED_DUR = new RegExp(String.raw`(?<=[(,·•|]\s*)${ABOUT}${DUR}(?=\s*(?:[),·•|]|$))`, "giu");
const BARE_DUR = new RegExp(String.raw`^\s*${ABOUT}${DUR}\s*$`, "iu");
const SERVES1 =
  /\b(?:serves|servings?|portions?|portioner|yield|yields|makes|ger|räcker till|for|för)\s*:?\s*(?:ca\.?\s*|about\s*|approx\.?\s*)?(?<n>\d{1,3}(?:\s*[-–]\s*\d{1,3})?)(?!\s*(?:[.,]\d|\/|min|h\b|hrs?|hours?|tim|°|grader|degrees|g\b|gr\b|kg|dl|ml|cl|l\b|cm|%|st\b|x\b|dagar|days|veckor|weeks|msk|tsk|tbsp|tsp|cups?|oz|lbs?|\d))/giu;
const SERVES2 = /\b(?<n>\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:servings?|portions?|portioner|port\b\.?|pers\b\.?|personer|people|persons)/giu;

type Groups = Record<string, string | undefined>;

function hoursValue(h: string): number {
  const w = h.toLowerCase();
  if (/^(?:an?|en|ett|one)$/.test(w)) return 1;
  if (/half|halv/.test(w)) return 0.5;
  return Number(w.replace(",", ".")) || 0;
}

function durMinutes(g: Groups): [number, number | null] | null {
  if (g.h) return [Math.round(hoursValue(g.h) * 60 + (g.hm ? Number(g.hm) : 0)), null];
  if (g.m) return [Number(g.m), g.m2 ? Number(g.m2) : null];
  return null;
}

const emptyMeta = (): Meta => ({ serves: "", total: null, totalHi: null, prep: null, cook: null });

/** Pull serves/time phrases out of a line. Returns the line without them. */
function scanMeta(t: string, meta: Meta | null): string {
  let rest = t;
  const run = (re: RegExp, apply: (g: Groups) => void) => {
    rest = rest.replace(re, (...args: unknown[]) => {
      const g = args[args.length - 1] as Groups;
      if (meta) apply(g);
      return " ";
    });
  };
  run(PREP_RE, (g) => {
    const d = durMinutes(g);
    if (d && meta!.prep === null) meta!.prep = d[0];
  });
  run(COOK_RE, (g) => {
    const d = durMinutes(g);
    if (d && meta!.cook === null) meta!.cook = d[0];
  });
  run(TOTAL_RE, (g) => {
    const d = durMinutes(g);
    if (d && meta!.total === null) [meta!.total, meta!.totalHi] = d;
  });
  const serves = (g: Groups) => {
    const n = (g.n ?? "").replace(/\s*[-–]\s*/, "–");
    const first = parseInt(n, 10);
    if (n && first > 0 && first <= 100 && !meta!.serves) meta!.serves = n;
  };
  run(SERVES1, serves);
  run(SERVES2, serves);
  run(LISTED_DUR, (g) => {
    const d = durMinutes(g);
    if (d && meta!.total === null && meta!.prep === null && meta!.cook === null) [meta!.total, meta!.totalHi] = d;
  });
  return rest;
}

const META_FILLER =
  /(?<![\p{L}\p{N}])(?:ca|cirka|about|approx|ungefär|total|totalt|time|tid|and|och|ready|klar|in|på|serves|portioner|people|min|minutes|minuter|tar|takes|du|you|ger|yields?)(?![\p{L}\p{N}])/giu;

/** Is the whole line serves/time info ("Serves 4 · 30 min", "⏱ 45 min")? Then record it. */
function metaOnly(t: string, meta: Meta): boolean {
  if (t.length > 70) return false;
  let rest = scanMeta(t, null);
  const bare = BARE_DUR.exec(rest.replace(/[|·•,;/()[\]\-–—:.!]+/g, " ").trim());
  if (bare) rest = "";
  const leftover = rest.replace(/[|·•,;/()[\]\-–—:.!+]+/g, " ").replace(META_FILLER, " ").trim();
  if (leftover || rest === t) {
    if (!bare) return false;
  }
  scanMeta(t, meta);
  if (bare) {
    const d = durMinutes(bare.groups ?? {});
    if (d && meta.total === null) [meta.total, meta.totalHi] = d;
  }
  return true;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function timeText(m: Meta): string {
  if (m.total !== null && m.total > 0) {
    if (m.totalHi !== null && m.totalHi > m.total) {
      return m.totalHi < 60 ? `${m.total}–${m.totalHi} min` : `${formatMinutes(m.total)}–${formatMinutes(m.totalHi)}`;
    }
    return formatMinutes(m.total);
  }
  const sum = (m.prep ?? 0) + (m.cook ?? 0);
  return sum > 0 ? formatMinutes(sum) : "";
}

// ── Headings ───────────────────────────────────────────────

type HeadKind = "ing" | "steps" | "notes" | "skip" | "neutral";
const HEADS: [HeadKind, RegExp][] = [
  [
    "ing",
    /^(?:ingredients?|ingredienser|ingredienslista|ingrediens|du beh[öo]ver|det (?:här )?beh[öo]ver du|detta beh[öo]ver du|vad du beh[öo]ver|you(?:'ll|’ll| will)? need|what you(?:'ll|’ll| will)? need|things you(?:'ll|’ll)? need|all you need|shopping|grocery|ink[öo]pslista|handlingslista|att handla)$/,
  ],
  [
    "steps",
    /^(?:method|methods|instructions?|directions?|steps|preparation|how to(?: make)?(?: (?:it|this|them))?|how i made (?:it|this|them)|how it'?s made|recipe steps|step[- ]by[- ]step|cooking instructions|to make|g[öo]r s[åa] h[äa]r|s[åa]\s?(?:h[äa]r\s)?g[öo]r (?:du|ni|man)|instruktion(?:er)?|tillagning|tillv[äa]gag[åa]ngss[äa]tt|metod|steg f[öo]r steg|steg|beskrivning|g[öo]r s[åa])$/,
  ],
  [
    "notes",
    /^(?:notes?|tips?|tips (?:&|and|och) tricks|pro tips?|anteckningar|obs|good to know|bra att veta|storage|f[öo]rvaring|variations?|varianter|variant|serving suggestions?|serveringsf[öo]rslag|substitutions?|swaps?)$/,
  ],
  [
    "skip",
    /^(?:chapters?|timestamps?|kapitel|music|musik|song|equipment|(?:my )?(?:kitchen )?(?:gear|equipment|tools|essentials)|products? (?:i )?used|kitchen tools|affiliate links?|links?|l[äa]nkar|follow me(?: on)?|social(?: media)?|socials|connect with me|find me(?: on)?|business(?: inquiries| enquiries)?|contact|kontakt|merch|shop|sponsors?|thanks to our sponsor|subscribe|prenumerera|more recipes|fler recept|related videos?|watch next|(?:printable )?recipe card)$/,
  ],
  [
    "neutral",
    /^(?:recipe|recept|the recipe|receptet|full recipe|hela receptet|recipe below|recept nedan|recipe here|recept h[äa]r)$/,
  ],
];

function headKey(head: string): string {
  let k = head.replace(EMOJI_RUN, " ").replace(/^#+\s*/, "").toLowerCase();
  k = scanMeta(k, null);
  k = k
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}'’ &-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  k = k
    .replace(/^(?:here'?s|here are|here is|här är|this is)\s+/, "")
    .replace(/^(?:the|a)\s+/, "")
    .replace(/\s+(?:list|lista)$/, "")
    .replace(/^-+|-+$/g, "")
    .trim();
  return k;
}

/** A main heading ("Ingredients", "Gör så här:", "METHOD 👇"), with any text after its colon. */
function mainHeading(text: string): { kind: HeadKind; rest: string; head: string; sub: string | null } | null {
  const m = /^([^:]{1,48}):\s*(.*)$/.exec(text);
  const head = (m ? m[1] : text).trim();
  if (head.length > 48 || !head) return null;
  const key = headKey(head);
  if (!key) return null;
  for (const [kind, re] of HEADS) if (re.test(key)) return { kind, rest: m ? m[2].trim() : "", head, sub: null };
  // "Ingredients for the sauce:" → ingredients, section "Sauce"
  const forSub = /^(?:ingredients?|ingredienser) (?:for|till|för) (?:the )?(\p{L}[\p{L} ]{1,30})$/u.exec(key);
  if (forSub) return { kind: "ing", rest: m ? m[2].trim() : "", head, sub: upperFirst(forSub[1].trim()) };
  return null;
}

const SUB_EXCLUDE =
  /^(?:optional|valfritt|tip|tips|note|notes|obs|ps|pro tip|serves|servings?|portioner|time|tid|prep|cook|total|yield|recipe|recept|pov|update|edit|ad|annons|psa|fyi|edit|link|länk)$/i;

/** A section heading inside ingredients or steps: "For the sauce:", "Sås:", "Till servering:", "# Deg". */
function subHeading(t: string, allowBare: boolean): { name: string; rest: string } | null {
  const md = /^#{1,3}\s+(.{1,40})$/.exec(t);
  if (md) return { name: md[1].replace(/:+$/, "").trim(), rest: "" };
  const m = /^([^:]{1,40}):\s*(.*)$/.exec(t);
  if (m) {
    const name = m[1].trim();
    const rest = m[2].trim();
    if (!name || /^\d/.test(name) || /[.!?]/.test(name) || words(name) > 5 || SUB_EXCLUDE.test(name) || isHandle(name)) return null;
    if (!rest) return { name, rest };
    if (AMOUNT_ONLY.test(rest)) return null;
    if (words(name) <= 3 && (amountLead(rest) || rest.includes(","))) return { name, rest };
    return null;
  }
  if (/^(?:for|to)\s+(?:the\s+)?\p{L}[\p{L}\s&'’-]{1,30}$/iu.test(t) && words(t) <= 5 && !stepLike(t)) return { name: t, rest: "" };
  if (/^(?:till|för)\s+\p{L}+(?:\s+\p{L}+)?$/iu.test(t) && !/^till sist$/i.test(t)) return { name: t, rest: "" };
  if (allowBare && /^\p{Lu}[\p{Lu}\s&'’-]{2,30}$/u.test(t) && words(t) <= 4) return { name: t, rest: "" };
  return null;
}

function headingName(name: string): string {
  return upperFirst(sentenceCase(name.replace(/:+$/, "").replace(/\s+/g, " ").trim())).slice(0, 60);
}

// ── Lines from text ────────────────────────────────────────

const CIRCLED: [RegExp, number][] = [
  [/[\u2460-\u2473]/gu, 0x2460],
  [/[\u2776-\u277F]/gu, 0x2776],
  [/[\u2780-\u2789]/gu, 0x2780],
  [/[\u278A-\u2793]/gu, 0x278a],
];

function prepare(text: string): Line[] {
  let t = text.slice(0, MAX_TEXT).replace(/\r\n?|\u2028|\u2029/g, "\n").replace(ZERO_WIDTH, "").replace(SPACES, " ");
  // Keycap and circled numbers mark steps: "1️⃣ Boil" → "1. Boil" on its own line.
  t = t.replace(/\u{1F51F}/gu, "\n10. ").replace(/(\d)\uFE0F?\u20E3/gu, "\n$1. ");
  for (const [re, base] of CIRCLED) t = t.replace(re, (c) => `\n${c.codePointAt(0)! - base + 1}. `);
  // OCR wrapped a word: "tomato-\nes" → "tomatoes".
  t = t.replace(/(\p{Ll})[-\u2010]\n[ ]*(\p{Ll})/gu, "$1$2");
  t = t.replace(INLINE_HEAD, "\n$1");
  const out: Line[] = [];
  for (const raw of t.split("\n")) {
    if (!raw.trim()) {
      out.push({ text: "", bullet: false, num: null, blank: true });
      continue;
    }
    for (const piece of explode(raw)) {
      const line = cleanLine(piece);
      if (line) out.push(line);
    }
  }
  return out;
}

/** One raw line → several when it holds a heading plus content, an emoji-separated list, or "1. … 2. …". */
function explode(raw: string): string[] {
  const s = raw.replace(/\*\*|__/g, "");
  const colon = s.indexOf(":");
  if (colon > 0 && colon <= 60) {
    const head = s.slice(0, colon).replace(EMOJI_RUN, " ").replace(LEAD, "").trim();
    const rest = s.slice(colon + 1).trim();
    const h = rest ? mainHeading(head) : null;
    if (h && (h.kind === "ing" || h.kind === "steps")) return [`${head}:`, ...explode(rest)];
  }
  const parts = s
    .split(EMOJI_RUN)
    .map((p) => p.trim())
    .filter((p) => p && !/^[\s\p{P}\p{S}]*$/u.test(p));
  if (parts.length >= 2) {
    const amounts = parts.filter((p) => amountLead(stripLead(p))).length;
    const shortParts = parts.every((p) => words(p) <= 4);
    if ((STARTS_EMOJI.test(s) && parts.length >= 3) || amounts >= 2 || (parts.length >= 3 && shortParts)) {
      return parts.map((p) => `• ${p}`);
    }
  }
  return splitNumbered(s);
}

/** "1. Boil the pasta 2. Drain 3. Toss" on one line → three lines. */
function splitNumbered(s: string): string[] {
  const hits = [...s.matchAll(/(?:^|\s)(?:(?:step|steg)\s*)?(\d{1,2})[.)]\s+(?=\p{L})/giu)];
  if (hits.length < 2) return [s];
  for (let i = 1; i < hits.length; i++) if (+hits[i][1] !== +hits[i - 1][1] + 1) return [s];
  if (hits[0].index !== 0 && +hits[0][1] !== 1) return [s];
  const out: string[] = [];
  let prev = 0;
  for (const h of hits) {
    const at = h.index + (/^\s/.test(h[0]) ? 1 : 0);
    if (at > prev) out.push(s.slice(prev, at));
    prev = at;
  }
  out.push(s.slice(prev));
  return out.map((x) => x.trim()).filter(Boolean);
}

function cleanLine(s: string): Line | null {
  let t = s;
  let bullet = false;
  const lead = LEAD.exec(t);
  if (lead && lead[0].trim()) {
    bullet = true;
    t = t.slice(lead[0].length);
  }
  t = t.replace(EMOJI_RUN, " ");
  t = t.replace(/(^|[\s(])#(?=[\p{L}\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu, "$1");
  let url = false;
  if (URL_RE.test(t)) {
    url = true;
    t = t.replace(URL_RE, " ");
  }
  t = t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t
      .replace(/^@[\w.]+\s*[:\-–—·•|]?\s*/u, "")
      .replace(/\s*[-–—·•|(]?\s*@[\w.]+\)?[\s.!]*$/u, "")
      .trim();
    if (t === before) break;
  }
  // Instagram puts the handle in front of the caption: "chefsam.eats Lemon salmon".
  const first = /^(\S+)\s+(.+)$/.exec(t);
  if (first && isHandle(first[1]) && !/\.$/.test(first[1])) t = first[2];
  t = t
    .replace(/[\s|·•\-–—]+$/u, "")
    .replace(/^[\s|·•:]+/u, "")
    .trim();
  if (url && (t.length <= 40 || t.endsWith(":"))) return null;
  if (!t) return null;
  if (isChrome(t)) return null;
  t = stripJunk(t);
  if (!t) return null;
  let num: number | null = null;
  const m = NUM_MARK.exec(t);
  if (m && !AMOUNT_ONLY.test(t)) {
    num = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
    t = t.slice(m[0].length).trim();
  } else {
    const bare = /^(\d{1,2})\s+(\p{Lu}.*)$/u.exec(t);
    if (bare && imperative(bare[2])) {
      num = Number(bare[1]);
      t = bare[2];
    }
  }
  if (!t && num === null) return null;
  return { text: t, bullet, num, blank: false };
}

const CONNECTOR_END =
  /(?:,|&|\+|\(|\b(?:and|or|och|eller|with|med|of|the|a|an|to|into|in|on|for|från|from|i|på|till|av|för|en|ett|then|sen|sedan|plus|samt|about|ca|at|vid))$/i;

const openBracket = (t: string) => (t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0);

function isHeadingLine(t: string): boolean {
  return Boolean(mainHeading(t)) || (t.endsWith(":") && t.length <= 40);
}

/** Repair OCR splits: "200" + "g smör", "3 cloves garlic," + "minced", "Step 1" + "Boil…". */
function joinLines(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const cur of lines) {
    const prev = out[out.length - 1];
    if (prev && !prev.blank && !cur.blank) {
      if (prev.text === "" && prev.num !== null) {
        prev.text = cur.text;
        prev.bullet ||= cur.bullet;
        continue;
      }
      if (AMOUNT_ONLY.test(prev.text) && prev.num === null && cur.num === null && /^\p{L}/u.test(cur.text) && !isHeadingLine(cur.text)) {
        if (/^\d{1,2}$/.test(prev.text) && /^\p{Lu}/u.test(cur.text) && stepLike(cur.text)) {
          prev.num = Number(prev.text); // a big step number on its own line
          prev.text = cur.text;
        } else {
          prev.text = `${prev.text} ${cur.text}`;
        }
        prev.bullet ||= cur.bullet;
        continue;
      }
      if (
        cur.num === null &&
        !cur.bullet &&
        !isHeadingLine(cur.text) &&
        !isHeadingLine(prev.text) &&
        (CONNECTOR_END.test(prev.text) || openBracket(prev.text) || (/^\(/.test(cur.text) && amountLead(prev.text)))
      ) {
        prev.text = `${prev.text} ${cur.text}`;
        continue;
      }
    }
    out.push({ ...cur });
  }
  // Bare numbers left over are like/comment counters.
  return out.filter((l) => l.blank || l.num !== null || !/^[\d\s.,]+$/.test(l.text));
}

// ── Title ──────────────────────────────────────────────────

const CHATTY_START =
  /^(?:i|i'm|im|i've|i'd|we|we're|my\s+(?:husband|wife|kids?|boyfriend|girlfriend|partner|mom|mum|dad|family|friends?)|made|making|so|ok|okay|omg|pov|when|if|this is|these are|today|tonight|yesterday|in today'?s|in this|welcome|hey|hi|hello|jag|vi|idag|i dag|ikväll|igår|hej|här är|det här är|detta är|när|om du|har ni|have you|did you|do you|who|what|why|how about|can|does|recipe by|recept av|ad|annons|day \d+|dag \d+|part \d+|del \d+|episode|avsnitt|reply|replying|svar|thanks?|thank you|tack|rating|ranking|review)\b/i;

function cleanTitle(s: string): string {
  let t = s
    .replace(EMOJI_RUN, " ")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ")
    .replace(/(^|\s)@[\w.]+/gu, " ")
    .replace(URL_RE, " ");
  t = scanMeta(t, null);
  t = t
    .replace(/\(\s*[,;·•|]*\s*\)/g, " ")
    .replace(/^(?:recipe|recept|title|titel)\s*:\s*/i, "")
    .replace(/\s*(?:\||–|—|-)\s*(?:youtube|tiktok|instagram|shorts?)\b.*$/i, "")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .replace(/[\s!.…:;,\-–—|~*]+$/u, "")
    .replace(/^[\s\-–—|:*]+/u, "")
    .trim();
  return sentenceCase(t).slice(0, MAX_TITLE).trim();
}

function titleFromText(intro: string[]): string {
  for (const raw of intro.slice(0, 4)) {
    const t = cleanTitle(raw);
    if (t.length < 3 || words(t) > 12 || t.length > 80) continue;
    if (/\?$/.test(raw.trim()) || CHATTY_START.test(t) || !/\p{L}{2}/u.test(t)) continue;
    if (amountLead(t) || mainHeading(t)) continue;
    return t;
  }
  return "";
}

// ── Main ───────────────────────────────────────────────────

/** Structure free text into recipe fields: title, ingredients (metric), steps, serves, time, notes. */
export function textToRecipe(text: string, opts: TextRecipeOptions = {}): TextRecipeResult {
  const lines = joinLines(prepare(typeof text === "string" ? text : ""));
  const meta = emptyMeta();

  // Bullet runs: a list in the caption even without an "Ingredients" heading.
  const runLen: number[] = [];
  const runAmounts: number[] = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i].blank || !lines[i].bullet) {
      runLen[i] = 0;
      runAmounts[i] = 0;
      i++;
      continue;
    }
    let j = i;
    let amounts = 0;
    while (j < lines.length && !lines[j].blank && lines[j].bullet) {
      if (amountLead(lines[j].text)) amounts++;
      j++;
    }
    for (let k = i; k < j; k++) {
      runLen[k] = j - i;
      runAmounts[k] = amounts;
    }
    i = j;
  }

  const ing: string[] = [];
  const steps: Step[] = [];
  const notes: string[] = [];
  const intro: string[] = []; // lines before any recipe content: title candidates
  let mode: "none" | "ing" | "steps" | "notes" | "skip" = "none";
  let pending: string | null = null;
  let last: "ing" | "step" | "intro" | "note" | null = null;
  let seenContent = false;
  let seenHeading = false;
  let ingHeading = false;
  let methodHeading = false;
  let numberedSteps = 0;
  let prevBlank = true;

  const addIng = (t: string, forceList = false) => {
    for (const p of expandIngredient(t, forceList)) {
      if (pending) ing.push(`${pending}:`);
      pending = null;
      ing.push(p);
    }
    last = "ing";
    seenContent = true;
  };
  const addStep = (t: string, numbered: boolean) => {
    if (pending) steps.push({ text: `${pending}:`, numbered: false, heading: true });
    pending = null;
    steps.push({ text: t, numbered });
    if (numbered) numberedSteps++;
    last = "step";
    seenContent = true;
  };
  const addNote = (t: string) => {
    if (t.trim()) notes.push(t.trim());
    last = "note";
  };
  const addIntro = (t: string) => {
    if (!seenContent && !seenHeading) intro.push(t);
    last = "intro";
  };

  const youNeed = (s: string): { before: string; items: string[] } | null => {
    const m =
      /(?:^|\b)(?:all\s+)?(?:you(?:'ll|’ll| will)?\s+(?:just\s+|only\s+)?need|du\s+(?:bara\s+)?beh[öo]ver|ni\s+beh[öo]ver|det (?:enda )?du beh[öo]ver [äa]r|ingredients are|ingredienserna [äa]r|i used|jag anv[äa]nde)\s*:?\s+(.+)$/i.exec(
        s,
      );
    if (!m || /^(?:to|att|is|är|a few|some)\b/i.test(m[1])) return null;
    const items = splitList(m[1]).filter((x) => words(x) <= 7);
    if (items.length < 2 && !amountLead(m[1])) return null;
    return { before: s.slice(0, m.index).trim(), items };
  };

  const ingredientNone = (l: Line, i: number): boolean => {
    const t = l.text;
    if (t.length > 120) return false;
    if (SALT.test(t)) return true;
    if (stepLike(t)) return false;
    if (amountLead(t)) return t.length <= 90 || !endsSentence(t);
    if (A_UNIT.test(t)) return t.length <= 60;
    if (trailingAmount(t, true) || X_COUNT.test(t)) return true;
    const list = l.bullet && runLen[i] >= 2 && (runAmounts[i] >= 2 || runLen[i] >= 3);
    if (!list || t.length > 50 || words(t) > 6 || /[!?]$/.test(t) || STOP.test(t) || CHATTER.test(t)) return false;
    return true;
  };

  const handleNone = (l: Line, i: number) => {
    const t = l.text;
    // The first line of a caption is its title, even when it starts with "Roast…".
    if (!seenContent && !seenHeading && !intro.length && l.num === null && !l.bullet && t.length <= 60 && !/\.$/.test(t) && !amountLead(t)) {
      return addIntro(t);
    }
    if (ingredientNone(l, i)) return addIng(t);
    if (l.num !== null && t.length > 3 && !amountLead(t)) return addStep(t, true);
    if (l.num !== null && amountLead(t)) return addIng(t);
    const sentences = t.length > 60 ? splitSentences(t) : [t];
    for (const s of sentences) {
      const need = youNeed(s);
      if (need) {
        if (need.before && words(need.before) > 2) addIntro(need.before);
        for (const item of need.items) addIng(item);
        continue;
      }
      if (stepLike(s) && s.length >= 8) addStep(s, false);
      else if (NOTE_ANY.test(s)) addNote(s);
      else if (sentences.length > 1 && amountLead(s) && s.length <= 60) addIng(s);
      else addIntro(s);
    }
  };

  for (let i = 0; i < lines.length && ing.length + steps.length < MAX_LINES * 2; i++) {
    const l = lines[i];
    if (l.blank) {
      if (mode === "skip") mode = "none";
      prevBlank = true;
      continue;
    }
    const wasBlank: boolean = prevBlank;
    prevBlank = false;
    const t = l.text;

    // Headings
    const h = l.num === null ? mainHeading(t) : null;
    if (h && !(h.kind === "notes" && h.rest)) {
      scanMeta(h.head, meta);
      seenHeading = true;
      pending = h.sub;
      if (h.kind === "ing") {
        mode = "ing";
        ingHeading = true;
        if (h.rest) addIng(h.rest, true);
      } else if (h.kind === "steps") {
        mode = "steps";
        methodHeading = true;
        if (h.rest) addStep(h.rest, false);
      } else if (h.kind === "notes") {
        mode = "notes";
      } else if (h.kind === "skip") {
        mode = "skip";
      } else if (h.rest) {
        lines[i] = { ...l, text: h.rest };
        i--;
        prevBlank = wasBlank;
      }
      continue;
    }
    if (mode === "skip") continue;
    if (metaOnly(t, meta)) continue;

    if (mode === "notes") {
      addNote(t);
      continue;
    }

    const sub = l.num === null ? subHeading(t, seenContent) : null;
    if (sub) {
      pending = headingName(sub.name);
      if (sub.rest) {
        if (mode === "steps") addStep(sub.rest, false);
        else addIng(sub.rest, true);
      }
      continue;
    }

    // OCR wrapped a sentence onto the next line: "…and add" / "the cream."
    const canWrap = !wasBlank && l.num === null && !l.bullet && /^\p{Ll}/u.test(t) && !imperative(t) && !amountLead(t);
    if (canWrap && last === "step" && mode !== "ing") {
      const p = steps[steps.length - 1];
      if (!p.heading && p.text.length >= 28 && !/[.!?:;)]$/.test(p.text)) {
        p.text = `${p.text} ${t}`;
        continue;
      }
    }
    if (canWrap && last === "intro" && mode === "none" && intro.length && !/[.!?:;]$/.test(intro[intro.length - 1])) {
      if (!seenContent && !seenHeading) scanMeta(t, meta);
      intro[intro.length - 1] += ` ${t}`;
      continue;
    }

    if (mode === "none") {
      if (!seenContent) scanMeta(t, meta); // "Lemon salmon (serves 2)": record, keep the line
      handleNone(l, i);
      continue;
    }

    if (mode === "ing") {
      if (NOTE_LABEL.test(t)) addNote(t);
      else if (amountLead(t) || SALT.test(t) || A_UNIT.test(t) || trailingAmount(t, false) || X_COUNT.test(t)) {
        if (t.length > 140 && stepLike(t)) {
          mode = "steps";
          addStep(t, l.num !== null);
        } else addIng(t);
      } else if ((l.num !== null && t.length > 25) || (stepLike(t) && (t.length > 25 || endsSentence(t)))) {
        mode = "steps";
        addStep(t, l.num !== null);
      } else if ((STOP.test(t) && (/[!?]$/.test(t) || t.length > 40)) || CHATTER.test(t)) {
        if (NOTE_ANY.test(t)) addNote(t);
      } else if (t.length > 60 && endsSentence(t)) {
        mode = "steps";
        addStep(t, false);
      } else addIng(t);
      continue;
    }

    // mode === "steps"
    if (NOTE_LABEL.test(t) || (NOTE_ANY.test(t) && !stepLike(t))) addNote(t);
    else if (t.length <= 30 && /!$/.test(t) && !stepLike(t)) continue;
    else if (words(t) <= 2 && !/\d/.test(t) && !stepLike(t)) continue; // "Kram", "xoxo"
    else if (STOP.test(t) && /[!?]$/.test(t) && !stepLike(t)) continue;
    else if ((l.bullet || l.num === null) && !stepLike(t) && (amountLead(t) || SALT.test(t)) && t.length <= 40 && !endsSentence(t)) addIng(t);
    else if (numberedSteps >= 2 && l.num === null && !stepLike(t)) {
      // After a numbered method, loose lines are comments or chatter.
      if (NOTE_ANY.test(t)) addNote(t);
    } else addStep(t, l.num !== null);
  }

  // ── Finish ──
  const ingredients = finish(ing.map((x) => (x.endsWith(":") && sectionLike(x) ? x : fixIngredient(x))));
  const stepLines = finish(
    steps.flatMap((s) => (s.heading ? [s.text] : finishStep(s))),
  );
  const ingList = ingredients.filter((x) => !x.endsWith(":"));
  const stepList = stepLines.filter((x) => !x.endsWith(":"));

  let title = titleFromText(intro);
  if (!title && opts.titleHint) title = cleanTitle(opts.titleHint);
  if (!title) title = fallbackTitle(ingList, stepList);

  const credit = creditLine(opts);
  const extra = notes
    .map((n) => textToMetric(n.replace(/\s+/g, " ").trim()).slice(0, 200))
    .filter((n, i, all) => n && all.indexOf(n) === i && n.toLowerCase() !== title.toLowerCase())
    .slice(0, MAX_NOTES);
  const noteText = [credit, ...extra].filter(Boolean).join("\n");

  // ── Confidence ──
  const withAmount = ingList.filter((x) => amountLead(x)).length;
  const firmSteps = steps.filter((s) => !s.heading && (s.numbered || stepLike(s.text))).length;
  let c = 0;
  c += (0.35 * Math.min(withAmount, 5)) / 5;
  c += (0.1 * Math.min(ingList.length, 6)) / 6;
  if (ingHeading) c += 0.15;
  if (methodHeading) c += 0.1;
  c += (0.15 * Math.min(stepList.length, 3)) / 3;
  if (numberedSteps >= 2 || firmSteps >= 2) c += 0.1;
  if (meta.serves || timeText(meta)) c += 0.05;
  if (!ingList.length) c = Math.min(c, stepList.length >= 3 ? 0.3 : 0.15);
  if (!stepList.length && withAmount < 2) c = Math.min(c, 0.3);
  const confidence = Math.round(Math.max(0, Math.min(1, c)) * 100) / 100;

  return {
    fields: {
      title,
      kind: "experiment",
      ingredients: ingredients.join("\n"),
      steps: stepLines.join("\n"),
      serves: meta.serves,
      time: timeText(meta),
      notes: noteText,
    },
    confidence,
  };
}

function sectionLike(x: string): boolean {
  return x.length <= 61 && !/^\d/.test(x);
}

/** Headings end with ":", nothing else may; no empty sections; one heading over everything is just a label. */
function finish(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines.slice(0, MAX_LINES)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(":") && sectionLike(line)) {
      if (out.length && out[out.length - 1].endsWith(":")) out.pop();
      out.push(`${headingName(line)}:`);
      continue;
    }
    const text = line.replace(/:+$/, "").trim();
    if (text && text !== out[out.length - 1]) out.push(text);
  }
  while (out.length && out[out.length - 1].endsWith(":")) out.pop();
  if (out[0]?.endsWith(":") && out.filter((l) => l.endsWith(":")).length === 1) out.shift();
  return out;
}

function finishStep(s: Step): string[] {
  const t = s.text
    .replace(/\s+/g, " ")
    .replace(/^(?:(?:step|steg)\s*\d+\s*[:.)\-–]?|\d{1,2}\s*[.)](?!\d))\s*/i, "")
    .trim();
  if (!t) return [];
  const parts = !s.numbered && t.length > 90 ? groupSentences(splitSentences(t)) : [t];
  return parts.map((p) => textToMetric(p).replace(/:+$/, "").trim().slice(0, MAX_LINE)).filter(Boolean);
}

/** Sentences back into steps of a sensible size: tiny ones join their neighbour. */
function groupSentences(sentences: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (prev.length < 40 || s.length < 25) && prev.length + s.length < 200) out[out.length - 1] = `${prev} ${s}`;
    else out.push(s);
  }
  return out;
}

function fallbackTitle(ingredients: string[], steps: string[]): string {
  const first = ingredients.map((x) => parseAmount(x).item.split(/[,(]/)[0].trim()).find((x) => x.length >= 3);
  if (first) return upperFirst(first).slice(0, 60);
  const step = steps[0];
  if (step) {
    const ws = step.replace(/[.!?].*$/, "").split(/\s+/).slice(0, 6).join(" ");
    return upperFirst(ws).slice(0, 60);
  }
  return "";
}

function creditLine(opts: TextRecipeOptions): string {
  const source = (opts.source ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const url = (opts.url ?? "").trim();
  const safeUrl = /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : "";
  if (source && safeUrl) return `From ${source}: ${safeUrl}`;
  if (source) return `From ${source}`;
  if (safeUrl) return `From ${safeUrl}`;
  return "";
}
