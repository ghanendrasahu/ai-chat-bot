/* Mira service worker: fresh shell, cached assets, offline fallback. */

const VERSION = "mira-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png",
  "/mira-mark.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL);
      // Hashed assets are cached lazily at runtime, not at install.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The API is always network-first; never cached. That includes the stream,
  // title and summary routes - a cached or buffered reply stream would break
  // streaming entirely.
  if (
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/title") ||
    url.pathname.startsWith("/summary") ||
    url.pathname.startsWith("/ping") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/health")
  ) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return new Response(JSON.stringify({ error: "You are offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })()
    );
    return;
  }

  // Navigations: network, then the cached shell, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match("/");
          return cached ?? (await caches.match("/offline.html"));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first, then fill the cache.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && (url.pathname.startsWith("/assets/") || response.type === "basic")) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
