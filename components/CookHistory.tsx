"use client";
import "@/app/styles/cooklog.css";
import Link from "next/link";
import { useState } from "react";
import { Tile } from "@/components/bits";
import { dayLabel, localDay } from "@/lib/parse";
import type { CookedWithRecipe } from "@/lib/types";

const SHOWN = 12;

/** Everything you've logged, newest first, grouped by month, with your most-made recipes on top. */
export function CookHistory({ entries }: { entries: CookedWithRecipe[] }) {
  const [today] = useState(localDay);
  const [all, setAll] = useState(false);

  const counts = new Map<string, { title: string; n: number }>();
  for (const e of entries) {
    const c = counts.get(e.recipe.id) ?? { title: e.recipe.title, n: 0 };
    c.n++;
    counts.set(e.recipe.id, c);
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3).filter(([, c]) => c.n > 1);
  const thisMonth = entries.filter((e) => e.on.slice(0, 7) === today.slice(0, 7)).length;

  const shown = all ? entries : entries.slice(0, SHOWN);
  const months: { label: string; items: CookedWithRecipe[] }[] = [];
  for (const e of shown) {
    const label = monthLabel(e.on, today);
    if (months[months.length - 1]?.label !== label) months.push({ label, items: [] });
    months[months.length - 1].items.push(e);
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="eyebrow">Your cooking</h2>
        <span className="eyebrow">{entries.length}×</span>
      </div>

      {entries.length === 0 ? (
        <p className="muted">Nothing logged yet. Tap &ldquo;I cooked this&rdquo; on a recipe after you make it.</p>
      ) : (
        <>
          <div className="history-stats">
            <span className="fact" suppressHydrationWarning>{thisMonth} this month</span>
            <span className="fact">{counts.size} {counts.size === 1 ? "recipe" : "recipes"}</span>
            {top.map(([id, c]) => (
              <Link key={id} href={`/r/${id}#cooked`} className="fact">
                {c.title} · {c.n}×
              </Link>
            ))}
          </div>

          {months.map((m) => (
            <div key={m.label}>
              <h3 className="eyebrow history-month" suppressHydrationWarning>{m.label}</h3>
              <ul className="history">
                {m.items.map((e) => (
                  <li key={e.id}>
                    <Link href={`/r/${e.recipe.id}#cooked`}>
                      <Tile recipe={e.recipe} />
                      <div className="text">
                        <h3>{e.recipe.title}</h3>
                        <div className="meta">
                          <span suppressHydrationWarning>{dayLabel(e.on, today)}</span>
                          {e.photoUrl && (
                            <>
                              <span className="dot" />
                              <span>Photo</span>
                            </>
                          )}
                        </div>
                        {e.note && <p className="log-note">{e.note}</p>}
                      </div>
                      {e.photoUrl && <img className="history-photo" src={e.photoUrl} alt="" loading="lazy" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {entries.length > SHOWN && (
            <button type="button" className="text-btn more-log" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function monthLabel(day: string, today: string): string {
  if (day.slice(0, 7) === today.slice(0, 7)) return "This month";
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}
