// Which ingredients each step uses, with their amounts, so a step never sends you back to the
// list. Pure; used by the recipe page, cook mode and cooking together.
//
//   "Rör samman smör, strösocker och vaniljsocker"   → smör, strösocker, vaniljsocker
//   "Tillsätt choklad" / "…chokladen"                → 200 g mjölkchoklad (compound words)
//   "Tillsätt resten av ingredienserna, förutom chokladen"
//                                                    → everything no earlier step used, minus chocolate
//   "Garnera med chokladbitar och flingsalt"         → the "ytterligare choklad + flingsalt…" line
//
// Every real word of an ingredient's name counts (not just the last), filler and preparation
// words don't, and a garnish line only goes with steps that garnish, top or serve.

import { sectionize, type Ingredient } from "@/lib/recipe";
import { splitStep } from "@/lib/step";

/** Words that never name an ingredient: amounts' filler, preparation, sizes, and small words in both languages. */
const STOP = new Set(
  (
    "a an of the and or some for to into onto with from then taste about lot few bit splash dash drizzle fresh large small medium big " +
    "heaped level good extra whole ground chopped sliced diced minced grated finely roughly optional plus more serve serving served bone in " +
    "softened soft melted cold warm room temperature frozen dried crushed peeled halved cubed packed loosely firmly divided " +
    "decorate decoration garnish topping top sprinkle sprinkling needed if as you like " +
    "smashed beaten sifted rinsed drained trimmed zested juiced deseeded separated halved quartered thinly thickly lightly " +
    "skalad skalade sköljd sköljda avrunnen avrunna delad delade strimlad strimlade krossad krossade vispad uppvispat urkärnad " +
    "och med att för till på av som det den de en ett eller i om efter smak ca cirka gärna valfritt valfri lite mer mycket " +
    "färsk färska stor stora liten små hel hela hackad hackade finhackad finhackade grovhackad grovhackade riven rivna rivet " +
    "mjukt mjuk mjuka rumstempererat rumstempererad rumsvarmt rumsvarm smält smälta kall kallt kalla varm varmt varma " +
    "ljummen ljummet fryst frysta torkad torkade mald malda skivad skivade tärnad tärnade pressad pressade kokt kokta rå " +
    "ytterligare extra dekorera dekoration garnering garnera toppa topping servering servera kakorna bitar bit st"
  ).split(/\s+/),
);

/** A garnish or serving line: it belongs with the step that garnishes, tops or serves. */
const GARNISH_LINE = /(?<![\p{L}])(?:ytterligare|extra|till servering|att servera|till garnering|att dekorera|dekoration|till toppen|att strö över|to serve|for serving|for garnish|to garnish|to decorate|for decorating|for topping)(?![\p{L}])/iu;
const GARNISH_STEP = /(?<![\p{L}])(?:garner|dekorer|strö|toppa|servera|serve|garnish|decorat|sprinkl|top with|topped)/iu;

/** "Add the rest of the ingredients", "Tillsätt resten av ingredienserna", "everything else". */
const REST = /(?<![\p{L}])(?:resten av (?:alla )?ingredienserna|resterande ingredienser(?:na)?|återstående ingredienser(?:na)?|övriga ingredienser(?:na)?|alla (?:de )?(?:övriga |andra )?ingredienser(?:na)?|resten av (?:de )?torra ingredienser(?:na)?|(?:the )?rest of (?:the )?ingredients|(?:the )?remaining ingredients|all (?:of )?(?:the )?(?:other |remaining )?ingredients|everything else)(?![\p{L}])/iu;
/** "…, förutom chokladen" / "except the chocolate": what the rest leaves out, up to the end of that clause. */
const EXCEPT = /(?<![\p{L}])(?:förutom|utom|except(?: for)?|apart from|but not|minus)(?![\p{L}])([^.;]*)/iu;

const letters = /[^\p{L}]+/u;

/** "chokladen" → "choklad", "ingredienserna" → "ingrediens", "äggen" → "ägg": Swedish definite and plural endings off. */
function base(w: string): string {
  return w
    .toLowerCase()
    .replace(/(?:erna|arna|orna)$/, "")
    .replace(/(?:en|et|na)$/, (m, i: number) => (i >= 4 ? "" : m))
    .replace(/(?:es|s)$/, (m, i: number) => (i >= 4 ? "" : m));
}

/**
 * The words that name an ingredient: the main word of each thing in its name, before any
 * bracket. "300 g mjukt, rumstempererat smör (mjölkfritt…)" → ["smör"]; "Splash of pasta water"
 * → ["water"]; "ytterligare choklad + flingsalt att dekorera" → ["choklad", "flingsalt"];
 * "2 onions, 2 carrots" → ["onions", "carrots"].
 */
export function nameWords(item: string): string[] {
  const name = item.split("(")[0].toLowerCase();
  const heads: string[] = [];
  for (const part of name.split(/[,+&]|\s(?:och|and|eller|or|med|with|att|to)\s/)) {
    const words = part.split(letters).filter((w) => w.length >= 3 && !STOP.has(w));
    if (words.length) heads.push(words[words.length - 1]);
  }
  return [...new Set(heads)];
}

/** How well a step word names an ingredient word: 3 the same word, 2 a compound of it, 0 not at all. */
function wordMatch(ing: string, step: string): number {
  if (step.length < 3) return 0;
  const a = base(ing);
  const b = base(step);
  if (a === b || ing === step) return 3;
  // Short words only take endings ("ägg"/"äggen", "lök"/"löken"), so "pea" doesn't match "peach".
  if (step.startsWith(ing) && step.length - ing.length <= 3 && /^(?:en|et|n|t|s|es|na|arna|erna)$/.test(step.slice(ing.length))) return 3;
  // Compounds: "mjölkchoklad" is choklad, "chokladbitar" is choklad, "vaniljsocker" is socker.
  if (b.length >= 5 && a.length > b.length && a.endsWith(b)) return 2;
  if (a.length >= 5 && b.length > a.length && b.startsWith(a)) return 2;
  return 0;
}

type Hit = { index: number; score: number; word: string; section: string | null };

/** The ingredients a step's words name, best match per step word (`all`: every one, no picking). */
function named(text: string, list: Ingredient[], garnishStep: boolean, all = false): Hit[] {
  const words = [...new Set(text.toLowerCase().split(letters).filter((w) => w.length >= 3 && !STOP.has(w)))];
  const hits: Hit[] = [];
  for (const ing of list) {
    if (GARNISH_LINE.test(ing.amount.item) && !garnishStep) continue;
    let best = 0;
    let word = "";
    for (const iw of nameWords(ing.amount.item))
      for (const sw of words) {
        const s = wordMatch(iw, sw);
        if (s > best) [best, word] = [s, sw];
      }
    if (best) hits.push({ index: ing.index, score: best, word, section: ing.section });
  }
  if (all) return hits;
  // One step word naming several ingredients ("socker" → strösocker and vaniljsocker): keep the
  // exact ones over compounds, and when the same ingredient is in two sections, the section
  // this step draws from most.
  const perSection = new Map<string | null, number>();
  for (const h of hits) perSection.set(h.section, (perSection.get(h.section) ?? 0) + 1);
  return hits.filter((h) =>
    hits.every((o) => {
      if (o === h || o.word !== h.word) return true;
      if (o.score !== h.score) return h.score > o.score;
      const sameName = nameWords(list[o.index].amount.item).join(" ") === nameWords(list[h.index].amount.item).join(" ");
      return !sameName || (perSection.get(h.section) ?? 0) >= (perSection.get(o.section) ?? 0);
    }),
  );
}

/**
 * For each step (in order, sections not counted), the indexes into `list` of the ingredients
 * it uses. "The rest of the ingredients" gets every ingredient no earlier step used (in the
 * step's own section when the ingredients have one by that name), minus what it excepts.
 */
export function stepIngredients(steps: { text: string; section: string | null }[], list: Ingredient[]): number[][] {
  const used = new Set<number>();
  return steps.map(({ text, section }) => {
    const garnishStep = GARNISH_STEP.test(text);
    let out = named(text, list, garnishStep).map((h) => h.index);

    if (REST.test(text)) {
      const except = EXCEPT.exec(text)?.[1] ?? "";
      // "förutom chokladen": every ingredient it names stays out, the garnish chocolate too.
      const excluded = new Set(except ? named(except, list, true, true).map((h) => h.index) : []);
      const sameSection = section && list.some((i) => i.section?.toLowerCase() === section.toLowerCase());
      for (const ing of list) {
        if (used.has(ing.index) || excluded.has(ing.index) || GARNISH_LINE.test(ing.amount.item)) continue;
        if (sameSection && ing.section?.toLowerCase() !== section!.toLowerCase()) continue;
        if (!out.includes(ing.index)) out.push(ing.index);
      }
      out = out.filter((i) => !excluded.has(i));
    }

    out.sort((a, b) => a - b);
    for (const i of out) used.add(i);
    return out;
  });
}

/** stepIngredients for a recipe's step lines as stored (section headings, heat tags and all), by step index. */
export function recipeStepUses(stepLines: string[], list: Ingredient[]): number[][] {
  const steps = sectionize(stepLines, (line) => line).flatMap((s) => s.items.map((line) => ({ text: splitStep(line).text, section: s.name })));
  return stepIngredients(steps, list);
}
