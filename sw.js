// ServiceHub Service Worker - minimal install-only worker
// Necessario perché il browser mostri il pulsante "Installa" come PWA.
// NON facciamo cache offline aggressiva per evitare di servire versioni stantie
// del index.html: l'app si aggiorna automaticamente a ogni reload.

const CACHE_NAME = 'servicehub-shell-v29';

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});
const SHELL_FILES = [
  './sh-icon-192.png?v=shpc4',
  './sh-icon-512.png?v=shpc4',
  './sh-touch.png?v=shpc4',
  './sh-favicon.png?v=shpc4',
  './manifest.json?v=shpc4'
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

// Strategia: network-first per HTML/JS (così l'app si aggiorna sempre),
// cache-first per icone/manifest.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const shellBasenames = ['sh-icon-192.png', 'sh-icon-512.png', 'sh-touch.png', 'sh-favicon.png', 'manifest.json'];
  const isShellAsset = shellBasenames.some((b) => url.pathname.endsWith('/' + b) || url.pathname.endsWith(b));
  const isAppShell = req.mode === 'navigate' ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('sw.js') ||
    /\/$/.test(url.pathname);

  if (isAppShell) {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-store' })).catch(() => caches.match(req))
    );
    return;
  }

  if (isShellAsset) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
