// App shell offline cache. Financial data (/api/*) is never cached here; the app keeps its own last-known state.
const CACHE = 'tally-cloud-v1';
const SHELL = ['/', '/app.css', '/app.js', '/boot.js', '/auth.js', '/cloud.js', '/core.js', '/views.js', '/icons.js', '/icon.svg', '/favicon.png',
  '/manifest.webmanifest', '/guide.html', '/guide.css', '/illustrations/variables.svg', '/illustrations/post-json.svg', '/newsreader-latin-600-normal.woff2', '/jetbrains-mono-latin-500-normal.woff2'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const key = u.pathname === '/index.html' ? '/' : u.pathname;
  // network first so updates land immediately; cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && SHELL.includes(key)) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then(r => r || Response.error())));
});
