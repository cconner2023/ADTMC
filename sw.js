// sw.js - Keep it simple
const APP_VERSION = '3.0';
const CACHE_NAME = `adtmc-cache-${APP_VERSION}`;

// List of files to cache
const CORE_ASSETS = [
    '/ADTMC/',
    '/ADTMC/index.html',
    '/ADTMC/manifest.json',
    '/ADTMC/App.css'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', APP_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return cache.addAll(CORE_ASSETS);
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
                    if (cacheName.startsWith('adtmc-cache-') && cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // For navigation, try network first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('/ADTMC/index.html');
                })
        );
        return;
    }

    // For other assets, cache-first
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached if found
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response.ok) {
                            return response;
                        }

                        // Cache the response
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        return response;
                    });
            })
    );
});

// Handle skip waiting message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});