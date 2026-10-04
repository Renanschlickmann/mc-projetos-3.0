const VERSION = '19';
const CACHE = 'mc-projetos-v19-auto-update';
const FILES = [
  './index.html?v=19',
  './style.css?v=19',
  './script.js?v=19',
  './supabase-config.js?v=19',
  './manifest.json?v=19',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES)).catch(() => undefined)
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();

    // Força a página já aberta a entrar na versão nova sem pedir F12, reinstalação ou limpeza de cache.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(client => {
      try {
        return client.navigate(client.url);
      } catch (_) {
        return Promise.resolve();
      }
    }));
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const req = event.request;
  const isNavigation = req.mode === 'navigate';

  // Com internet: sempre prioriza a versão mais nova. Sem internet: usa o cache do PWA.
  event.respondWith((async () => {
    try {
      const response = await fetch(req, { cache: 'no-store' });
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (isNavigation) return caches.match('./index.html?v=19');
      throw _;
    }
  })());
});
