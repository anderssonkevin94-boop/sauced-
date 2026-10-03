"use client";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { markNoticesRead, unreadNotices } from "@/lib/actions";

// The unread count, shared by the bell and the You tab: fetched once, refreshed when the
// app comes back to the front, and cleared when the notifications page is opened.

let unread = 0;
let fetchedAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function refresh(force = false) {
  if (!force && Date.now() - fetchedAt < 20_000) return;
  fetchedAt = Date.now();
  try {
    const n = await unreadNotices();
    if (n !== unread) {
      unread = n;
      emit();
    }
  } catch {}
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onShow = () => document.visibilityState === "visible" && refresh(true);
  if (listeners.size === 1) document.addEventListener("visibilitychange", onShow);
  refresh();
  return () => {
    listeners.delete(l);
    if (!listeners.size) document.removeEventListener("visibilitychange", onShow);
  };
}

export function useUnread(): number {
  return useSyncExternalStore(subscribe, () => unread, () => 0);
}

/** Opening the notifications page: they're read now. */
export function MarkRead({ any }: { any: boolean }) {
  useEffect(() => {
    if (!any) return;
    markNoticesRead().then(() => {
      unread = 0;
      emit();
    });
  }, [any]);
  return null;
}

const BellIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15l1.5-2zM10 20.5a2 2 0 004 0" />
  </svg>
);

/** The bell in the kitchen's header, with the unread count. */
export function Bell() {
  const n = useUnread();
  return (
    <Link href="/notifications" className="icon-btn bell" aria-label={n ? `Notifications, ${n} new` : "Notifications"}>
      <BellIcon />
      {n > 0 && <span className="tab-badge">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}
