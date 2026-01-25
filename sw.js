// public/sw.js (or in your ADTMC directory)
const APP_VERSION = '3.0';
const CACHE_NAME = `adtmc-cache-${APP_VERSION}`;

const CORE_ASSETS = [
    '/ADTMC/',
    '/ADTMC/index.html',
    '/ADTMC/App.css',
    '/ADTMC/manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('[SW] Installing version:', APP_VERSION);

    // Skip waiting to activate immediately
    event.waitUntil(self.skipWaiting());

    // Cache files with better error handling
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
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating version:', APP_VERSION);

    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName.startsWith('adtmc-cache-') && cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control immediately
            self.clients.claim()
        ])
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

                            // Check if content changed
                            checkForContentChange(event.request, clone);
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed - return cached or nothing
                        if (event.request.mode === 'navigate') {
                            return caches.match('/ADTMC/index.html');
                        }
                        return null;
                    });

                // Return cached if available, otherwise fetch
                return cachedResponse || fetchAndCache;
            })
    );
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

// Handle messages from the app
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting().then(() => self.clients.claim());
    }

    if (event.data?.type === 'CHECK_UPDATES') {
        // Check specific URLs for updates
        const urls = event.data.urls || CORE_ASSETS;
        urls.forEach(url => {
            fetch(url)
                .then(response => {
                    if (response.ok) {
                        return checkForContentChange(new Request(url), response);
                    }
                })
                .catch(error => console.warn('[SW] Update check failed:', url, error));
        });
    }
});