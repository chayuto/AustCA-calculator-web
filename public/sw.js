/**
 * Minimal offline cache. Assets are content-hashed by Vite, so a plain
 * cache-first strategy is safe for them; the HTML entry point is revalidated in
 * the background so a redeploy is picked up on the next visit.
 */
const CACHE = "austca-cal-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["./", "./manifest.webmanifest"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: serve the cached shell immediately, refresh it in the
  // background. This is what makes a repeat open feel instant and work offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match("./", { ignoreSearch: true });
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put("./", response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});
