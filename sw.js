// Offline-first cache. Bump VERSION whenever a shipped file changes.
const VERSION = 'stag-v0.4.2';
const CORE = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/store.js', 'js/logic.js', 'js/csv.js', 'js/avatar.js', 'js/app.js', 'data/plan.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // cache: 'reload' skips the browser's HTTP cache, so a new version never mixes old and new files
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    try {
      const plan = await (await fetch('data/plan.json', { cache: 'reload' })).json();
      const imgs = [...new Set(Object.values(plan.variants || plan.exercises).flatMap(x => x.images || []))];
      await c.addAll(imgs.map(u => new Request(u, { cache: 'reload' })));
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

// Rest alerts: the optional relay sends an empty push; the notification text is fixed here (no data in the push).
self.addEventListener('push', e => {
  e.waitUntil(self.registration.showNotification('Rest is up', { body: 'Time for your next set.', tag: 'stag-rest', renotify: true }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => (l.length ? l[0].focus() : self.clients.openWindow('./'))));
});
