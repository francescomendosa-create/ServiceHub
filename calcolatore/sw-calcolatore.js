/* Simulatore WWT — service worker leggero (rete first, stesso schema di op/sw-op.js) */
const CACHE = "servicehub-calcolatore-sw-v1";
self.addEventListener("install", (e) => { e.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request));
});
