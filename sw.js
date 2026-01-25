// sw.js
const APP_VERSION = '3.0.0'; // Increment this on every update
const CACHE_NAME = `adtmc-cache-${APP_VERSION}`;

// List of files to cache with version query strings
const CORE_ASSETS = [
    '/ADTMC/index.html',
    '/ADTMC/manifest.json',
    '/ADTMC/App.tsx',
    '/ADTMC/App.css',
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', APP_VERSION);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return cache.addAll(CORE_ASSETS.map(url => `${url}?v=${APP_VERSION}`));
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating version:', APP_VERSION);

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheName.startsWith('adtmc-cache-') || cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Claim all clients immediately
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and cross-origin requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // For HTML pages, use network-first strategy
    if (event.request.mode === 'navigate' ||
        event.request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Clone response for cache
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseClone));
                    return response;
                })
                .catch(() => {
                    return caches.match('/ADTMC/index.html');
                })
        );
        return;
    }

    // For static assets, use cache-first with network fallback
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Always try to update from network in background
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        // Update cache with fresh response
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed - do nothing
                    });

                // Return cached response immediately, network response updates cache in background
                return cachedResponse || fetchPromise;
            })
    );
});

self.addEventListener('message', (event) => {
    console.log('[SW] Received message:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting requested');
        self.skipWaiting().then(() => {
            console.log('[SW] Successfully skipped waiting');
            // Now the new worker will activate
        });
    }
});

// Check for updates periodically
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-for-updates') {
        event.waitUntil(checkForUpdates());
    }
});

async function checkForUpdates() {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();

    for (const request of requests) {
        try {
            const networkResponse = await fetch(request);
            const cachedResponse = await cache.match(request);

            if (cachedResponse &&
                networkResponse.headers.get('etag') !== cachedResponse.headers.get('etag')) {
                // Update found - notify clients
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'UPDATE_AVAILABLE',
                        url: request.url
                    });
                });
                break;
            }
        } catch (error) {
            // Ignore failed fetches
        }
    }
}