const CACHE='mc-projetos-v18-forca-atualizacao';
const FILES=['./index.html?v=18','./style.css?v=18','./script.js?v=18','./supabase-config.js?v=18','./manifest.json?v=18','./logo.png','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const isNavigation = req.mode === 'navigate';
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req).then(r => r || (isNavigation ? caches.match('./index.html?v=18') : undefined)))
  );
});
