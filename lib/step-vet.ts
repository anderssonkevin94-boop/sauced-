// Vetting imported steps: a recipe's method should be things to do. Blogs mix in remarks
// ("They should still be soft in the middle"), tips ("Sometimes a few spread unevenly…")
// and chatter ("I love these!"). On import: remarks join the step before them, tips and
// chatter go to the notes. Pure; only used on imported recipes, never on what people type.

import type { TidyFields } from "@/lib/tidy";

/** Describes the result of the step before: "De ska…", "Den blir…", "It should…", "They will…". */
const REMARK = /^(?:de|den|det|dessa|detta|they|it|this|these|those|the (?:dough|batter|mixture|cookies|cake|sauce)|degen|smeten|kakorna|såsen)\s+(?:ska|skall|bör|blir|kommer|kan|är|will|should|may|might|can|are|is|look|feel|turn)(?![\p{L}])/iu;
/** A tip: optional, conditional or background, not the next thing to do. */
const TIP = /^(?:tips?|obs|notera|note|psst|pro tip|ibland|ofta|om du vill|if you(?:'d)? (?:like|want|prefer)|sometimes|you can also|du kan också|ni kan också|alternativt|alternatively|optional(?:ly)?|valfritt)(?![\p{L}])/iu;
/** Chatter: the author talking, not the recipe. */
// Not a bare "I": Swedish steps start with "I en bunke…" (in a bowl).
const CHATTER = /^(?:jag|vi|i(?:'m| am| love| hope| like| think| made)|we(?:'re| are| love| hope)|hope|hoppas|enjoy|smaklig måltid|lycka till|good luck|happy (?:baking|cooking)|tack|thanks|love,|xoxo|pin (?:this|it)|följ mig|dela gärna)(?![\p{L}])/iu;

/** A remark gets appended to the step before it ("Grädda 15 min. De ska fortfarande vara mjuka."). */
function joinRemark(prev: string, remark: string): string {
  const p = prev.trim();
  return `${/[.!?]$/.test(p) ? p : `${p}.`} ${remark.trim()}`;
}

export function vetSteps(steps: string[]): { steps: string[]; notes: string[] } {
  const out: string[] = [];
  const notes: string[] = [];
  for (const raw of steps) {
    const line = raw.trim();
    if (!line) continue;
    // Section headings ("Sås:") stay as they are.
    if (/:$/.test(line)) {
      out.push(line);
      continue;
    }
    if (CHATTER.test(line)) {
      notes.push(line);
      continue;
    }
    if (TIP.test(line)) {
      notes.push(line);
      continue;
    }
    const prev = out.length ? out[out.length - 1] : "";
    if (REMARK.test(line) && prev && !/:$/.test(prev)) {
      out[out.length - 1] = joinRemark(prev, line);
      continue;
    }
    out.push(line);
  }
  return { steps: out, notes };
}

/** An imported recipe with its method vetted: tips and chatter moved to the end of the notes. */
export function vetFields(f: TidyFields): TidyFields {
  const { steps, notes } = vetSteps(f.steps.split("\n"));
  if (!notes.length && steps.join("\n") === f.steps) return f;
  const extra = notes.length ? `Tips: ${notes.join(" ")}` : "";
  return { ...f, steps: steps.join("\n"), notes: [f.notes.trim(), extra].filter(Boolean).join("\n") };
}
