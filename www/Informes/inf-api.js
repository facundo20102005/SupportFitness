// ── inf-api.js — Comunicación con el servidor y carga inicial ──

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

async function verificarAccesoInformes() {
    const pass      = (document.getElementById('input-pass')?.value || '').trim();
    const btnIng    = document.getElementById('btn-ingresar-inf');
    const loadingEl = document.getElementById('pass-loading');
    const errorEl   = document.getElementById('pass-error');
    const okEl      = document.getElementById('pass-ok');
    const inputEl   = document.getElementById('input-pass');

    if (!pass) { inputEl.style.borderColor = '#d93025'; return; }

    // Reset estados
    errorEl.style.display  = 'none';
    okEl.style.display     = 'none';
    loadingEl.style.display = 'flex';
    if (btnIng) { btnIng.disabled = true; btnIng.style.opacity = '0.6'; }

    try {
        const res = await llamarAPI({ accion: "verificarPassword", payload: { pass, destino: "jefatura" } });

        if (res && res.ok) {
            // ✅ Correcto
            loadingEl.style.display = 'none';
            okEl.style.display      = 'block';
            inputEl.style.borderColor = '#0f9d58';
            if (res.isJefe) localStorage.setItem('auth_jefatura', 'true');
            localStorage.setItem('auth_informes', 'true');

            setTimeout(() => {
                _ocultarModalPassInf();
                cargarAppInformes();
            }, 900);
        } else {
            // ❌ Incorrecto
            loadingEl.style.display = 'none';
            errorEl.style.display   = 'block';
            inputEl.style.borderColor = '#d93025';
            // Animación shake en el input
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

// ── Carga principal de la app (solo se ejecuta post-auth) ──
async function cargarAppInformes() {
    obtenerDolar();

    // Intentar cargar abonos base (no crítico si falla)
    try {
        listaAbonosBase = await llamarAPI({ accion: "obtenerAbonosBD" });
        let cuitDic = JSON.parse(localStorage.getItem('cuitGlobalDic')) || {};
        listaAbonosBase.forEach(abono => {
            let cuitLimpio = String(abono.cuit).replace(/\D/g, "");
            if (cuitLimpio && abono.gym) cuitDic[cuitLimpio] = abono.gym;
            if (!globalGymsOfertas.includes(abono.gym)) globalGymsOfertas.push(abono.gym);
            if (!globalGymsPresupuestos.includes(abono.gym)) globalGymsPresupuestos.push(abono.gym);
        });
        localStorage.setItem('cuitGlobalDic', JSON.stringify(cuitDic));
    } catch(e) {
        // Mostrar banner de error de conexión (no bloquear la app)
        // [debug removed] console.warn("Error cargando abonos base:",...)
        mostrarBannerConexion(e.message);
    }

    const hoy = new Date();
    const mm  = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = String(hoy.getFullYear());
    if (document.getElementById('sel-mes-abono'))      document.getElementById('sel-mes-abono').value = mm;
    if (document.getElementById('sel-anio-abono'))     document.getElementById('sel-anio-abono').value = yyyy;
    if (document.getElementById('selector-mes-abono')) document.getElementById('selector-mes-abono').value = `${yyyy}-${mm}`;

    await cargarDatosBase().catch(e => {
        // [debug removed] console.warn("Error en cargarDatosBase:", e...)
    });
}

// ── Banner de error de conexión visible al usuario ──
function mostrarBannerConexion(detalle) {
    const existente = document.getElementById('banner-conexion');
    if (existente) return; // No duplicar
    const banner = document.createElement('div');
    banner.id = 'banner-conexion';
    banner.style.cssText = `
        position: fixed; top: 64px; left: 0; right: 0; z-index: 9998;
        background: #d93025; color: white; text-align: center;
        padding: 10px 16px; font-size: 13px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; gap: 12px;
        box-shadow: 0 3px 12px rgba(217,48,37,0.4);`;
    banner.innerHTML = `
        <span>🔌 Sin conexión al servidor de Google — Verificá que el script esté bien desplegado</span>
        <button onclick="location.reload()" style="background:white; color:#d93025; border:none;
            padding:5px 12px; border-radius:8px; font-weight:900; cursor:pointer; font-size:12px;">
            🔄 Reintentar
        </button>
        <button onclick="document.getElementById('banner-conexion').remove()"
            style="background:rgba(255,255,255,0.2); color:white; border:none;
            padding:5px 10px; border-radius:8px; cursor:pointer; font-size:14px;">✕</button>`;
    document.body.appendChild(banner);
}

window.addEventListener('load', async () => {

    // NavBar (sin auth — se inicializa siempre para mostrar el menú)
    if (typeof NavBar !== 'undefined') {
        NavBar.init({ paginaActual: 'informes', mostrarBottomNav: false });
    } else {
        if (localStorage.getItem('darkMode') === 'yes') document.body.classList.add('dark-mode');
    }

    // Mostrar caché del dólar mientras esperamos
    const cachedDolar = (() => {
        try { return JSON.parse(localStorage.getItem('dolar_oficial_cache')); }
        catch(e) { return null; }
    })();
    if (cachedDolar && cachedDolar.valor > 500) {
        valorDolarOficial = cachedDolar.valor;
        actualizarDisplayDolar(true, 'caché');
    }

    // ── Verificar acceso ──────────────────────────────────────
    const tieneAcceso = localStorage.getItem('auth_informes')  === 'true' ||
                        localStorage.getItem('auth_jefatura')  === 'true';

    if (tieneAcceso) {
        _ocultarModalPassInf();
        cargarAppInformes();
    } else {
        _mostrarModalPassInf();
    }
});
// 🔥 FUNCIÓN QUE CONECTA LOS NUEVOS BOTONES CON EL SISTEMA VIEJO 🔥
function cambioMesPersonalizado() {
    let m = document.getElementById('sel-mes-abono').value;
    let y = document.getElementById('sel-anio-abono').value;
    let hiddenInput = document.getElementById('selector-mes-abono');
    if(hiddenInput) {
        hiddenInput.value = `${y}-${m}`;
        renderizarAbonos(); // Refresca la lista automáticamente
    }
}

async function llamarAPI(accionObj) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(accionObj),
            redirect: "follow"
        });
        if (!response.ok) {
            throw new Error(`El servidor respondió con error ${response.status}. Intentá de nuevo en unos segundos.`);
        }
        const result = await response.json();
        if (result.status === "success") return result.data;
        // Error del script de Google — mostrar mensaje amigable
        const msg = result.message || "Error desconocido del servidor.";
        throw new Error(msg.includes("Exception") ? "Error interno del servidor. Contactá al administrador." : msg);
    } catch (error) {
        if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("ERR_")) {
            throw new Error("Sin conexión. Verificá tu internet e intentá de nuevo.");
        }
        throw error;
    }
}

// 🔥 BURBUJA DE LISTA DE PRECIOS 🔥