// ════════════════════════════════════════════════════════════════
//  Service Worker — Support Fitness PWA  (v2: network-first)
//
//  POR QUÉ SE VEÍAN ARCHIVOS VIEJOS AUNQUE CAMBIASES CACHE_VER:
//  1. cache.add(url) pasa por la caché HTTP del navegador. Con el header
//     "immutable, max-age=1 año" de vercel.json para los .js, el navegador
//     devolvía la copia vieja y el SW la volvía a guardar en la caché nueva.
//     (Cambiar el nombre de la caché no toca la caché HTTP.)
//  2. Los .js/.html/.css se servían Cache-First: si estaban guardados,
//     jamás se pedían a la red.
//
//  AHORA: HTML/JS/CSS = Network-First (siempre lo último; caché solo offline),
//  el precache ignora la caché HTTP, e imágenes = Cache-First.
// ════════════════════════════════════════════════════════════════

const CACHE_VER  = 'sf-20260929-0002';   // subilo igual en cada deploy (limpia cachés viejas)
const CACHE_NAME = `support-fitness-${CACHE_VER}`;

const PRECACHE = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/nav.js',
    '/Informes/Informes-index.html',
    '/Informes/Informes-style.css',
    '/Informes/inf-config.js',
    '/Informes/inf-api.js',
    '/Informes/inf-ui.js',
    '/Informes/inf-docs.js',
    '/Informes/inf-abonos.js',
    '/Informes/inf-reparaciones.js',
    '/Jefatura/index.html',
    '/Jefatura/jefatura.js',
    '/assets/Logoparapdf.png',
    '/assets/StarTrac.png',
    '/assets/Spinning.png',
    '/assets/Octane.png',
    '/assets/Paramount.png',
    '/assets/logo2.jpeg',
];

// ── INSTALL: precache SIN usar la caché HTTP (cache: 'reload') ────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                PRECACHE.map(url =>
                    fetch(new Request(url, { cache: 'reload' }))
                        .then(res => { if (res.ok) return cache.put(url, res); })
                        .catch(err => console.warn('[SW] No se pudo cachear:', url, err.message))
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ── ACTIVATE: borrar cachés viejas ────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('support-fitness-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
            // Si hay pestañas de Informes abiertas con archivos viejos, recargarlas UNA vez.
            // (No tocamos el formulario de los técnicos para no perder lo que estén cargando.)
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then(clientes => clientes.forEach(c => {
                if (c.url.includes('/Informes/')) { try { c.navigate(c.url); } catch (e) {} }
            }))
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

// ── Helpers ───────────────────────────────────────────────────────
function guardar(request, response) {
    if (!response || response.status !== 200 || response.type === 'opaque') return;
    const copia = response.clone();
    caches.open(CACHE_NAME).then(c => c.put(request, copia)).catch(() => {});
}

// Network-First: pide a la red revalidando (304 si no cambió); si no hay red, usa caché
function redPrimero(request) {
    return fetch(request, { cache: 'no-cache' })
        .then(res => { guardar(request, res); return res; })
        .catch(() =>
            caches.match(request, { ignoreSearch: true }).then(c =>
                c || (request.destination === 'document' ? caches.match('/') : Response.error())
            )
        );
}

// Cache-First: solo para imágenes/fuentes, que no cambian
function cachePrimero(request) {
    return caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => { guardar(request, res); return res; });
    });
}

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;                 // POST al Apps Script, etc.: ni tocarlo
    if (!req.url.startsWith('http')) return;
    const url = new URL(req.url);

    // 1. Apps Script y demás externos → directo a la red
    if (url.hostname.includes('script.google.com') ||
        url.hostname.includes('script.googleusercontent.com')) return;

    // 2. APIs del dólar → red primero, caché de respaldo
    if (/dolarapi|argentinadatos|bluelytics|criptoya|dolarito/.test(url.hostname)) {
        event.respondWith(fetch(req).catch(() => caches.match(req)));
        return;
    }

    // 3. Solo gestionamos nuestro propio origen
    if (url.origin !== self.location.origin) return;

    // 4. Código (HTML/JS/CSS) → SIEMPRE lo último
    const esCodigo = req.destination === 'document' || req.destination === 'script' ||
                     req.destination === 'style' || /\.(html|js|css)$/i.test(url.pathname);
    if (esCodigo) { event.respondWith(redPrimero(req)); return; }

    // 5. Imágenes, fuentes, etc. → instantáneo desde caché
    event.respondWith(cachePrimero(req));
});