"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type SVGProps } from "react";
import "@/app/styles/tabbar.css";
import { Basket, Person, Plus, Pot } from "@/components/icons";
import { useUnread } from "@/components/Notices";
import { onListChange, readList } from "@/lib/shopping";

export function TabBar() {
  const path = usePathname();
  const count = useListCount();
  const unread = useUnread();
  const current = (href: string) => (path === href ? "page" : undefined);
  return (
    <div className="tabbar">
      <nav aria-label="Main" className="tabs">
        <Link href="/" className="tab" aria-current={current("/")}>
          <Pot />
          Kitchen
          <Pending />
        </Link>
        <Link href="/discover" className="tab" aria-current={current("/discover")}>
          <Compass />
          Discover
          <Pending />
        </Link>
        <Link href="/new" className="tab-add" aria-label="New recipe">
          <Plus size={26} strokeWidth={2.2} />
        </Link>
        <Link
          href="/list"
          className="tab"
          aria-current={current("/list")}
          aria-label={count ? `Shopping list, ${count} ${count === 1 ? "recipe" : "recipes"}` : "Shopping list"}
        >
          <span className="tab-icon">
            <Basket />
            {count > 0 && <span className="tab-badge">{count > 9 ? "9+" : count}</span>}
          </span>
          List
          <Pending />
        </Link>
        <Link href="/me" className="tab" aria-current={current("/me")} aria-label={unread ? `You, ${unread} new notifications` : "You"}>
          <span className="tab-icon">
            <Person />
            {unread > 0 && <span className="tab-badge">{unread > 9 ? "9+" : unread}</span>}
          </span>
          You
          <Pending />
        </Link>
      </nav>
    </div>
  );
}

/**
 * Lights up the tapped tab straight away while its page is still on the way (for when the
 * page wasn't prefetched yet; prefetched tabs switch at once). See tabbar.css.
 */
function Pending() {
  const { pending } = useLinkStatus();
  return <span className="tab-pending" data-pending={pending || undefined} hidden />;
}

/** Same 24px, 1.8-stroke line style as components/icons.tsx. */
function Compass(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9z" />
    </svg>
  );
}

/**
 * Recipes on the shopping list. 0 on the server and while hydrating so the first render
 * matches; after that it reads straight from the device, so a tab bar mounted by a page
 * change shows the right badge at once instead of flickering from 0.
 */
function useListCount() {
  return useSyncExternalStore(onListChange, () => readList().recipes.length, () => 0);
}
