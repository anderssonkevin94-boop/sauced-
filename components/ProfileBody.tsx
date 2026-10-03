"use client";
import "@/app/styles/profile.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { KindBadge, Tile } from "@/components/bits";
import { CookHistory } from "@/components/CookHistory";
import { localDay, timeAgo } from "@/lib/parse";
import { cookStats, type CookStats } from "@/lib/stats";
import type { CookedWithRecipe, Recipe } from "@/lib/types";

/**
 * Someone's corner of the kitchen: their numbers, a 12-week chart, what they cook most,
 * the recipes they've posted and everything they've logged. Used by profiles and the You tab.
 */
export function ProfileBody({
  cookId,
  name,
  isMe,
  log,
  posted,
}: {
  cookId: string;
  name: string;
  isMe: boolean;
  /** The whole kitchen's cook log (for "cooked by others"), or null when it isn't set up. */
  log: CookedWithRecipe[] | null;
  posted: Pick<Recipe, "id" | "title" | "kind" | "photoUrl" | "updatedAt">[];
}) {
  const [today] = useState(localDay);
  const stats = useMemo(
    () =>
      log &&
      cookStats(
        log.map((e) => ({ cookId: e.cook.id, on: e.on, note: e.note, photoUrl: e.photoUrl, recipe: e.recipe })),
        cookId,
        today,
      ),
    [log, cookId, today],
  );
  const mine = useMemo(() => log?.filter((e) => e.cook.id === cookId) ?? [], [log, cookId]);
  const who = isMe ? "You" : name;

  return (
    <>
      {stats && <StatTiles stats={stats} posted={posted.length} isMe={isMe} />}
      {stats && stats.total > 0 && <WeekChart weeks={stats.weeks} />}

      {stats && stats.top.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Cooks most</h2>
          </div>
          <ol className="top-list">
            {stats.top.map((t, i) => (
              <li key={t.id}>
                <Link href={`/r/${t.id}`}>
                  <span className="rank">{i + 1}</span>
                  <Tile recipe={t} />
                  <span className="name">{t.title}</span>
                  <span className="count">{t.count}×</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="eyebrow">{isMe ? "Your recipes" : "Recipes"}</h2>
          <span className="eyebrow">{posted.length}</span>
        </div>
        {posted.length === 0 ? (
          <p className="muted">{who} hasn&rsquo;t posted a recipe yet.</p>
        ) : (
          <ul className="list">
            {posted.map((r) => (
              <li key={r.id}>
                <Link href={`/r/${r.id}`} className="row">
                  <Tile recipe={r} />
                  <div className="text">
                    <h3>{r.title}</h3>
                    <div className="meta">
                      <KindBadge kind={r.kind} />
                      <span className="dot" />
                      <span suppressHydrationWarning>{timeAgo(r.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {log && (
        <CookHistory
          entries={mine}
          title={isMe ? "Your cooking" : "Cooking"}
          empty={isMe ? undefined : `${name} hasn't logged any cooking yet.`}
          stats={false}
        />
      )}
    </>
  );
}

function StatTiles({ stats: s, posted, isMe }: { stats: CookStats; posted: number; isMe: boolean }) {
  const tiles: { value: string | number; label: string; sub?: string }[] = [
    { value: s.total, label: "Cooked", sub: `${s.thisMonth} this month` },
    { value: s.distinct, label: s.distinct === 1 ? "Recipe cooked" : "Recipes cooked", sub: `${s.thisYear} ${s.thisYear === 1 ? "cook" : "cooks"} this year` },
    {
      value: s.streak,
      label: "Week streak",
      sub: s.longestStreak > s.streak ? `Best: ${s.longestStreak}` : s.streak ? "Best yet" : "Cook this week to start one",
    },
    { value: posted, label: posted === 1 ? "Recipe posted" : "Recipes posted" },
    {
      value: s.cookedByOthers,
      label: isMe ? "Others cooked yours" : "Others cooked theirs",
      sub: s.othersWhoCooked ? `by ${s.othersWhoCooked} ${s.othersWhoCooked === 1 ? "person" : "people"}` : undefined,
    },
    {
      value: s.favouriteDay ? s.favouriteDay.slice(0, 3) : "–",
      label: "Favourite day",
      sub: s.photos || s.comments ? `${s.photos} ${s.photos === 1 ? "photo" : "photos"} · ${s.comments} ${s.comments === 1 ? "note" : "notes"}` : undefined,
    },
  ];
  return (
    <section className="section">
      <div className="stat-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <span className={`v${typeof t.value === "string" && t.value.length > 3 ? " word" : ""}`} suppressHydrationWarning>
              {t.value}
            </span>
            <span className="l">{t.label}</span>
            {t.sub && <span className="s" suppressHydrationWarning>{t.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

const weekLabel = (start: string) =>
  new Date(`${start}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Cooks per week, last 12 weeks: thin bars on a baseline, a tooltip per bar, a table for screen readers. */
function WeekChart({ weeks }: { weeks: { start: string; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const peak = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0);
  const shown = active ?? null;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="eyebrow">Last 12 weeks</h2>
        <span className="eyebrow" suppressHydrationWarning>
          {shown !== null ? `${weekLabel(weeks[shown].start)}: ${weeks[shown].count}` : `${weeks.reduce((n, w) => n + w.count, 0)} cooks`}
        </span>
      </div>
      <div className="week-chart" aria-hidden="true" onMouseLeave={() => setActive(null)}>
        <div className="plot">
          {weeks.map((w, i) => (
            <button
              key={w.start}
              type="button"
              tabIndex={-1}
              className="bar-hit"
              data-active={active === i || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
            >
              {w.count > 0 && <i className="bar" style={{ height: `${(w.count / max) * 100}%` }} />}
              {i === peak && w.count > 0 && active === null && <span className="peak">{w.count}</span>}
              {active === i && (
                <span className="tip" data-edge={i < 2 ? "start" : i > 9 ? "end" : undefined} suppressHydrationWarning>
                  <span className="tip-v">
                    <b>{w.count}</b> {w.count === 1 ? "cook" : "cooks"}
                  </span>
                  <span className="tip-l">Week of {weekLabel(w.start)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="axis" suppressHydrationWarning>
          <span>{weekLabel(weeks[0].start)}</span>
          <span>This week</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Cooks per week, last 12 weeks</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.start}>
              <th scope="row">Week of {weekLabel(w.start)}</th>
              <td>{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
