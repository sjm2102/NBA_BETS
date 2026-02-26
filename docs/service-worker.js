// docs/service-worker.js
const CACHE_NAME = "nba-bets-pwa-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./gatekeeper_picks.csv",
  "./gatekeeper_picks.json",
  "./dvp.csv"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Network-first for data files
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isDataFile =
    url.pathname.endsWith("/gatekeeper_picks.csv") ||
    url.pathname.endsWith("/gatekeeper_picks.json") ||
    url.pathname.endsWith("/dvp.csv");

  if (isDataFile) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(event.request);
          return cached || new Response("", { status: 200 });
        }
      })()
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      try {
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch {
        const fallback = await caches.match("./index.html");
        return fallback || new Response("Offline", { status: 503 });
      }
    })()
  );
});
