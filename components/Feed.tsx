"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { KindBadge, Tile } from "@/components/bits";
import { Close, Search, Seal, Spark } from "@/components/icons";
import { initials, tileColor, timeAgo } from "@/lib/parse";
import type { Cook, Kind, Recipe } from "@/lib/types";

type Filter = "all" | Kind | "mine" | `cook:${string}`;

export function Feed({ recipes, me, cooks, initialCook }: { recipes: Recipe[]; me: Cook; cooks: Cook[]; initialCook?: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(
    initialCook ? (initialCook === me.id ? "mine" : `cook:${initialCook}`) : "all",
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipes.filter((r) => {
      if (filter === "mine" && r.author.id !== me.id) return false;
      if ((filter === "experiment" || filter === "classic") && r.kind !== filter) return false;
      if (filter.startsWith("cook:") && r.author.id !== filter.slice(5)) return false;
      if (!needle) return true;
      return [r.title, r.author.name, r.notes, ...r.ingredients].some((t) => t.toLowerCase().includes(needle));
    });
  }, [recipes, q, filter, me.id]);

  const cookFilter = filter.startsWith("cook:") ? cooks.find((c) => c.id === filter.slice(5)) : undefined;
  const chips: { id: Filter; label: string; icon?: React.ReactNode }[] = [
    { id: "all", label: "All" },
    { id: "classic", label: "Tried & true", icon: <Seal size={12} style={{ color: "var(--classic)" }} /> },
    { id: "experiment", label: "Experiments", icon: <Spark size={12} style={{ color: "var(--exp)" }} /> },
    { id: "mine", label: "Mine" },
    ...(cookFilter ? [{ id: filter, label: cookFilter.name }] : []),
  ];

  const featured = filter === "all" && !q && shown.length > 2 ? shown[0] : null;
  const rest = featured ? shown.slice(1) : shown;

  if (recipes.length === 0) {
    return (
      <div className="empty">
        <p className="display">The kitchen is empty</p>
        <p>Add the first thing you made. Silly names welcome.</p>
        <Link className="btn accent" href="/new">Add a recipe</Link>
      </div>
    );
  }

  return (
    <>
      <label className="search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Search recipes or ingredients"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          autoCorrect="off"
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")}>
            <Close size={18} />
          </button>
        )}
      </label>

      <div className="chips" role="toolbar" aria-label="Filter">
        {chips.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>

      {featured &&
        (featured.photoUrl ? (
          <Link href={`/r/${featured.id}`} className="feature">
            <div className="art">
              <img src={featured.photoUrl} alt="" />
            </div>
            <div className="body">
              <p className="eyebrow">Latest from {featured.author.id === me.id ? "you" : featured.author.name}</p>
              <h2>{featured.title}</h2>
              <div className="meta">
                <KindBadge kind={featured.kind} />
                <span className="dot" />
                <span suppressHydrationWarning>{timeAgo(featured.updatedAt)}</span>
              </div>
            </div>
          </Link>
        ) : (
          <Link href={`/r/${featured.id}`} className="feature cover" style={{ background: tileColor(featured.id) }}>
            <span className="glyph" aria-hidden="true">{initials(featured.title)}</span>
            <p className="eyebrow">Latest from {featured.author.id === me.id ? "you" : featured.author.name}</p>
            <div>
              <h2>{featured.title}</h2>
              <div className="meta">
                <KindBadge kind={featured.kind} />
                <span className="dot" />
                <span suppressHydrationWarning>{timeAgo(featured.updatedAt)}</span>
              </div>
            </div>
          </Link>
        ))}

      {shown.length === 0 ? (
        <div className="empty">
          <p>Nothing matches that.</p>
        </div>
      ) : (
        <ul className="list">
          {rest.map((r) => (
            <li key={r.id}>
              <Link href={`/r/${r.id}`} className="row">
                <Tile recipe={r} />
                <div className="text">
                  <h3>{r.title}</h3>
                  <div className="meta">
                    <KindBadge kind={r.kind} />
                    <span className="dot" />
                    <span>{r.author.id === me.id ? "You" : r.author.name}</span>
                    <span className="dot" />
                    <span suppressHydrationWarning>{timeAgo(r.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

