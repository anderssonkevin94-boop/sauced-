import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/bits";
import { Back } from "@/components/icons";
import { MarkRead } from "@/components/Notices";
import { TabBar } from "@/components/TabBar";
import { listNotices } from "@/lib/data";
import { timeAgo } from "@/lib/parse";
import type { Notice } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications" };

/** What happened, around the recipe's name. */
const WHAT: Record<Notice["kind"], [string, string]> = {
  cooked_with: ["logged you as cooking ", " with them"],
  reply: ["replied on ", ""],
  new_recipe: ["added ", ""],
  cooked_yours: ["cooked your ", ""],
};

export default async function NotificationsPage() {
  const notices = await listNotices();
  const list = notices ?? [];

  return (
    <>
      <main className="page with-tabs">
        <div className="topbar">
          <Link href="/" className="icon-btn back" aria-label="Back to the kitchen">
            <Back />
          </Link>
        </div>
        <h1 className="display" style={{ fontSize: 30, marginTop: 4 }}>Notifications</h1>

        {list.length === 0 ? (
          <p className="muted" style={{ marginTop: 18 }}>
            Nothing yet. New recipes, replies to your cooks, people cooking your recipes, and cooks you&rsquo;re logged on all show up here.
          </p>
        ) : (
          <ul className="notices">
            {list.map((n) => (
              <li key={n.id} data-unread={!n.read || undefined}>
                <Link href={n.recipe ? `/r/${n.recipe.id}${n.kind === "new_recipe" ? "" : "#cooked"}` : `/u/${n.actor.id}`}>
                  <Avatar name={n.actor.name} id={n.actor.id} />
                  <div className="text">
                    <p>
                      <b>{n.actor.name}</b> {WHAT[n.kind][0]}
                      {n.recipe ? <b>{n.recipe.title}</b> : "a recipe"}
                      {WHAT[n.kind][1]}
                    </p>
                    {n.body && <p className="quote">&ldquo;{n.body}&rdquo;</p>}
                    <p className="muted when">{timeAgo(n.createdAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <MarkRead any={list.some((n) => !n.read)} />
      </main>
      <TabBar />
    </>
  );
}
