// Offline-first cache. Bump VERSION whenever a shipped file changes.
const VERSION = 'stag-v0.2.0';
const CORE = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/store.js', 'js/logic.js', 'js/csv.js', 'js/avatar.js', 'js/app.js', 'data/plan.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    try {
      const plan = await (await fetch('data/plan.json')).json();
      const imgs = Object.values(plan.exercises).flatMap(x => x.images);
      await c.addAll(imgs);
    } catch (_) { /* images are cached on first use if this fails */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        (await caches.open(VERSION)).put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
