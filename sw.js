// ════════════════════════════════════════════════════════════════
//  Service Worker — Support Fitness PWA
//  Estrategia: Cache-First para assets estáticos,
//              Network-First para llamadas a la API de Google.
//
//  Versión: incrementar CACHE_VER al deployar cambios de assets.
// ════════════════════════════════════════════════════════════════

const CACHE_VER  = 'sf-v1';
const CACHE_NAME = `support-fitness-${CACHE_VER}`;

// Assets que se precargan al instalar el SW
const PRECACHE = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/nav.js',
    '/Informes/Informes-index.html',
    '/Informes/inf-config.js',
    '/Informes/inf-api.js',
    '/Informes/inf-ui.js',
    '/Informes/inf-docs.js',
    '/Informes/inf-abonos.js',
    '/Jefatura/index.html',
    '/Jefatura/jefatura.js',
    '/Tapizados/index.html',
    '/Tapizados/tapizados.js',
    '/assets/Logoparapdf.jpeg',
    '/assets/StarTrac.png',
    '/assets/Spinning.png',
    '/assets/Octane.png',
    '/assets/Paramount.png',
    '/assets/logo2.jpeg',
];

// ── INSTALL: precachear todos los assets ─────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())  // activar sin esperar
    );
});

// ── ACTIVATE: limpiar caches viejas ──────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k.startsWith('support-fitness-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH: estrategia por tipo de recurso ────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. Llamadas a Google Apps Script → Network-Only (siempre datos frescos)
    if (url.hostname.includes('script.google.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. APIs externas (dólar) → Network-First, fallback a cache
    if (url.hostname.includes('dolarapi') ||
        url.hostname.includes('argentinadatos') ||
        url.hostname.includes('bluelytics')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 3. Assets estáticos → Cache-First (instantáneo en visitas repetidas)
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                // No está en cache → buscar en red y guardar
                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200 || response.type === 'opaque') {
                            return response;
                        }
                        const toCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, toCache));
                        return response;
                    })
                    .catch(() => {
                        // Offline fallback para páginas HTML
                        if (event.request.destination === 'document') {
                            return caches.match('/');
                        }
                    });
            })
    );
});