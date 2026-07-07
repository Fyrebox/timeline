// Service worker: network-first so new deploys show up immediately when online,
// with the cached app shell as an offline fallback. (The previous cache-first
// strategy for assets is why CSS/JS updates could get stuck.)
const CACHE = 'timeline-v2';
const SHELL = [
  '/',
  '/css/timeline.css',
  '/vendor/htmx.min.js',
  '/icons/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Only handle same-origin requests; let everything else (e.g. APIs) pass through.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        // Cache a copy of successful responses for offline use.
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        // Offline: exact match, then ignore the ?v= query, then the app shell.
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(request)) ||
          (await cache.match(request, { ignoreSearch: true })) ||
          (request.mode === 'navigate' ? await cache.match('/') : undefined)
        );
      })
  );
});
