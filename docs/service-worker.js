// docs/service-worker.js
const CACHE_NAME = "nba-bets-pwa-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./gatekeeper_picks.csv",
  "./gatekeeper_picks.json",
  "./dvp.csv",
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  const isDataFile =
    pathname.endsWith("/gatekeeper_picks.csv") ||
    pathname.endsWith("/gatekeeper_picks.json") ||
    pathname.endsWith("/dvp.csv") ||
    pathname.endsWith("/site_metrics.json");

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

  // cache-first for shell
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

