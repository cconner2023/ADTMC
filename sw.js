// sw.js
const APP_VERSION = '3.0';
const CACHE_NAME = `adtmc-cache-v${APP_VERSION}`;

// Only cache essential files that definitely exist
const CORE_ASSETS = [
    './',  // This will cache index.html
    './index.html',
    './manifest.json',
    './App.css'
    // Add other assets you know exist
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', APP_VERSION);

    // Skip waiting immediately during install
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                // Use individual add() calls to handle failures gracefully
                const cachePromises = CORE_ASSETS.map(url => {
                    return cache.add(url).catch(err => {
                        console.warn(`[SW] Failed to cache ${url}:`, err);
                        return Promise.resolve(); // Continue even if one fails
                    });
                });
                return Promise.all(cachePromises);
            })
            .then(() => {
                console.log('[SW] Core assets cached successfully');
            })
            .catch(error => {
                console.error('[SW] Cache installation failed:', error);
                // Don't fail the installation if caching fails
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating version:', APP_VERSION);

    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName.startsWith('adtmc-cache-') && cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control immediately
            self.clients.claim()
        ]).then(() => {
            console.log('[SW] Activation complete');
        })
    );
});

// Simplified fetch handler
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and cross-origin requests
    if (event.request.method !== 'GET' ||
        !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // For HTML navigation, try network first, then cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match('./index.html');
                })
        );
        return;
    }

    // For other assets, try cache first
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Update cache in background
                    fetch(event.request)
                        .then(networkResponse => {
                            return caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, networkResponse));
                        })
                        .catch(() => { }); // Silently fail background update
                    return cachedResponse;
                }

                // Not in cache, try network
                return fetch(event.request)
                    .then(networkResponse => {
                        // Cache the new response
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));
                        return networkResponse;
                    })
                    .catch(error => {
                        console.log('[SW] Fetch failed:', event.request.url, error);
                        // You could return a fallback here
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
        console.log('[SW] Received SKIP_WAITING message');
        self.skipWaiting();

        // Notify all clients to reload
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'RELOAD_PAGE'
                });
            });
        });
    }
});