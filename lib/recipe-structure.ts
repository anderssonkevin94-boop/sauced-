import { z } from "zod";
import { FORMAT_RULES } from "@/lib/recipe-format";
import { durationLabel } from "@/lib/together";
import { APPLIANCES, OVEN_MODES, emptyHeat, joinStep, type Appliance, type Heat } from "@/lib/step";
import type { TidyFields } from "@/lib/tidy";

// What Claude returns when it reads a recipe (Tidy up, and imports when an Anthropic key is
// set): the recipe in clear steps, each with how long it takes, whether that's hands-off
// waiting worth a timer, its appliance and heat, and the author's tip that belongs to it; and
// the honest total and hands-on time. Turned into the app's lines and step tags here.

const StepSchema = z.object({
  text: z.string().describe("One clear action, imperative, in the source language. No times or temperatures needed here if they're in the fields below, but keep them if they read naturally."),
  minutes: z
    .number()
    .nullable()
    .describe("How long this step really takes, including any waiting (baking, resting, simmering). The source's time if it gives one, otherwise your realistic estimate. Null only for instant steps."),
  stated: z.boolean().describe("true when the source states this step's time, false when it's your estimate"),
  waiting: z.boolean().describe("true when most of the time is hands-off waiting (in the oven, resting, chilling, rising, simmering unattended): worth a timer"),
  appliance: z.string().nullable().describe('"oven", "airfryer", "sousvide", "pan" or "pot" when the step uses one with a heat setting; otherwise null'),
  heat: z
    .string()
    .nullable()
    .describe('Oven, air fryer, sous vide: degrees Celsius as digits ("175"). Pan: low, medium-low, medium, medium-high or high. Pot: low, simmer, medium, high or boil. Null if not given or not applicable.'),
  oven_mode: z.string().nullable().describe('Oven only: "fan", "top & bottom" or "grill" if the source says; else null'),
  tip: z
    .string()
    .nullable()
    .describe("The author's advice that belongs to this step (what it should look or feel like, what to watch for, how to fix a common problem), short, in the source language. Null if none."),
});

export const StructuredSchema = z.object({
  title: z.string().describe("Short recipe name in the source language. Empty only if there is no recipe."),
  kind: z.string().describe('"classic" or "experiment"'),
  serves: z.string().nullable().describe('e.g. "4" or "4–6". Null if the source does not say.'),
  ingredient_sections: z.array(
    z.object({
      name: z.string().nullable().describe("Section name without a colon, or null for an unnamed section"),
      items: z.array(z.string()),
    }),
  ),
  step_sections: z.array(
    z.object({
      name: z.string().nullable().describe("Section name without a colon, or null for an unnamed section"),
      steps: z.array(StepSchema),
    }),
  ),
  total_minutes: z.number().nullable().describe("Start to finish, following the steps in order (overlapping waits counted once). Null if there's nothing to go on."),
  active_minutes: z.number().nullable().describe("Of that, the hands-on time. Null if unknown."),
  notes: z.string().describe("The personal story, general tips that don't belong to one step, variations, storage, and the source, in the source language, as short plain text. Empty if nothing."),
});
export type StructuredDraft = z.infer<typeof StructuredSchema>;

/** The rules that go with the schema; kept byte-stable so the system prompt caches. */
export const STRUCTURE_RULES = `${FORMAT_RULES}

Structure:
- Every step is something to do, in the order it's done. The author's remarks, chatter and stories are not steps.
- A remark about one step (what it should look like, a warning, a fix if it goes wrong) is that step's tip. General advice goes in notes.
- Split a step that does two unrelated things; keep a step whole when its parts happen together.
- Give every step a realistic time: the source's when it says one (stated: true), otherwise your estimate from experience (stated: false). Waiting counts: 15 minutes in the oven is 15 minutes.
- Set appliance and heat when a step uses the oven, an air fryer, a sous vide, a pan or a pot at a stated or clearly implied heat. "Sätt ugnen på 175 grader" is the oven at 175.
- total_minutes follows the steps in order; a wait that overlaps other work (the oven heating while you mix) counts once.`;

const LEVELS = new Set(APPLIANCES.flatMap((a) => a.levels ?? []));

/** A step's appliance and heat from Claude's fields, or null when it gave none we can use. */
function toHeat(s: z.infer<typeof StepSchema>): Heat | null {
  const id = (s.appliance ?? "").toLowerCase().replace(/[\s_-]/g, "") as Appliance;
  const info = APPLIANCES.find((a) => a.id === id);
  if (!info) return null;
  const heat = emptyHeat(info.id);
  const h = (s.heat ?? "").trim().toLowerCase();
  if (info.levels) heat.heat = LEVELS.has(h) && info.levels.includes(h) ? h : "";
  else heat.heat = /^\d+(?:[.,]\d+)?$/.test(h) ? h.replace(",", ".") : (/(\d+(?:[.,]\d+)?)/.exec(h)?.[1] ?? "");
  if (info.id === "oven" && s.oven_mode && OVEN_MODES.includes(s.oven_mode.toLowerCase())) heat.mode = s.oven_mode.toLowerCase();
  return heat;
}

const clean = (line: string) => line.replace(/\s+/g, " ").trim().replace(/:+$/, "").trim();

/** One step as the app stores it: the words plus [Oven …], [time …] and [tip …] tags. */
function stepLine(s: z.infer<typeof StepSchema>): string {
  const heat = toHeat(s);
  const minutes = s.minutes && s.minutes > 0 ? Math.round(s.minutes) : null;
  // A wait at a heat: its time goes on the heat tag (one timer, "Oven · 175°C · 15 min").
  if (heat && minutes && s.waiting) {
    heat.time = minutes >= 120 && minutes % 30 === 0 ? String(minutes / 60) : String(minutes);
    heat.timeUnit = minutes >= 120 && minutes % 30 === 0 ? "h" : "min";
    return joinStep({ text: clean(s.text), heat, photo: null, tip: s.tip });
  }
  // Otherwise the step's own time: a wait gets a timer, hands-on work is "about".
  return joinStep({
    text: clean(s.text),
    heat: heat && (heat.heat || heat.mode) ? heat : null,
    photo: null,
    minutes,
    approx: !s.waiting,
    tip: s.tip,
  });
}

function flatten<T>(sections: { name: string | null; lines: T[] }[], toLine: (t: T) => string): string {
  const out: string[] = [];
  for (const s of sections) {
    const lines = s.lines.map(toLine).filter(Boolean);
    if (!lines.length) continue;
    const name = s.name ? clean(s.name) : "";
    if (name) out.push(`${name}:`);
    out.push(...lines);
  }
  return out.join("\n");
}

/** Claude's structured recipe as the form's fields, step tags and all. */
export function structuredToFields(d: StructuredDraft): TidyFields {
  const total = d.total_minutes && d.total_minutes > 0 ? Math.round(d.total_minutes) : null;
  const active = d.active_minutes && d.active_minutes > 0 ? Math.round(d.active_minutes) : null;
  const time = total ? (active && active < total ? `${durationLabel(total)} (${durationLabel(active)} hands-on)` : durationLabel(total)) : "";
  return {
    title: d.title.trim().slice(0, 120),
    kind: d.kind.trim().toLowerCase() === "classic" ? "classic" : "experiment",
    ingredients: flatten(d.ingredient_sections.map((s) => ({ name: s.name, lines: s.items })), clean),
    steps: flatten(d.step_sections.map((s) => ({ name: s.name, lines: s.steps })), stepLine),
    serves: d.serves?.trim() ?? "",
    time,
    notes: d.notes.trim(),
  };
}

/** A recipe's fields as plain text, for Claude to restructure. */
export function fieldsToText(f: TidyFields): string {
  return [
    f.title,
    f.serves && `Serves: ${f.serves}`,
    f.time && `Time: ${f.time}`,
    f.ingredients && `Ingredients:\n${f.ingredients}`,
    f.steps && `Method:\n${f.steps}`,
    f.notes && `Notes:\n${f.notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
