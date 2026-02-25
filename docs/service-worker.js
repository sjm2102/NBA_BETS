// Simple PWA Service Worker for GitHub Pages
// - Caches the app shell (HTML/CSS/JS/icons)
// - Also caches the latest bets file when fetched
// - Falls back to cache when offline

const CACHE_NAME = "nba-bets-pwa-v2";

// App shell files to cache
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./bets_to_place.csv",
  "./bets_to_place.json"
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

// Network-first for data files, cache-first for app shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const isDataFile =
    url.pathname.endsWith("/bets_to_place.csv") ||
    url.pathname.endsWith("/bets_to_place.json");

  if (isDataFile) {
    // Network-first: try fresh data, fallback to cache
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(event.request);
          return cached || new Response("[]", { headers: { "Content-Type": "application/json" } });
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
        // If offline and not in cache, fallback to index
        const fallback = await caches.match("./index.html");
        return fallback || new Response("Offline", { status: 503 });
      }
    })()
  );
});