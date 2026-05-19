// ════════════════════════════════════════════════════════════════
//  Service Worker — Support Fitness PWA
//  FIXES APLICADOS:
//  1. Precache con Promise.allSettled: un asset roto ya no cancela todo
//  2. Listener de 'message' para forzar skipWaiting desde la app
//  3. CACHE_VER como constante que se debe actualizar al deployar
// ════════════════════════════════════════════════════════════════

// IMPORTANTE: Cambiar este string cada vez que se suban cambios a producción.
// Formato: 'sf-YYYYMMDD-HHMM' — evita que los usuarios vean versión vieja cacheada.
const CACHE_VER  = 'sf-20250518-1200';
const CACHE_NAME = `support-fitness-${CACHE_VER}`;

// Assets que se intentan precargar al instalar el SW.
// FIX: si uno falla, los demás siguen (ver INSTALL más abajo).
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

// ── INSTALL: FIX — usar allSettled en lugar de addAll ────────────
// El addAll() original era todo-o-nada: si un asset falla (404, red, etc.),
// el Service Worker NO se instala y la PWA queda sin offline.
// Con allSettled + add individual, los assets que existen se cachean
// y los que fallan solo loguean un warning.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                PRECACHE.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('[SW] No se pudo cachear:', url, err.message);
                    })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ── ACTIVATE: limpiar caches viejas ──────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k.startsWith('support-fitness-') && k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Eliminando cache vieja:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// ── MESSAGE: FIX — permite forzar actualización desde la app ─────
// La app puede enviar postMessage({ type: 'skipWaiting' }) cuando
// detecta que hay un SW esperando, para que tome control sin recargar.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'skipWaiting') {
        self.skipWaiting();
    }
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
        url.hostname.includes('bluelytics') ||
        url.hostname.includes('criptoya') ||
        url.hostname.includes('dolarito')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // 3. Assets estáticos → Cache-First (instantáneo en visitas repetidas)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const toCache = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
                return response;
            }).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('/');
                }
            });
        })
    );
});