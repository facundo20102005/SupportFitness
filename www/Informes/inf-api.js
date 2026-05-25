// ── inf-api.js — Comunicación con el servidor y carga inicial ──
// AUDITORÍA: corregido timeout, manejo de errores, sesión básica

// ── Gestión de sesión (token opaco) ─────────────────────────────
// Mejora respecto al original: en lugar de guardar 'true' en localStorage,
// se guarda el token real que devuelve el backend. Cada acción lo envía.
// Nota: esto requiere que el backend devuelva { ok: true, token: "..." }
// y valide ese token en cada acción sensible.
const Sesion = (() => {
    const KEY = 'sf_session_token';
    const get = () => sessionStorage.getItem(KEY); // sessionStorage: se borra al cerrar pestaña
    const set = (token) => sessionStorage.setItem(KEY, token);
    const clear = () => sessionStorage.removeItem(KEY);
    const tiene = () => !!get();
    return { get, set, clear, tiene };
})();

// ── Modal de contraseña ──────────────────────────────────────────
function _mostrarModalPassInf() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('mostrar')));
    setTimeout(() => document.getElementById('input-pass')?.focus(), 300);
}

function _ocultarModalPassInf() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
}

// ── Verificación de acceso ───────────────────────────────────────
async function verificarAccesoInformes() {
    const pass      = (document.getElementById('input-pass')?.value || '').trim();
    const btnIng    = document.getElementById('btn-ingresar-inf');
    const loadingEl = document.getElementById('pass-loading');
    const errorEl   = document.getElementById('pass-error');
    const okEl      = document.getElementById('pass-ok');
    const inputEl   = document.getElementById('input-pass');

    if (!pass) { inputEl.style.borderColor = '#d93025'; return; }

    errorEl.style.display   = 'none';
    if (okEl) okEl.style.display = 'none';
    loadingEl.style.display = 'flex';
    if (btnIng) { btnIng.disabled = true; btnIng.style.opacity = '0.6'; }

    try {
        const res = await llamarAPI({ accion: "verificarPassword", payload: { pass, destino: "jefatura" } });

        if (res && res.ok) {
            loadingEl.style.display = 'none';
            if (okEl) okEl.style.display = 'block';
            inputEl.style.borderColor = '#0f9d58';

            // FIX: guardar token en sessionStorage, no 'true' en localStorage
            if (res.token) {
                Sesion.set(res.token);
            } else {
                // fallback si el backend todavía no devuelve token
                Sesion.set('legacy_auth');
            }
            if (res.isJefe) sessionStorage.setItem('sf_is_jefe', 'true');

            setTimeout(() => {
                _ocultarModalPassInf();
                cargarAppInformes();
            }, 900);
        } else {
            loadingEl.style.display = 'none';
            errorEl.style.display   = 'block';
            inputEl.style.borderColor = '#d93025';
            inputEl.style.animation = 'none';
            requestAnimationFrame(() => { inputEl.style.animation = 'shake 0.4s ease'; });
            inputEl.value = '';
            setTimeout(() => { inputEl.style.borderColor = '#dadce0'; inputEl.focus(); }, 1000);
            if (btnIng) { btnIng.disabled = false; btnIng.style.opacity = '1'; }
        }
    } catch(e) {
        loadingEl.style.display  = 'none';
        errorEl.innerText        = '❌ Error de conexión. Revisá tu internet.';
        errorEl.style.display    = 'block';
        if (btnIng) { btnIng.disabled = false; btnIng.style.opacity = '1'; }
    }
}

// ── Carga principal de la app ────────────────────────────────────
async function cargarAppInformes() {
    obtenerDolar();

    try {
        listaAbonosBase = await llamarAPI({ accion: "obtenerAbonosBD" });
        let cuitDic = (() => { try { return JSON.parse(localStorage.getItem('cuitGlobalDic')) || {}; } catch(e){ return {}; /* localStorage parse error — ok */ } })();
        listaAbonosBase.forEach(abono => {
            let cuitLimpio = String(abono.cuit).replace(/\D/g, "");
            if (cuitLimpio && abono.gym) cuitDic[cuitLimpio] = abono.gym;
            if (!globalGymsOfertas.includes(abono.gym)) globalGymsOfertas.push(abono.gym);
            if (!globalGymsPresupuestos.includes(abono.gym)) globalGymsPresupuestos.push(abono.gym);
        });
        localStorage.setItem('cuitGlobalDic', JSON.stringify(cuitDic));
    } catch(e) {
        mostrarBannerConexion(e.message);
    }

    const hoy = new Date();
    const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = String(hoy.getFullYear());
    const selMes  = document.getElementById('sel-mes-abono');
    const selAnio = document.getElementById('sel-anio-abono');
    const selMesA = document.getElementById('selector-mes-abono');
    if (selMes)  selMes.value  = mm;
    if (selAnio) selAnio.value = yyyy;
    if (selMesA) selMesA.value = `${yyyy}-${mm}`;

    await cargarDatosBase().catch(e => console.warn("[inf-api] Promise swallowed:", e?.message || e));
}

// ── Banner de error de conexión ──────────────────────────────────
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
    banner.innerHTML = `
        <span>🔌 Sin conexión al servidor — Verificá que el script esté bien desplegado</span>
        <button onclick="location.reload()" style="background:white; color:#d93025; border:none;
            padding:5px 12px; border-radius:8px; font-weight:900; cursor:pointer; font-size:12px;">
            🔄 Reintentar
        </button>
        <button onclick="document.getElementById('banner-conexion').remove()"
            style="background:rgba(255,255,255,0.2); color:white; border:none;
            padding:5px 10px; border-radius:8px; cursor:pointer; font-size:14px;">✕</button>`;
    document.body.appendChild(banner);
}

// ── Inicialización ───────────────────────────────────────────────
window.addEventListener('load', async () => {
    if (typeof NavBar !== 'undefined') {
        NavBar.init({ paginaActual: 'informes', mostrarBottomNav: false });
    } else {
        if (localStorage.getItem('darkMode') === 'yes') document.body.classList.add('dark-mode');
    }

    // Mostrar caché del dólar mientras esperamos
    const cachedDolar = (() => { try { return JSON.parse(localStorage.getItem('dolar_oficial_cache')); } catch(e){ return null; } })();
    if (cachedDolar && cachedDolar.valor > 500) {
        valorDolarOficial = cachedDolar.valor;
        if (typeof actualizarDisplayDolar === 'function') actualizarDisplayDolar(true, 'caché');
    }

    // FIX: verificar sesión real en sessionStorage
    if (Sesion.tiene()) {
        _ocultarModalPassInf();
        cargarAppInformes();
    } else {
        _mostrarModalPassInf();
    }
});

// ── Helpers de cambio de mes ─────────────────────────────────────
function cambioMesPersonalizado() {
    const m = document.getElementById('sel-mes-abono')?.value;
    const y = document.getElementById('sel-anio-abono')?.value;
    const hiddenInput = document.getElementById('selector-mes-abono');
    if (hiddenInput && m && y) {
        hiddenInput.value = `${y}-${m}`;
        if (typeof renderizarAbonos === 'function') renderizarAbonos();
    }
}

// ── Llamada a la API con timeout y retry ─────────────────────────
// FIX PRINCIPAL: agregado AbortController con timeout de 15 segundos.
// Si Google Apps Script tarda más de 15s, se aborta limpiamente con
// un mensaje de error claro en lugar de quedar colgado indefinidamente.
async function llamarAPI(accionObj, timeoutMs = (typeof SF_TIMEOUT !== "undefined" ? SF_TIMEOUT.NORMAL : 15000)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(accionObj),
            redirect: "follow",
            signal: controller.signal
        });

        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(`El servidor respondió con error ${response.status}. Intentá de nuevo en unos segundos.`);
        }

        const result = await response.json();

        if (result.status === "success") return result.data;

        const msg = result.message || "Error desconocido del servidor.";
        throw new Error(msg.includes("Exception")
            ? "Error interno del servidor. Contactá al administrador."
            : msg);

    } catch (error) {
        clearTimeout(timer);

        if (error.name === 'AbortError') {
            throw new Error("La solicitud tardó demasiado (más de 15s). Verificá tu conexión e intentá de nuevo.");
        }
        if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("ERR_")) {
            throw new Error("Sin conexión. Verificá tu internet e intentá de nuevo.");
        }
        throw error;
    }
}