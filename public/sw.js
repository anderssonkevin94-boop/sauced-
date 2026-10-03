// Sauced service worker: fast repeat loads, and recipes you've opened work offline.
const VERSION = "v1";
const STATIC = `sauced-static-${VERSION}`;
const PAGES = "sauced-pages-v1"; // shared with components/Pwa.tsx
const PHOTOS = "sauced-photos-v1";
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("sauced-static-") && k !== STATIC).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // Only keep real pages, not redirects to /login.
    if (res.ok && !res.redirected) cache.put(new URL(request.url).pathname, res.clone());
    return res;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(url.pathname)) ||
      (await caches.match("/offline")) ||
      new Response("Offline", { status: 503 })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request, STATIC));
    } else if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request));
    }
    return;
  }

  // Recipe photos from Supabase Storage never change once uploaded.
  if (url.pathname.includes("/storage/v1/object/public/photos/")) {
    event.respondWith(cacheFirst(request, PHOTOS));
  }
});

// ── Push notifications (sent by lib/push.ts) ──────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sauced", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sauced";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url || "/notifications" },
        tag: data.url || undefined,
      }),
      // The number on the home screen icon; the app sets the exact count when it opens.
      self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then(() => ("navigate" in w ? w.navigate(url) : null));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
