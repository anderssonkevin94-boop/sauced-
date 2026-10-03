// What a step carries besides its words: heat and time (which appliance, how hot, how long)
// and a photo. Both are stored at the end of the step's own line, in brackets, so recipes
// stay plain lines of text that read fine anywhere and move with the step when it's reordered:
//
//   "Roast until golden [Oven 200°C fan · 25 min]"
//   "Sear on all sides [Pan high · 3 min] [photo 8c1…/2f9….jpg]"
//   "Cook the steak [Sous vide 56.5°C · 2 h]"
//
// Pure (no imports) so the form, the recipe page and cook mode all share it.

export type Appliance = "oven" | "airfryer" | "sousvide" | "pan" | "pot";

export type Heat = {
  appliance: Appliance;
  /** Degrees Celsius as typed ("200", "56.5") for oven, air fryer and sous vide; a level ("medium-high") for pan and pot. */
  heat: string;
  /** Oven only: "fan", "top & bottom", "grill". */
  mode: string;
  /** "25", "20-25" or "1.5"; empty when the step has no time. */
  time: string;
  timeUnit: "min" | "h";
};

type ApplianceInfo = { id: Appliance; label: string; levels: string[] | null };

/** Appliances with `levels` are set by a dial; the rest by degrees. */
export const APPLIANCES: ApplianceInfo[] = [
  { id: "oven", label: "Oven", levels: null },
  { id: "airfryer", label: "Air fryer", levels: null },
  { id: "sousvide", label: "Sous vide", levels: null },
  { id: "pan", label: "Pan", levels: ["low", "medium-low", "medium", "medium-high", "high"] },
  { id: "pot", label: "Pot", levels: ["low", "simmer", "medium", "high", "boil"] },
];

export const OVEN_MODES = ["fan", "top & bottom", "grill"];

export const applianceInfo = (a: Appliance) => APPLIANCES.find((x) => x.id === a)!;

export const emptyHeat = (appliance: Appliance): Heat => ({
  appliance,
  heat: "",
  mode: "",
  time: "",
  timeUnit: appliance === "sousvide" ? "h" : "min",
});

// ── Reading and writing the bracket ────────────────────────

const LABEL_RE = APPLIANCES.map((a) => a.label.replace(" ", "\\s*")).join("|");
const TAG_RE = new RegExp(String.raw`\s*\[(${LABEL_RE})\b([^\[\]]*)\]\s*$`, "i");

const PHOTO_RE = /\s*\[photo ([^\[\]\s]+)\]\s*$/i;

export type Step = { text: string; heat: Heat | null; photo: string | null };

/** "Roast [Oven 200°C fan · 25 min] [photo a/b.jpg]" → { text: "Roast", heat: {...}, photo: "a/b.jpg" }. */
export function splitStep(line: string): Step {
  let text = line;
  let heat: Heat | null = null;
  let photo: string | null = null;
  // Either order, each at most once.
  for (let i = 0; i < 2; i++) {
    const p: RegExpExecArray | null = photo === null ? PHOTO_RE.exec(text) : null;
    if (p) {
      photo = p[1];
      text = text.slice(0, p.index);
      continue;
    }
    const h: RegExpExecArray | null = heat === null ? TAG_RE.exec(text) : null;
    if (h) {
      heat = readHeat(h);
      text = text.slice(0, h.index);
    }
  }
  return { text: text.trim(), heat, photo };
}

function readHeat(m: RegExpExecArray): Heat {
  const label = m[1].replace(/\s+/g, " ").toLowerCase();
  const info = APPLIANCES.find((a) => a.label.toLowerCase() === label)!;
  const [heatPart = "", timePart = ""] = m[2].split("·").map((s) => s.trim());
  const heat = emptyHeat(info.id);

  if (info.levels) {
    heat.heat = heatPart.toLowerCase();
  } else {
    const t = /^(\d+(?:[.,]\d+)?)\s*°?\s*C?\b\s*(.*)$/i.exec(heatPart);
    if (t) {
      heat.heat = t[1].replace(",", ".");
      heat.mode = info.id === "oven" ? t[2].trim().toLowerCase() : "";
    }
  }

  const t = /^(.+?)\s*(min|minutes?|h|hours?|hr|tim(?:me|mar)?)\.?$/i.exec(timePart);
  if (t) {
    heat.time = t[1].trim();
    heat.timeUnit = /^min/i.test(t[2]) ? "min" : "h";
  }
  return heat;
}

/** "200°C fan" or "medium-high": the heat part on its own, for display. */
export function heatLabel(h: Heat): string {
  if (!h.heat) return "";
  if (applianceInfo(h.appliance).levels) return h.heat;
  return [`${h.heat}°C`, h.appliance === "oven" ? h.mode : ""].filter(Boolean).join(" ");
}

export const timeLabel = (h: Heat) => (h.time ? `${h.time} ${h.timeUnit}` : "");

/** True when there's something worth saving: a heat or a time. */
export const hasHeat = (h: Heat | null): h is Heat => !!h && !!(h.heat || h.time);

/** The step's line with its brackets: "Roast until golden [Oven 200°C fan · 25 min] [photo a/b.jpg]". */
export function joinStep({ text, heat, photo }: Step): string {
  const out = [text.trim()];
  if (hasHeat(heat)) {
    const parts = [applianceInfo(heat.appliance).label, heatLabel(heat)].filter(Boolean).join(" ");
    out.push(`[${heat.time ? `${parts} · ${timeLabel(heat)}` : parts}]`);
  }
  if (photo) out.push(`[photo ${photo}]`);
  return out.filter(Boolean).join(" ");
}

/** Minutes a step's time adds up to (the top of a range), for cook mode's timer. Null without a time. */
export function heatMinutes(h: Heat): number | null {
  const nums = h.time.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const n = Number(nums[nums.length - 1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return h.timeUnit === "h" ? n * 60 : n;
}

/** Picking another appliance: degrees carry over between oven, air fryer and sous vide; a dial starts over. Time carries over. */
export function switchAppliance(current: Heat | null, a: Appliance): Heat {
  const next = emptyHeat(a);
  if (current && !applianceInfo(current.appliance).levels && !applianceInfo(a).levels) next.heat = current.heat;
  if (current?.time) Object.assign(next, { time: current.time, timeUnit: current.timeUnit });
  return next;
}

/**
 * A time written in the step's words, for steps without a heat-and-time tag:
 * "oven for 3 hours" → 180, "air fry for 25 minutes" → 25, "simmer 5–7 min" → 7. Null if none.
 */
export function textMinutes(text: string): number | null {
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to|till)\s*(\d+(?:[.,]\d+)?))?\s*(minutes?|minuter|mins?|hours?|hrs?|h|timmar|timme|tim)\b/gi;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number((m[2] ?? m[1]).replace(",", "."));
    const minutes = /^(hours?|hrs?|h|timmar|timme|tim)$/i.test(m[3]) ? n * 60 : n;
    if (minutes > 0 && (best === null || minutes > best)) best = minutes;
  }
  return best;
}
