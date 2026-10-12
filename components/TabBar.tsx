"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type SVGProps } from "react";
import "@/app/styles/tabbar.css";
import { Basket, Person, Plus, Pot } from "@/components/icons";
import { useUnread } from "@/components/Notices";
import { onListChange, readList } from "@/lib/shopping";
import { Edward } from "@/components/Edward";

export function TabBar() {
  const path = usePathname();
  const count = useListCount();
  const unread = useUnread();
  const [adding, setAdding] = useState(false);
  const current = (href: string) => (path === href ? "page" : undefined);
  return (
    <div className="tabbar">
      <nav aria-label="Main" className="tabs">
        <Link href="/" className="tab" aria-current={current("/")}>
          <Pot />
          Kitchen
          <Pending />
        </Link>
        <Link href="/feed" className="tab" aria-current={current("/feed")}>
          <Bubble />
          Feed
          <Pending />
        </Link>
        <button type="button" className="tab-add" aria-label="Add a recipe" aria-haspopup="dialog" onClick={() => setAdding(true)}>
          <Plus size={26} strokeWidth={2.2} />
        </button>
        <Link
          href="/list"
          className="tab"
          aria-current={current("/list")}
          aria-label={count ? `Shopping list, ${count} ${count === 1 ? "thing" : "things"}` : "Shopping list"}
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
      <AddSheet open={adding} onClose={() => setAdding(false)} />
      <Edward />
    </div>
  );
}

/** "+": write a recipe (or paste one), or go find one on the web. */
function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="add-sheet" aria-label="Add a recipe" onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="add-sheet-grip" aria-hidden="true" />
      <Link href="/new" className="add-option" onClick={onClose}>
        <Plus size={22} />
        <span>
          <b>New recipe</b>
          <small>Write it, paste it, or snap a photo</small>
        </span>
      </Link>
      <Link href="/discover" className="add-option" onClick={onClose}>
        <Compass />
        <span>
          <b>Explore</b>
          <small>Find a recipe anywhere, bring it home in metric</small>
        </span>
      </Link>
    </dialog>
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

/** A speech bubble, for the feed. */
function Bubble(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8.5a1.5 1.5 0 01-1.5 1.5h-8l-4.5 3.5V17H5a1.5 1.5 0 01-1.5-1.5V7A1.5 1.5 0 015 5.5z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
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
  return useSyncExternalStore(onListChange, () => readList().recipes.length + (readList().items?.length ?? 0), () => 0);
}
