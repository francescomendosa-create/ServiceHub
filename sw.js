// ServiceHub Service Worker - minimal install-only worker
// Necessario perché il browser mostri il pulsante "Installa" come PWA.
// NON facciamo cache offline aggressiva per evitare di servire versioni stantie
// del index.html: l'app si aggiorna automaticamente a ogni reload.

const CACHE_NAME = 'servicehub-shell-v6';
const SHELL_FILES = [
  './icon-192.png?v=ic20260514',
  './icon-512.png?v=ic20260514',
  './apple-touch-icon.png?v=ic20260514',
  './favicon-32.png?v=ic20260514',
  './manifest.json?v=ic20260514'
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
  const shellBasenames = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'manifest.json'];
  const isShellAsset = shellBasenames.some((b) => url.pathname.endsWith('/' + b) || url.pathname.endsWith(b));

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
