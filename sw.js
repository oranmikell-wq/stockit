// Service Worker — Bull Therapy PWA
// Bump version on every deploy so users always get fresh files
const CACHE = 'bull-therapy-v14';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete all old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // External APIs — network only, no caching
  if (url.includes('finance.yahoo') || url.includes('twelvedata') ||
      url.includes('corsproxy') || url.includes('allorigins') ||
      url.includes('workers.dev')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // App shell — network first, fallback to cache for offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache fresh copy
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
