// ServiceHub Service Worker - minimal install-only worker
// Necessario perch├® il browser mostri il pulsante "Installa" come PWA.
// NON facciamo cache offline aggressiva per evitare di servire versioni stantie
// del index.html: l'app si aggiorna automaticamente a ogni reload.

const CACHE_NAME = 'servicehub-shell-realtime-sync-v2-v269';

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});
const SHELL_FILES = [
  './sh-icon-192.png?v=shpc4',
  './sh-icon-512.png?v=shpc4',
  './sh-touch.png?v=shpc4',
  './sh-favicon.png?v=shpc4',
  './manifest.json?v=shpc4',
  './watch-manifest.json?v=sw15',
  './op/manifest.json?v=op5',
  './op/sw-op.js?v=op5',
  './remote/manifest.json?v=rm5',
  './remote/sw-remote.js?v=rm5',
  './sh-remote-icon-192.png?v=rm5',
  './sh-remote-icon-512.png?v=rm5',
  './splash-remote-mobile.png?v=rm5',
  './splash-remote-pc.png?v=rm5'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strategia: network-first per HTML/JS (cos├¼ l'app si aggiorna sempre),
// cache-first per icone/manifest.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const pathBase = url.pathname.split('/').pop() || '';
  const watchFreshAssets = ['watch.html', 'watch-app.js', 'sw-watch.js'];
  const isWatchFresh = watchFreshAssets.indexOf(pathBase) >= 0;
  const shellBasenames = ['sh-icon-192.png', 'sh-icon-512.png', 'sh-touch.png', 'sh-favicon.png', 'manifest.json'];
  const isShellAsset = shellBasenames.some((b) => url.pathname.endsWith('/' + b) || url.pathname.endsWith(b));
  const isAppShell = req.mode === 'navigate'
    || req.destination === 'document'
    || url.pathname.endsWith('.html')
    || (!url.pathname.split('/').pop() || !url.pathname.split('/').pop().includes('.'));

  if (isWatchFresh) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  if (isShellAsset) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  if (url.pathname.includes('/remote/') || url.pathname.includes('/op/')) {
    return;
  }

  if (isAppShell) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
