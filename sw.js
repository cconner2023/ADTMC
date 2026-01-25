// public/sw.js
const APP_VERSION = '3.0';
const CACHE_NAME = `adtmc-cache-${APP_VERSION}`;

const CORE_ASSETS = [
    '/ADTMC/',
    '/ADTMC/index.html',
    '/ADTMC/manifest.json'
];

// Flag to prevent multiple activations
let isUpdating = false;

self.addEventListener('install', (event) => {
    console.log('[SW] Installing version:', APP_VERSION);

    // Don't skip waiting automatically - let the user control it
    // This prevents the loop
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching core assets');
                return Promise.allSettled(
                    CORE_ASSETS.map(url =>
                        fetch(url)
                            .then(response => {
                                if (response.ok) {
                                    return cache.put(url, response);
                                }
                                throw new Error(`Failed to fetch ${url}: ${response.status}`);
                            })
                            .catch(error => {
                                console.warn('[SW] Failed to cache:', url, error.message);
                                return null;
                            })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Installation complete');
                // Only skip waiting if this is the first install
                if (!self.controller) {
                    return self.skipWaiting();
                }
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating version:', APP_VERSION);

    // Don't claim clients automatically - let them reload
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName.startsWith('adtmc-cache-') && cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests within our scope
    if (event.request.method !== 'GET' ||
        !event.request.url.includes('/ADTMC/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const fetchAndCache = fetch(event.request)
                    .then(networkResponse => {
                        // Only cache successful responses
                        if (networkResponse.ok) {
                            const clone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed - return cached or nothing
                        if (event.request.mode === 'navigate') {
                            return caches.match('/ADTMC/index.html');
                        }
                        return cachedResponse || new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });

                // Return cached if available, otherwise fetch
                return cachedResponse || fetchAndCache;
            })
    );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
    console.log('[SW] Received message:', event.data);

    if (event.data?.type === 'SKIP_WAITING') {
        if (!isUpdating) {
            isUpdating = true;
            console.log('[SW] Skipping waiting');
            self.skipWaiting().then(() => {
                console.log('[SW] Claiming clients');
                return self.clients.claim();
            }).then(() => {
                console.log('[SW] Update complete');
                // Notify all clients to reload
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'UPDATE_COMPLETE'
                        });
                    });
                });
            });
        }
    }

    if (event.data?.type === 'CHECK_UPDATES' && !isUpdating) {
        // Check specific URLs for updates
        const urls = event.data.urls || CORE_ASSETS;
        urls.forEach(url => {
            fetch(url)
                .then(response => {
                    if (response.ok) {
                        checkForContentChange(new Request(url), response);
                    }
                })
                .catch(error => console.warn('[SW] Update check failed:', url, error));
        });
    }
});

// Check if content has changed
async function checkForContentChange(request, networkResponse) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        if (!cachedResponse) return;

        const [cachedText, networkText] = await Promise.all([
            cachedResponse.text(),
            networkResponse.clone().text()
        ]);

        if (cachedText !== networkText) {
            console.log('[SW] Content changed:', request.url);

            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'CONTENT_UPDATED',
                    url: request.url
                });
            });
        }
    } catch (error) {
        console.warn('[SW] Error checking content:', error);
    }
}