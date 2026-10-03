// A cook's numbers, from the kitchen's cook log: how much they cook, their streaks, what
// they make most, and how often others make their recipes. Pure, so it runs anywhere.
// Days are the cook's own calendar days ("2026-10-03"); weeks start on Monday.

export type StatEntry = {
  cookId: string;
  on: string;
  note: string;
  photoUrl: string | null;
  recipe: { id: string; title: string; photoUrl: string | null; authorId: string };
};

export type CookStats = {
  total: number;
  thisMonth: number;
  thisYear: number;
  /** Different recipes cooked. */
  distinct: number;
  /** Weeks in a row with at least one cook, up to this week (still alive if only last week counts so far). */
  streak: number;
  longestStreak: number;
  /** "Sunday", once there's enough to say. */
  favouriteDay: string | null;
  /** The last 12 weeks, oldest first: Monday of the week and how many cooks. */
  weeks: { start: string; count: number }[];
  top: { id: string; title: string; photoUrl: string | null; count: number }[];
  /** Times someone else cooked one of this cook's recipes, and how many people did. */
  cookedByOthers: number;
  othersWhoCooked: number;
  photos: number;
  comments: number;
};

const DAY = 86_400_000;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10);
/** 0 = Monday. */
const weekday = (day: string) => (new Date(toTime(day)).getUTCDay() + 6) % 7;
const monday = (day: string) => toDay(toTime(day) - weekday(day) * DAY);

export function cookStats(entries: StatEntry[], cookId: string, today: string): CookStats {
  const mine = entries.filter((e) => e.cookId === cookId);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  // Weeks with cooking, for streaks and the chart.
  const perWeek = new Map<string, number>();
  for (const e of mine) perWeek.set(monday(e.on), (perWeek.get(monday(e.on)) ?? 0) + 1);

  const thisWeek = monday(today);
  let streak = 0;
  // This week not cooked in yet doesn't break the streak; it just doesn't add to it.
  let w = perWeek.has(thisWeek) ? thisWeek : toDay(toTime(thisWeek) - 7 * DAY);
  while (perWeek.has(w)) {
    streak++;
    w = toDay(toTime(w) - 7 * DAY);
  }

  let longestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const wk of [...perWeek.keys()].sort()) {
    const t = toTime(wk);
    run = prev !== null && t - prev === 7 * DAY ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = t;
  }

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = toDay(toTime(thisWeek) - (11 - i) * 7 * DAY);
    return { start, count: perWeek.get(start) ?? 0 };
  });

  const byRecipe = new Map<string, { id: string; title: string; photoUrl: string | null; count: number }>();
  for (const e of mine) {
    const r = byRecipe.get(e.recipe.id) ?? { id: e.recipe.id, title: e.recipe.title, photoUrl: e.recipe.photoUrl, count: 0 };
    r.count++;
    byRecipe.set(e.recipe.id, r);
  }
  const top = [...byRecipe.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 5);

  const dayCounts = new Array(7).fill(0) as number[];
  for (const e of mine) dayCounts[weekday(e.on)]++;
  const best = Math.max(...dayCounts);
  // Only once there's a clear favourite among a few cooks.
  const favouriteDay = mine.length >= 3 && dayCounts.filter((n) => n === best).length === 1 ? DAYS[dayCounts.indexOf(best)] : null;

  const byOthers = entries.filter((e) => e.recipe.authorId === cookId && e.cookId !== cookId);

  return {
    total: mine.length,
    thisMonth: mine.filter((e) => e.on.startsWith(month)).length,
    thisYear: mine.filter((e) => e.on.startsWith(year)).length,
    distinct: byRecipe.size,
    streak,
    longestStreak,
    favouriteDay,
    weeks,
    top,
    cookedByOthers: byOthers.length,
    othersWhoCooked: new Set(byOthers.map((e) => e.cookId)).size,
    photos: mine.filter((e) => e.photoUrl).length,
    comments: mine.filter((e) => e.note.trim()).length,
  };
}
