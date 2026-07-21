/* SF6 Ranked Lab service worker — offline app shell.
   Network-first for same-origin GET so hosted updates land immediately when
   online, with a cached fallback so the app opens with no connection. Bump
   CACHE on release to evict the old shell. */
const CACHE = 'sf6lab-v2';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './seed.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let the CFN watcher (localhost) and any CDN go straight to the network
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
