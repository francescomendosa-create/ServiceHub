// ServiceHub Service Worker — shell offline + aggiornamento quando c'è rete.
// Network-first per HTML/JS (cache di riserva), cache-first per icone/CDN già visti.

const CACHE_NAME = 'servicehub-shell-realtime-sync-v2-v395';

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

const SHELL_FILES = [
  './',
  './index.html',
  './word-rapportini.js?v=2026.09.21-bordi',
  './letture-sasol-b64.js',
  './digital-remote.css',
  './libs/docx-preview.css',
  './libs/jszip.min.js',
  './libs/docx-preview.min.js',
  './libs/mammoth.browser.min.js',
  './libs/xlsx.full.min.js',
  './libs/pizzip.js',
  './libs/docxtemplater.js',
  './sh-icon-192.png?v=shpc4',
  './sh-icon-512.png?v=shpc4',
  './sh-touch.png?v=shpc4',
  './sh-favicon.png?v=shpc4',
  './manifest.json?v=shpc4',
  './watch-manifest.json?v=sw15',
  './op/manifest.json?v=op5',
  './remote/manifest.json?v=rm5',
  './sh-remote-icon-192.png?v=rm5',
  './sh-remote-icon-512.png?v=rm5',
  './splash-remote-mobile.png?v=rm5',
  './splash-remote-pc.png?v=rm5'
];

const CDN_HOSTS = [
  'www.gstatic.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

function putInCache(req, res) {
  if (!res || !res.ok) return res;
  const clone = res.clone();
  caches.open(CACHE_NAME).then((cache) => {
    try { cache.put(req, clone); } catch (_) {}
  }).catch(() => {});
  return res;
}

function networkFirst(req, fallbackUrl) {
  return fetch(req).then((res) => putInCache(req, res)).catch(() =>
    caches.match(req).then((cached) => {
      if (cached) return cached;
      if (fallbackUrl) return caches.match(fallbackUrl);
      return caches.match('./index.html');
    }).then((cached) => cached || Response.error())
  );
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) {
      fetch(req).then((res) => putInCache(req, res)).catch(() => {});
      return cached;
    }
    return fetch(req).then((res) => putInCache(req, res));
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL_FILES.map((url) =>
        cache.add(url).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const pathBase = url.pathname.split('/').pop() || '';
  const watchFreshAssets = ['watch.html', 'watch-app.js', 'sw-watch.js'];
  const isWatchFresh = watchFreshAssets.indexOf(pathBase) >= 0;
  const shellBasenames = [
    'sh-icon-192.png', 'sh-icon-512.png', 'sh-touch.png', 'sh-favicon.png', 'manifest.json'
  ];
  const isShellAsset = shellBasenames.some((b) =>
    url.pathname.endsWith('/' + b) || url.pathname.endsWith(b)
  );
  const isLocalAsset =
    url.origin === self.location.origin &&
    (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|json)$/i.test(url.pathname) ||
      pathBase.indexOf('word-rapportini') === 0 ||
      pathBase.indexOf('letture-sasol') === 0 ||
      url.pathname.indexOf('/libs/') >= 0);
  const isAppShell = req.mode === 'navigate'
    || req.destination === 'document'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/ServiceHub/')
    || url.pathname.endsWith('/ServiceHub')
    || (!pathBase.includes('.') && url.origin === self.location.origin);
  const isCdn = CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

  if (isWatchFresh) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  if (url.pathname.includes('/remote/') || url.pathname.includes('/op/')) {
    return;
  }

  if (isShellAsset) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (isCdn) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (isAppShell) {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  if (isLocalAsset) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
