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

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/**
 * A home-screen app can stay open for days on the version it first loaded. When it comes
 * back to the front (and every 15 minutes while it's up), check for a newer deploy and
 * reload into it, unless something is mid-edit; then try again next time.
 */
export function UpdateCheck() {
  useEffect(() => {
    if (BUILD === "dev") return;
    let checking = false;
    async function check() {
      if (checking || document.visibilityState !== "visible" || !navigator.onLine) return;
      checking = true;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        const busy =
          location.pathname.endsWith("/edit") ||
          location.pathname === "/new" ||
          !!document.querySelector(".edit-sheet, .step-editing, .composer, input[type=file]:focus");
        if (build && build !== "dev" && build !== BUILD && !busy) location.reload();
      } catch {
      } finally {
        checking = false;
      }
    }
    const t = setTimeout(check, 3000);
    const id = setInterval(check, 15 * 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(t);
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
