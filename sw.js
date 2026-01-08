
const CACHE_NAME = 'tarmi-fintrack-v3';

// Assets to strictly pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event: Cache core files immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting(); // Activate worker immediately
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all clients immediately
});

// Fetch Event: Implement Robust Offline Strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Navigation Requests (HTML) - Network First, Fallback to /index.html (SPA Support)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((resp) => {
            return resp || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 2. API / Supabase Requests - Network Only (Do not cache)
  if (url.hostname.includes('supabase.co')) {
    return; 
  }

  // 3. Static Assets (JS, CSS, Images, Fonts) - Cache First
  // Serves from cache if available. If not, fetches from network and caches it.
  // Crucial: Allows caching of opaque responses (CDNs like Tailwind) for offline support.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache valid responses. 
        // We accept status 200 (OK) AND type 'opaque' (status 0) which is common for CDN scripts.
        if (!response || (response.status !== 200 && response.type !== 'opaque')) {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      }).catch((err) => {
         // Network failed and not in cache -> Throw error (browser handles offline UI for assets)
         throw err;
      });
    })
  );
});
