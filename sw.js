const CACHE_NAME = 'belote-coinche-pwa-v1';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com'
];

// Installation : mise en cache immédiate de la coquille applicative (App Shell)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL_ASSETS) {
        try {
          await cache.add(url);
        } catch (_err) {
          // Ignore les erreurs CDN optionnelles lors de l'installation
        }
      }
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

// Interception réseau :
// - Les appels API Supabase (/rest/v1, /auth/v1) passent toujours par le réseau
// - Les fichiers de l'application utilisent Cache-First avec mise à jour en arrière-plan (Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
  const reqUrl = event.request.url;

  if (
    event.request.method !== 'GET' ||
    reqUrl.includes('/rest/v1/') ||
    reqUrl.includes('/auth/v1/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || caches.match('./index.html'));

      return cachedResponse || networkFetch;
    })
  );
});
