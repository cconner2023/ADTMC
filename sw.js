const APP_VERSION = '3.0';
const CACHE_NAME = `adtmc-cache-${APP_VERSION}`;

// Use relative paths for GitHub Pages
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './App.css'
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', APP_VERSION);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets:', CORE_ASSETS);
                // Don't add version query strings to URLs in cache.addAll()
                return cache.addAll(CORE_ASSETS);
            })
            .then(() => {
                console.log('[SW] All core assets cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Cache addAll failed:', error);
                throw error;
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating version:', APP_VERSION);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old caches
                        if (cacheName.startsWith('adtmc-cache-') && cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                // Take control of all clients immediately
                return self.clients.claim();
            })
            .then(() => {
                console.log('[SW] Activation complete');
            })
    );
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http requests
    if (!event.request.url.startsWith('http')) {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Handle navigation requests (HTML pages)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html')
                .then((cachedResponse) => {
                    // Always try to fetch from network first for navigation
                    return fetch(event.request)
                        .then((networkResponse) => {
                            // Update cache in background
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseClone));
                            return networkResponse;
                        })
                        .catch(() => {
                            // If network fails, return cached index.html
                            return cachedResponse || new Response('Network error');
                        });
                })
        );
        return;
    }

    // For static assets, use cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached response if available
                if (cachedResponse) {
                    // Update cache in background
                    fetch(event.request)
                        .then((networkResponse) => {
                            if (networkResponse.ok) {
                                const responseClone = networkResponse.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                        })
                        .catch(() => {
                            // Ignore network errors for background updates
                        });
                    return cachedResponse;
                }

                // If not in cache, fetch from network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Don't cache non-successful responses
                        if (!networkResponse.ok) {
                            return networkResponse;
                        }

                        // Cache the successful response
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));

                        return networkResponse;
                    })
                    .catch((error) => {
                        console.error('[SW] Fetch failed:', error);
                        // Return error response for failed fetches
                        return new Response('Network error', {
                            status: 408,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});

// Handle messages from client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Received skip waiting message');
        self.skipWaiting();
    }
});