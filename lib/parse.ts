/** Turn a pasted or typed block into clean lines, dropping bullets and step numbers. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    // "1." and "2)" are list numbers, but "1.5 kg" is an amount: only strip a number followed by a space.
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)](?=\s)|step\s*\d+[:.)]?)\s*/i, "").trim())
    .filter(Boolean);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d > 300 ? "numeric" : undefined,
  });
}

const TILE_COLORS = ["#E0533A", "#C88A2E", "#5E8C61", "#3F6E8C", "#8C5E7A", "#B5663F", "#7A6A4F"];

/** A stable colour per recipe, so recipes without photos still read at a glance. */
export function tileColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** Today in this device's time zone, as "2026-10-03". */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-10-03" → "Today", "Yesterday", "Sep 28", or "Sep 28, 2025" for another year. */
export function dayLabel(day: string, today = localDay()): string {
  if (day === today) return "Today";
  const d = new Date(`${day}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  if (Math.round((t.getTime() - d.getTime()) / 86_400_000) === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== t.getFullYear() ? "numeric" : undefined,
  });
}
