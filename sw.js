// Simple Service Worker for ADTMC - FIXED VERSION
const CACHE_NAME = 'adtmc-v2.6';
const APP_VERSION = '2.6';

// Files to cache on install - ONLY UNIQUE URLs
const CORE_ASSETS = [];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', APP_VERSION);
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                // Use Promise.all to avoid duplicate requests
                const cachePromises = CORE_ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn(`[SW] Failed to cache ${url}:`, err)
                    )
                );
                return Promise.all(cachePromises);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and cross-origin requests
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // For navigation requests, use network-first strategy
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Update cache with fresh response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // If network fails, try cache
                    return caches.match('/ADTMC/index.html');
                })
        );
        return;
    }

    // For other requests, use cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached response if available
                if (cachedResponse) {
                    // Update cache in background
                    fetchAndUpdate(event.request);
                    return cachedResponse;
                }

                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not successful or if it's an API request
                        if (response.ok && !event.request.url.includes('/api/')) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return response;
                    });
            })
    );
});

// Background update check
function fetchAndUpdate(request) {
    fetch(request)
        .then((response) => {
            if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            // Compare responses
                            Promise.all([
                                cachedResponse.text(),
                                response.clone().text()
                            ]).then(([cachedText, networkText]) => {
                                if (cachedText !== networkText) {
                                    // Update cache
                                    cache.put(request, response.clone());

                                    // Notify clients
                                    self.clients.matchAll().then((clients) => {
                                        clients.forEach((client) => {
                                            client.postMessage({
                                                type: 'UPDATE_AVAILABLE',
                                                timestamp: Date.now()
                                            });
                                        });
                                    });
                                }
                            });
                        }
                    });
                });
            }
        })
        .catch(() => {
            // Ignore network errors in background update
        });
}

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});