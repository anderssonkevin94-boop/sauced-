"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const PAGES = "sauced-pages-v1";

export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/**
 * In-app navigation fetches data, not full pages, so the service worker
 * never sees them. Save a full copy of each page visited so it opens offline.
 */
export function KeepOffline() {
  const path = usePathname();
  useEffect(() => {
    if (!("caches" in window) || !navigator.onLine) return;
    const t = setTimeout(() => {
      caches
        .open(PAGES)
        .then((c) => c.add(new Request(path, { credentials: "same-origin" })))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}

export function clearOfflineCopies() {
  if ("caches" in window) caches.delete(PAGES).catch(() => {});
}
