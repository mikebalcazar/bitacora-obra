const SHELL = 'bo-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // siempre red
  if (url.pathname.startsWith('/files/')) {
    // fotos y planos: cache-first (inmutables)
    e.respondWith(caches.open(SHELL).then(async c => { const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }));
    return;
  }
  // app shell: network-first con fallback a cache
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then(h => h || caches.match('/'))));
});
