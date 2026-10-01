// ── inf-api.js — Comunicación con el servidor y carga inicial (v2) ──
//
//  POR QUÉ SE ROMPÍA ("llamarAPI is not defined"):
//  Este archivo declaraba cosas globales (const Sesion, function llamarAPI, etc.).
//  Si otro script de la página (nav.js, sw, etc.) ya tenía un `const`/`let` con el
//  mismo nombre, el navegador tira un SyntaxError de redeclaración y NO ejecuta el
//  archivo entero -> ninguna función queda definida -> "llamarAPI is not defined".
//
//  SOLUCIÓN: todo vive dentro de una IIFE (no puede chocar con nada) y solo se
//  exporta explícitamente a `window` lo que otros archivos necesitan.
//
//  MEJORAS DE VELOCIDAD:
//  · Precalienta el Apps Script apenas carga la página (antes del login).
//  · Abonos + Documentos + Historial se cargan EN PARALELO (antes: uno por uno).
//  · Caché local (stale-while-revalidate): pinta al instante con lo último
//    guardado y refresca en segundo plano.
//  · Reintentos solo cuando sirve (red/timeout), sin repetir errores lógicos.
//  · Lecturas idénticas simultáneas comparten una sola petición.

(function () {
    'use strict';

    // ── URL del backend (una sola fuente: inf-config.js) ────────────────
    function getApiUrl() {
        if (typeof window.API_URL !== 'undefined' && window.API_URL) return window.API_URL;
        if (typeof window.SF_API_URL !== 'undefined' && window.SF_API_URL) return window.SF_API_URL;
        try { if (typeof SF_API_URL !== 'undefined') return SF_API_URL; } catch (e) {}
        return null;
    }

    // ── Sesión ──────────────────────────────────────────────────────────
    const SES_KEY = 'sf_session_token';
    const SES = {
        get:   () => sessionStorage.getItem(SES_KEY),
        set:   (t) => sessionStorage.setItem(SES_KEY, t),
        clear: () => sessionStorage.removeItem(SES_KEY),
        tiene: () => !!sessionStorage.getItem(SES_KEY),
    };
    // Solo se publica como `Sesion` si nadie más lo definió (evita choques con nav.js)
    if (typeof window.Sesion === 'undefined') {
        try { void Sesion; /* si existe como const en otro script, no lo pisamos */ }
        catch (e) { window.Sesion = SES; }
    }
    window.SesionInf = SES;

    // ── Precalentamiento del Apps Script (evita el "cold start" de 3-8 s) ──
    function precalentarBackend() {
        const url = getApiUrl();
        if (!url) return;
        try { fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {}
    }
    precalentarBackend();

    // ── Caché local ─────────────────────────────────────────────────────
    const CACHE_PREFIX = 'sf_inf_cache_';
    const CACHE_MAX_EDAD = 24 * 3600 * 1000; // 24 h
    function cacheLeer(clave) {
        try {
            const o = JSON.parse(localStorage.getItem(CACHE_PREFIX + clave) || 'null');
            if (o && Array.isArray(o.d) && (Date.now() - (o.t || 0)) < CACHE_MAX_EDAD) return o.d;
        } catch (e) {}
        return null;
    }
    function cacheGuardar(clave, datos) {
        try { localStorage.setItem(CACHE_PREFIX + clave, JSON.stringify({ t: Date.now(), d: datos })); }
        catch (e) { /* cuota llena: no es crítico */ }
    }

    // ══════════════════════════════════════════════════════════════════
    //  llamarAPI — POST al Apps Script
    // ══════════════════════════════════════════════════════════════════
    const enVuelo = new Map();   // dedupe de lecturas idénticas simultáneas

    // Acciones de solo lectura: seguras de reintentar y de compartir
    const ACCIONES_LECTURA = new Set([
        'obtenerAbonosBD', 'obtenerDocumentosBD', 'obtenerRegistroHistorico',
        'obtenerReparacionesPendientes', 'obtenerHistorialAnual', 'obtenerCronogramaDesdeSheet',
        'obtenerDatosCalendarioWeb', 'obtenerTapizadosPendientes', 'obtenerPresupuestosArmados',
        'obtenerStock', 'obtenerFacturaPDFDrive', 'verificarVersion', 'obtenerRevisionNotasCredito',
    ]);

    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

    async function intentarUnaVez(url, cuerpo, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: cuerpo,
                signal: controller.signal,
            });
            if (!response.ok) {
                const err = new Error('Error HTTP ' + response.status);
                err.reintentable = response.status >= 500 || response.status === 429;
                throw err;
            }
            let result;
            try { result = await response.json(); }
            catch (e) {
                // Google devolvió HTML (login, script sin desplegar, etc.)
                const err = new Error('El servidor no respondió con datos válidos. Revisá que el Apps Script esté desplegado con acceso "Cualquier persona".');
                err.reintentable = false;
                throw err;
            }
            if (result && result.status === 'success') return result.data;
            const err = new Error((result && result.message) || 'Error interno del servidor Google.');
            err.reintentable = false;   // error lógico del backend: repetirlo no ayuda
            throw err;
        } catch (e) {
            if (e.name === 'AbortError') {
                const err = new Error('El servidor tardó demasiado en responder.');
                err.reintentable = true;
                err.timeout = true;
                throw err;
            }
            if (e.reintentable === undefined) e.reintentable = true;  // fallo de red (Failed to fetch)
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    async function llamarAPIReal(accionObj, timeoutMs) {
        const url = getApiUrl();
        if (!url) throw new Error('Falta API_URL (revisá que inf-config.js cargue primero).');

        const cuerpo = JSON.stringify(accionObj);
        const esLectura = ACCIONES_LECTURA.has(accionObj && accionObj.accion);
        const maxIntentos = esLectura ? 3 : 2;
        let ultimoError = null;

        for (let intento = 1; intento <= maxIntentos; intento++) {
            try {
                return await intentarUnaVez(url, cuerpo, timeoutMs);
            } catch (e) {
                ultimoError = e;
                if (!e.reintentable) break;
                // Escrituras: si hubo timeout NO reintentamos (pudo haberse ejecutado ya)
                if (!esLectura && e.timeout) break;
                if (intento < maxIntentos) await esperar(600 * intento);
            }
        }
        // Mantenemos el motivo real en vez de un mensaje genérico
        const msg = ultimoError && ultimoError.message ? ultimoError.message : 'desconocido';
        throw new Error('No se pudo conectar con el servidor: ' + msg);
    }

    function llamarAPI(accionObj, timeoutMs = 25000) {
        const esLectura = ACCIONES_LECTURA.has(accionObj && accionObj.accion);
        if (!esLectura) return llamarAPIReal(accionObj, timeoutMs);

        const clave = JSON.stringify(accionObj);
        if (enVuelo.has(clave)) return enVuelo.get(clave);
        const p = llamarAPIReal(accionObj, timeoutMs).finally(() => enVuelo.delete(clave));
        enVuelo.set(clave, p);
        return p;
    }

    // ══════════════════════════════════════════════════════════════════
    //  Modal de contraseña y login
    // ══════════════════════════════════════════════════════════════════
    function mostrarModalPass() {
        const modal = document.getElementById('modalPassword');
        if (!modal) return;
        modal.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('mostrar')));
        setTimeout(() => document.getElementById('input-pass')?.focus(), 300);
    }

    function ocultarModalPass() {
        const modal = document.getElementById('modalPassword');
        if (!modal) return;
        modal.classList.remove('mostrar');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    }

    async function verificarAccesoInformes() {
        const pass      = (document.getElementById('input-pass')?.value || '').trim();
        const btnIng    = document.getElementById('btn-ingresar-inf');
        const loadingEl = document.getElementById('pass-loading');
        const errorEl   = document.getElementById('pass-error');
        const okEl      = document.getElementById('pass-ok');
        const inputEl   = document.getElementById('input-pass');

        if (!pass) { inputEl.style.borderColor = '#d93025'; return; }

        errorEl.style.display = 'none';
        if (okEl) okEl.style.display = 'none';
        loadingEl.style.display = 'flex';
        if (btnIng) { btnIng.disabled = true; btnIng.style.opacity = '0.6'; }

        try {
            const res = await llamarAPI({ accion: 'verificarPassword', payload: { pass, destino: 'jefatura' } });

            if (res && res.ok) {
                loadingEl.style.display = 'none';
                if (okEl) okEl.style.display = 'block';
                inputEl.style.borderColor = '#0f9d58';

                SES.set(res.token ? res.token : 'legacy_auth');
                if (res.isJefe) sessionStorage.setItem('sf_is_jefe', 'true');

                // Arrancamos la carga YA; el modal se cierra mientras los datos viajan
                cargarAppInformes();
                setTimeout(ocultarModalPass, 500);
            } else {
                loadingEl.style.display = 'none';
                errorEl.innerText = '❌ Contraseña incorrecta';
                errorEl.style.display = 'block';
                inputEl.style.borderColor = '#d93025';
                inputEl.style.animation = 'none';
                requestAnimationFrame(() => { inputEl.style.animation = 'shake 0.4s ease'; });
                inputEl.value = '';
                setTimeout(() => { inputEl.style.borderColor = '#dadce0'; inputEl.focus(); }, 1000);
                if (btnIng) { btnIng.disabled = false; btnIng.style.opacity = '1'; }
            }
        } catch (e) {
            loadingEl.style.display = 'none';
            errorEl.innerText = '❌ Error de conexión: ' + (e.message || 'revisá tu internet.');
            errorEl.style.display = 'block';
            if (btnIng) { btnIng.disabled = false; btnIng.style.opacity = '1'; }
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  Carga inicial (paralela + caché)
    // ══════════════════════════════════════════════════════════════════
    function hojaActual() {
        return window.modoApp === 'ofertas' ? 'Ofertas de Mantenimiento' : 'Presupuestos de Reparacion';
    }

    function armarDiccionarioCuit() {
        try {
            let cuitDic = {};
            try { cuitDic = JSON.parse(localStorage.getItem('cuitGlobalDic')) || {}; } catch (e) {}
            (window.listaAbonosBase || []).forEach((abono) => {
                const cuitLimpio = String(abono.cuit).replace(/\D/g, '');
                if (cuitLimpio && abono.gym) cuitDic[cuitLimpio] = abono.gym;
                if (abono.gym && !window.globalGymsOfertas.includes(abono.gym)) window.globalGymsOfertas.push(abono.gym);
                if (abono.gym && !window.globalGymsPresupuestos.includes(abono.gym)) window.globalGymsPresupuestos.push(abono.gym);
            });
            localStorage.setItem('cuitGlobalDic', JSON.stringify(cuitDic));
        } catch (e) { console.warn('[inf-api] diccionario CUIT:', e); }
    }

    function refrescarVistas() {
        // Solo redibuja lo que ya está en pantalla; nunca rompe la carga si falla
        try { if (typeof window.renderizarAbonos === 'function' && document.getElementById('selector-mes-abono')) window.renderizarAbonos(); } catch (e) {}
        try {
            const cont = document.getElementById('contenedor-informes-creados');
            if (cont && typeof window.renderizarTarjetas === 'function' && cont.children.length && window.documentosGuardados?.length) {
                window.renderizarTarjetas();
            }
        } catch (e) {}
    }

    async function cargarAppInformes() {
        try { if (typeof window.obtenerDolar === 'function') window.obtenerDolar(); } catch (e) {}

        // Mes/año por defecto
        const hoy = new Date();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const yyyy = String(hoy.getFullYear());
        const selMes = document.getElementById('sel-mes-abono');
        const selAnio = document.getElementById('sel-anio-abono');
        const selMesA = document.getElementById('selector-mes-abono');
        if (selMes) selMes.value = mm;
        if (selAnio) selAnio.value = yyyy;
        if (selMesA) selMesA.value = `${yyyy}-${mm}`;

        // Documentos: se precarga SIEMPRE la hoja de Presupuestos (la que más se usa) y se guarda POR HOJA.
        // Antes se usaba la hoja del modo activo en ese instante (por defecto "Ofertas"); si el usuario cambiaba
        // de pestaña mientras la respuesta viajaba, los datos de una hoja pisaban a los de la otra
        // (por eso aparecían sólo los datos de Mayo en Presupuestos).
        const HOJA_PRINCIPAL = 'Presupuestos de Reparacion';
        const claveDocs = 'docs_' + HOJA_PRINCIPAL;
        window._docsPorHoja = window._docsPorHoja || {};

        // 1) Pintar al instante con lo último que había (si existe)
        const abonosCache = cacheLeer('abonos');
        const docsCache = cacheLeer(claveDocs);
        if (abonosCache && !(window.listaAbonosBase || []).length) window.listaAbonosBase = abonosCache;
        if (docsCache && !window._docsPorHoja[HOJA_PRINCIPAL]) window._docsPorHoja[HOJA_PRINCIPAL] = docsCache;
        if (abonosCache || docsCache) { armarDiccionarioCuit(); refrescarVistas(); }

        // 2) Pedir todo en paralelo (antes era secuencial)
        const [rAbonos, rDocs, rHist] = await Promise.allSettled([
            llamarAPI({ accion: 'obtenerAbonosBD' }),
            llamarAPI({ accion: 'obtenerDocumentosBD', payload: { hoja: HOJA_PRINCIPAL } }),
            (typeof window.cargarDatosBase === 'function') ? window.cargarDatosBase() : Promise.resolve(),
        ]);

        if (rAbonos.status === 'fulfilled') {
            window.listaAbonosBase = rAbonos.value || [];
            cacheGuardar('abonos', window.listaAbonosBase);
        }
        if (rDocs.status === 'fulfilled') {
            window._docsPorHoja[HOJA_PRINCIPAL] = rDocs.value || [];
            cacheGuardar(claveDocs, window._docsPorHoja[HOJA_PRINCIPAL]);
            // Si el usuario ya está viendo Presupuestos, se refresca esa lista en pantalla
            if (hojaActual() === HOJA_PRINCIPAL) {
                window.documentosGuardados = window._docsPorHoja[HOJA_PRINCIPAL];
                window._hojaDocsCargada = HOJA_PRINCIPAL;
            }
        }

        armarDiccionarioCuit();
        refrescarVistas();

        // Solo mostramos banner si fallaron los datos críticos Y no hay caché que mostrar
        const fallaron = [rAbonos, rDocs].filter((r) => r.status === 'rejected');
        if (fallaron.length === 2) {
            mostrarBannerConexion(fallaron[0].reason?.message);
        } else if (fallaron.length === 1) {
            console.warn('[inf-api] Carga parcial:', fallaron[0].reason?.message);
        }
    }

    function mostrarBannerConexion(detalle) {
        if (document.getElementById('banner-conexion')) return;
        const banner = document.createElement('div');
        banner.id = 'banner-conexion';
        banner.style.cssText = `
            position: fixed; top: 64px; left: 0; right: 0; z-index: 9998;
            background: #d93025; color: white; text-align: center;
            padding: 10px 16px; font-size: 13px; font-weight: 700;
            display: flex; align-items: center; justify-content: center; gap: 12px;
            box-shadow: 0 3px 12px rgba(217,48,37,0.4);`;
        const span = document.createElement('span');
        span.textContent = '🔌 Sin conexión al servidor' + (detalle ? ' — ' + detalle : '');
        const b1 = document.createElement('button');
        b1.textContent = '🔄 Reintentar';
        b1.style.cssText = 'background:white; color:#d93025; border:none; padding:5px 12px; border-radius:8px; font-weight:900; cursor:pointer; font-size:12px;';
        b1.onclick = () => { banner.remove(); cargarAppInformes(); };
        const b2 = document.createElement('button');
        b2.textContent = '✕';
        b2.style.cssText = 'background:rgba(255,255,255,0.2); color:white; border:none; padding:5px 10px; border-radius:8px; cursor:pointer; font-size:14px;';
        b2.onclick = () => banner.remove();
        banner.append(span, b1, b2);
        document.body.appendChild(banner);
    }

    function cambioMesPersonalizado() {
        const m = document.getElementById('sel-mes-abono')?.value;
        const y = document.getElementById('sel-anio-abono')?.value;
        const hiddenInput = document.getElementById('selector-mes-abono');
        if (hiddenInput && m && y) {
            hiddenInput.value = `${y}-${m}`;
            if (typeof window.renderizarAbonos === 'function') window.renderizarAbonos();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  Exportar a window (lo que otros archivos / el HTML usan)
    // ══════════════════════════════════════════════════════════════════
    window.llamarAPI = llamarAPI;
    window.verificarAccesoInformes = verificarAccesoInformes;
    window.cargarAppInformes = cargarAppInformes;
    window.mostrarBannerConexion = mostrarBannerConexion;
    window.cambioMesPersonalizado = cambioMesPersonalizado;
    window._mostrarModalPassInf = mostrarModalPass;
    window._ocultarModalPassInf = ocultarModalPass;

    // ══════════════════════════════════════════════════════════════════
    //  Arranque
    // ══════════════════════════════════════════════════════════════════
    function arrancar() {
        // El HTML ya inicializa NavBar; llamarlo dos veces duplicaba la barra superior
        if (typeof NavBar !== 'undefined') {
            if (!document.getElementById('top-nav-global')) NavBar.init({ paginaActual: 'informes', mostrarBottomNav: false });
        } else if (localStorage.getItem('darkMode') === 'yes') {
            document.body.classList.add('dark-mode');
        }

        try {
            const cachedDolar = JSON.parse(localStorage.getItem('dolar_oficial_cache'));
            if (cachedDolar && cachedDolar.valor > 500) {
                window.valorDolarOficial = cachedDolar.valor;
                if (typeof window.actualizarDisplayDolar === 'function') window.actualizarDisplayDolar(true, 'caché');
            }
        } catch (e) {}

        if (SES.tiene()) {
            ocultarModalPass();
            cargarAppInformes();
        } else {
            mostrarModalPass();
        }
    }

    // Los scripts son `defer` y se ejecutan EN ORDEN antes de DOMContentLoaded.
    // Esperamos a ese evento para que inf-abonos / inf-docs / inf-ui ya estén definidos
    // (a diferencia de `load`, no espera imágenes ni fuentes, así que arranca antes).
    if (document.readyState === 'complete') arrancar();
    else document.addEventListener('DOMContentLoaded', arrancar);
})();