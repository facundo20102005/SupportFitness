// --- Js de Informes   ---
const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec"; 

const PRECIOS_OFERTAS = {
    "Cintas": { precio: 50000, moneda: "ARS" },
    "Elípticos": { precio: 40000, moneda: "ARS" },
    "Bicicleta RB - UB": { precio: 35000, moneda: "ARS" },
    "Spinner": { precio: 20000, moneda: "ARS" },
    "Máquina de Musculación": { precio: 20000, moneda: "ARS" },
    "Multiestaciones": { precio: 40000, moneda: "ARS" },
    "Bancos Varios": { precio: 5000, moneda: "ARS" }
};

const PRECIOS_PRESUPUESTOS = {
    "Visita técnica para instalación + Mano de Obra": { precio: 160000, moneda: "ARS" }, 
    "Bateria Interna 6v 4Ah": { precio: 84600, moneda: "ARS" },
    "Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)": { precio: 625, moneda: "USD" },
    "Cable Acero Imp. Grueso c/ terminales": { precio: 22, moneda: "USD" },
    "Cable Acero Nac. Grueso c/ terminales": { precio: 18, moneda: "USD" },
    "Cable Acero Imp. Fino c/ terminales": { precio: 20, moneda: "USD" },
    "Cable Acero Nac. Fino c/ terminales": { precio: 15, moneda: "USD" },
    "Litro de Lubricante": { precio: 92000, moneda: "ARS" },
    "Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)": { precio: 500, moneda: "USD" },
    "Tabla de Cinta": { precio: 500, moneda: "USD" },
    "Reparación Rodillos Delantero": { precio: 235000, moneda: "ARS" },
    "Reparación Rodillos Trasero": { precio: 205000, moneda: "ARS" },
    "Correas de Motor": { precio: 149000, moneda: "ARS" },
    "Reparación Placas MCB": { precio: 600000, moneda: "ARS" },
    "Correa Motor Life Fitness": { precio: 178000, moneda: "ARS" },
    "Reparación Generador (Bici/Elíptico)": { precio: 380000, moneda: "ARS" },
    "Correas Bici": { precio: 179000, moneda: "ARS" },
    "Correas Elíptico": { precio: 194000, moneda: "ARS" }
};

let modoApp = 'ofertas'; 
const HOJA_OFERTAS = "Ofertas de Mantenimiento";
const HOJA_PRESUPUESTOS = "Presupuestos de Reparacion";

let documentosGuardados = [];
let idEditando = null;
let valorDolarOficial = 1000; 

let globalGymsOfertas = [];
let globalGymsPresupuestos = [];

let listaAbonosBase = [];
let sectorAbonoActual = 'completado';
let tabActivo = 'crear'; // Estado del tab activo (no chequear CSS)

// =============================================================================
// 💱 DÓLAR OFICIAL — 5 fuentes en paralelo, toma el valor MÁS RECIENTE
// =============================================================================

const FUENTES_DOLAR = [
    // 1. DolarAPI — más usada, actualización cada ~15 min
    {
        url: 'https://dolarapi.com/v1/dolares/oficial',
        parse: (d) => ({ venta: d.venta, fecha: d.fechaActualizacion || null })
    },
    // 2. Argentina Datos — agrega datos del BCRA
    {
        url: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial',
        parse: (d) => {
            // Devuelve array; el último elemento es el más reciente
            const ultimo = Array.isArray(d) ? d[d.length - 1] : d;
            return { venta: ultimo.venta, fecha: ultimo.fecha || null };
        }
    },
    // 3. Bluelytics — fuente independiente
    {
        url: 'https://api.bluelytics.com.ar/v2/latest',
        parse: (d) => ({ venta: d.oficial?.value_sell, fecha: d.last_update || null })
    },
    // 4. CriptoYa — agrega datos del mercado en tiempo real
    {
        url: 'https://criptoya.com/api/dolar',
        parse: (d) => ({ venta: d.oficial?.ask, fecha: null })
    },
    // 5. Dolarito — otra fuente independiente
    {
        url: 'https://dolarito.ar/api/quotes/ALL',
        parse: (d) => {
            const of = d?.oficial || d?.Oficial;
            return { venta: of?.sell || of?.venta, fecha: null };
        }
    }
];

// Intenta obtener de una fuente con timeout
async function fetchFuente(fuente) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    try {
        const resp = await fetch(fuente.url, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timeout);
        if (!resp.ok) return null;
        const data = await resp.json();
        const resultado = fuente.parse(data);
        const venta = parseFloat(resultado.venta);
        // Validar que sea un valor razonable (entre 500 y 99999)
        if (!venta || isNaN(venta) || venta < 500 || venta > 99999) return null;
        return { valor: venta, fecha: resultado.fecha, fuente: fuente.url };
    } catch(e) {
        clearTimeout(timeout);
        return null;
    }
}

async function obtenerDolar() {
    const domDolar = document.getElementById('valor-dolar');
    if (domDolar) {
        domDolar.innerText = `💱 Actualizando USD...`;
        domDolar.style.display = 'inline-block';
        domDolar.style.background = '#e8f0fe';
        domDolar.style.color = '#1a73e8';
        domDolar.style.border = '1px solid #aecbfa';
    }

    // Lanzar TODAS las fuentes en paralelo
    const promesas = FUENTES_DOLAR.map(f => fetchFuente(f));
    const resultados = await Promise.allSettled(promesas);

    // Recolectar solo los exitosos
    const exitosos = resultados
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

    if (exitosos.length > 0) {
        // Tomar el valor MÁS ALTO entre las fuentes (más actualizado / conservador)
        // El oficial del BCRA siempre sube, nunca baja en el día
        exitosos.sort((a, b) => b.valor - a.valor);
        const mejor = exitosos[0];
        valorDolarOficial = mejor.valor;

        // Log para depuración en consola
        console.log(`💱 Dólar oficial: $${valorDolarOficial} (fuente: ${mejor.fuente})`);
        console.table(exitosos.map(e => ({ fuente: e.fuente.split('/')[2], valor: e.valor })));

        // Guardar en localStorage con timestamp
        localStorage.setItem('dolar_oficial_cache', JSON.stringify({
            valor: valorDolarOficial,
            ts: Date.now(),
            fuente: mejor.fuente
        }));

        actualizarDisplayDolar(true, exitosos.length);
    } else {
        // Todas fallaron → usar caché local si tiene menos de 24h
        const cached = (() => {
            try { return JSON.parse(localStorage.getItem('dolar_oficial_cache')); }
            catch(e) { return null; }
        })();

        if (cached && cached.valor > 500 && (Date.now() - cached.ts) < 86400000) {
            valorDolarOficial = cached.valor;
        }
        actualizarDisplayDolar(false, 0);
    }

    // Recalcular ítems y burbuja con el valor nuevo
    recalcularTodosLosItems();
}

function actualizarDisplayDolar(exito, cantFuentes) {
    const domDolar = document.getElementById('valor-dolar');
    const labelBurbuja = document.getElementById('burbuja-dolar-label');
    const textoValor = `$${valorDolarOficial.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    const ahora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    if (domDolar) {
        if (exito) {
            domDolar.innerText = `💱 USD Oficial: ${textoValor}`;
            domDolar.style.background = '#e6f4ea';
            domDolar.style.color = '#0f9d58';
            domDolar.style.border = '1px solid #ceead6';
            domDolar.title = `Actualizado a las ${ahora} — ${cantFuentes} fuente${cantFuentes > 1 ? 's' : ''} consultada${cantFuentes > 1 ? 's' : ''}. Tocá para refrescar.`;
            domDolar.style.cursor = 'pointer';
            domDolar.onclick = () => obtenerDolar();
        } else {
            domDolar.innerText = `⚠️ USD (sin conexión): ${textoValor}`;
            domDolar.style.background = '#fff3e0';
            domDolar.style.color = '#e65100';
            domDolar.style.border = '1px solid #ffcc80';
            domDolar.title = 'No se pudo conectar. Valor estimado del caché. Tocá para reintentar.';
            domDolar.style.cursor = 'pointer';
            domDolar.onclick = () => obtenerDolar();
        }
    }

    if (labelBurbuja) {
        labelBurbuja.innerText = `💱 USD Oficial: ${textoValor} (${ahora})`;
    }
}

// Recalcula todos los ítems USD ya cargados en pantalla
function recalcularTodosLosItems() {
    document.querySelectorAll('.maquina-item').forEach(item => {
        const select = item.querySelector('.maq-tipo');
        if (select && select.value) {
            actualizarPrecioItem(select, false);
        }
    });
    // Si la burbuja de precios está abierta, refrescarla
    const burbuja = document.getElementById('burbuja-precios');
    if (burbuja && burbuja.style.display !== 'none') {
        renderizarBurbujaPrecios();
    }
}

// Auto-refresco cada 5 minutos mientras la página está visible
setInterval(() => {
    if (document.visibilityState === 'visible') obtenerDolar();
}, 5 * 60 * 1000);

// Refrescar al volver a la pestaña si pasaron más de 5 minutos
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const cached = (() => {
            try { return JSON.parse(localStorage.getItem('dolar_oficial_cache')); }
            catch(e) { return null; }
        })();
        if (!cached || (Date.now() - cached.ts) > 300000) obtenerDolar();
    }
});

// =============================================================================
// 🔥 1. INICIALIZACIÓN AL CARGAR LA APP 🔥
// =============================================================================
// ── Auth helpers Informes ─────────────────────────────────
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
    } catch(e) { console.log("Error cargando abonos base", e); }

    const hoy = new Date();
    const mm  = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = String(hoy.getFullYear());
    if (document.getElementById('sel-mes-abono'))     document.getElementById('sel-mes-abono').value = mm;
    if (document.getElementById('sel-anio-abono'))    document.getElementById('sel-anio-abono').value = yyyy;
    if (document.getElementById('selector-mes-abono')) document.getElementById('selector-mes-abono').value = `${yyyy}-${mm}`;

    await cargarDatosBase();
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
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(accionObj), redirect: "follow"
        });
        const result = await response.json();
        if (result.status === "success") return result.data;
        else throw new Error(result.message);
    } catch (error) { throw error; }
}

// 🔥 BURBUJA DE LISTA DE PRECIOS 🔥
function toggleBurbujaPrecios() {
    const burbuja = document.getElementById('burbuja-precios');
    const btn = document.getElementById('btn-ver-precios');
    if (!burbuja) return;

    if (burbuja.style.display === 'none') {
        // Construir el contenido
        renderizarBurbujaPrecios();
        burbuja.style.display = 'block';
        btn.innerText = '✖ Cerrar Lista';
        btn.style.background = '#fce8e6';
        btn.style.color = '#d93025';
    } else {
        burbuja.style.display = 'none';
        btn.innerText = '📋 Ver Lista de Precios';
        btn.style.background = '#e8f0fe';
        btn.style.color = '#1a73e8';
    }
}

function renderizarBurbujaPrecios() {
    const contenedor = document.getElementById('burbuja-precios-contenido');
    const labelDolar = document.getElementById('burbuja-dolar-label');
    const tituloBurbuja = document.getElementById('burbuja-titulo');
    if (!contenedor) return;

    const tasaDolar = valorDolarOficial;
    if (labelDolar) {
        labelDolar.innerText = modoApp === 'presupuestos'
            ? `💱 USD Oficial: $${tasaDolar.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
            : '';
    }
    if (tituloBurbuja) {
        tituloBurbuja.innerText = modoApp === 'ofertas' ? '🛠️ Precios de Mantenimiento' : '📋 Lista de Precios';
    }

    const precios = modoApp === 'presupuestos' ? PRECIOS_PRESUPUESTOS : PRECIOS_OFERTAS;

    let html = '';
    Object.entries(precios).forEach(([nombre, info]) => {
        const esUSD = info.moneda === 'USD';
        const precioARS = esUSD ? Math.round(info.precio * tasaDolar) : info.precio;
        const precioConIVA = Math.round(precioARS * 1.21);

        const badgeUSD = esUSD
            ? `<span class="precio-badge-usd">U$D ${info.precio}</span>`
            : `<span style="font-size:11px; color:var(--inf-muted);">ARS</span>`;

        html += `
        <div class="precio-row">
            <span class="precio-nombre">${nombre}</span>
            ${badgeUSD}
            <span class="precio-valor">$${precioARS.toLocaleString('es-AR')}</span>
            ${modoApp === 'presupuestos' ? `<span class="precio-iva">+IVA: $${precioConIVA.toLocaleString('es-AR')}</span>` : ''}
        </div>`;
    });

    if (modoApp === 'presupuestos') {
        html += `<div style="padding:10px 16px; font-size:11px; color:var(--inf-muted); text-align:center; font-style:italic; border-top:1px solid var(--inf-border);">
            Los precios en USD se calculan al tipo de cambio oficial del día.
        </div>`;
    }

    contenedor.innerHTML = html;
}

let cacheHistorial = [];
let fechaSeleccionadaOriginal = "";

async function cargarDatosBase() {
    try {
        cacheHistorial = await llamarAPI({ accion: "obtenerRegistroHistorico" });
        let setOfertas = new Set();
        let setPresup = new Set();
        
        cacheHistorial.forEach(visita => {
            let gymUpper = visita.gym.toUpperCase();
            setOfertas.add(gymUpper);
            let motivo = String(visita.motivos || visita.motivo || "").toLowerCase();
            if (motivo.includes("reparación") || motivo.includes("revision") || motivo.includes("rep")) {
                setPresup.add(gymUpper);
            }
        });

        globalGymsOfertas = Array.from(setOfertas);
        globalGymsPresupuestos = Array.from(setPresup);
    } catch (e) { console.error("Modo offline"); }
}

// 🔥 NUEVAS FUNCIONES PARA BURBUJAS Y DESGLOSE 🔥
function mostrarBurbujasFecha(gymNombre) {
    const contenedor = document.getElementById('contenedor-burbujas-fecha');
    const detalleDiv = document.getElementById('detalle-motivo-burbuja');
    
    if (contenedor) contenedor.innerHTML = "";
    if (detalleDiv) detalleDiv.style.display = "none";
    
    fechaSeleccionadaOriginal = "";

    if (modoApp !== 'presupuestos' || !gymNombre) return;

    const visitas = cacheHistorial.filter(v => v.gym.toUpperCase() === gymNombre.toUpperCase());

    visitas.forEach(v => {
        const span = document.createElement('span');
        span.style.cssText = "background:#e8f0fe; color:#1a73e8; padding:6px 12px; border-radius:20px; cursor:pointer; font-size:12px; font-weight:bold; border:1px solid #1a73e8; transition: 0.2s;";
        span.innerText = v.fechaStr;
        
        // Al hacer clic, le pasamos la visita y el propio elemento burbuja (this)
        span.onclick = function() { seleccionarVisitaParaPresupuesto(v, this); };
        
        contenedor.appendChild(span);
    });
}

function seleccionarVisitaParaPresupuesto(visita, spanElement) {
    fechaSeleccionadaOriginal = visita.fechaStr;

    // 1. Despintar todas las burbujas y pintar solo la seleccionada
    const burbujas = document.getElementById('contenedor-burbujas-fecha').children;
    for(let b of burbujas) {
        b.style.background = '#e8f0fe';
        b.style.color = '#1a73e8';
    }
    if(spanElement) {
        spanElement.style.background = '#1a73e8';
        spanElement.style.color = 'white';
    }

    // 2. Mostrar el detalle incrustado en la página (Chau alert!)
    const detalleDiv = document.getElementById('detalle-motivo-burbuja');
    if (detalleDiv) {
        // Cortamos el motivo por comas o signos de suma
        const lineas = visita.motivo.split(/[,+]+/).map(t => t.trim()).filter(t => t !== "");
        
        detalleDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                <b style="color:#1a73e8; font-size:14px;">📅 Detalle del ${visita.fechaStr}</b>
                <span style="cursor:pointer; color:#d93025; font-weight:bold; font-size:16px;" onclick="document.getElementById('detalle-motivo-burbuja').style.display='none'">✖</span>
            </div>
            <b style="color:#5f6368; font-size:12px;">🔧 Motivos registrados por el técnico:</b><br>
            <div style="margin-top:5px; padding-left:5px; color:#333; line-height:1.6;">• ` + lineas.join('<br>• ') + `</div>
        `;
        detalleDiv.style.display = "block";
    }
        // ... dentro de seleccionarVisitaParaPresupuesto ...
    detalleDiv.style.cssText = `
        display: block;
        margin-top: 15px;
        background: #ffffff;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #1a73e8;
        border-left: 6px solid #1a73e8;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-size: 14px;
    `;
}

// Función para el auto-formateo de la fecha (DD/MM/AAAA)
function formatearFechaManual(e) {
    let v = e.target.value.replace(/\D/g, ''); // Quitar lo que no sea número
    if (v.length > 8) v = v.slice(0,8);
    if (v.length >= 5) {
        e.target.value = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
    } else if (v.length >= 3) {
        e.target.value = `${v.slice(0,2)}/${v.slice(2)}`;
    } else {
        e.target.value = v;
    }
}

function setModoApp(modo) {
    modoApp = modo;
    
    const msjInicial = document.getElementById('mensaje-inicial');
    if(msjInicial) msjInicial.style.display = 'none';
    const areaTrabajo = document.getElementById('area-trabajo');
    if(areaTrabajo) areaTrabajo.style.display = 'block';

    // Actualizar tabs con nueva clase
    ['ofertas','presupuestos','abonos'].forEach(m => {
        const btn = document.getElementById('btn-modo-' + m);
        if (!btn) return;
        btn.classList.toggle('activo', m === modo);
    });

    // Abonos: mostrar/ocultar sección
    const secAbonos = document.getElementById('seccion-abonos');
    if (secAbonos) secAbonos.style.display = modo === 'abonos' ? 'block' : 'none';
    if (areaTrabajo) areaTrabajo.style.display = modo === 'abonos' ? 'none' : 'block';
    if (msjInicial)  msjInicial.style.display  = modo === 'abonos' ? 'none' : 'none';

    if (modo === 'abonos') {
        const hoy = new Date();
        const mm  = String(hoy.getMonth() + 1).padStart(2,'0');
        const yyyy = String(hoy.getFullYear());
        const sel = document.getElementById('selector-mes-abono');
        if (sel && !sel.value) sel.value = `${yyyy}-${mm}`;
        cargarAbonos();
        return;
    }

    // Dólar: solo en presupuestos (los precios de ofertas son en ARS fijos)
    const domDolar = document.getElementById('valor-dolar');
    if (domDolar) domDolar.style.display = modo === 'presupuestos' ? 'inline-block' : 'none';

    // Botón lista precios: SIEMPRE visible (tanto en ofertas como presupuestos)
    const btnPrecios = document.getElementById('btn-ver-precios');
    if (btnPrecios) {
        btnPrecios.style.display = 'inline-block';
        const burbuja = document.getElementById('burbuja-precios');
        if (burbuja) burbuja.style.display = 'none';
        btnPrecios.innerText = modo === 'ofertas' ? '📋 Precios Mantenimiento' : '📋 Lista de Precios';
        btnPrecios.style.background = modo === 'ofertas' ? '#e6f4ea' : '#e8f0fe';
        btnPrecios.style.color      = modo === 'ofertas' ? '#0f9d58' : '#1a73e8';
    }

    // ARCA solo en presupuestos
    const arcaC = document.getElementById('arca-container');
    if (arcaC) arcaC.style.display = modo === 'presupuestos' ? 'block' : 'none';

    // Título y descripción de la sección guardados
    const tit = document.getElementById('titulo-guardados');
    const desc = document.getElementById('desc-guardados');
    const titForm = document.getElementById('titulo-form');
    if (modo === 'ofertas') {
        if (tit) tit.innerText = '📁 Ofertas Guardadas';
        if (desc) desc.innerText = 'Lista de ofertas de mantenimiento.';
        if (titForm) titForm.innerText = '🛠️ Nueva Oferta';
    } else {
        if (tit) tit.innerText = '📁 Presupuestos Guardados';
        if (desc) desc.innerText = 'Facturas y presupuestos en la nube.';
        if (titForm) titForm.innerText = '💰 Nuevo Presupuesto';
    }

    // Mostrar/ocultar campos según modo
    const contFecha = document.getElementById('container-fecha');
    const contFrec  = document.getElementById('container-frecuencia');
    if (contFecha) contFecha.style.display = modo === 'presupuestos' ? 'block' : 'none';
    if (contFrec)  contFrec.style.display  = modo === 'presupuestos' ? 'none'  : 'block';
    const labelGym = document.getElementById('label-gym');
    if (labelGym) labelGym.innerText = modo === 'presupuestos' ? 'Gimnasio / Cliente *' : 'Gimnasio *';

    switchTab('crear');
    limpiarFormulario();
    agregarItem();
}

function switchTab(tab) {
    tabActivo = tab;
    const crear   = document.getElementById('seccion-crear');
    const creados = document.getElementById('seccion-creados');
    const arcaCont = document.getElementById('arca-container');
    const tabC = document.getElementById('tab-crear');
    const tabG = document.getElementById('tab-creados');

    if (tab === 'crear') {
        if (crear)   crear.style.display   = 'block';
        if (creados) creados.style.display  = 'none';
        if (tabC) { tabC.classList.add('activo'); }
        if (tabG) { tabG.classList.remove('activo'); }
        if (arcaCont) arcaCont.style.display = 'none';
    } else {
        if (crear)   crear.style.display   = 'none';
        if (creados) creados.style.display  = 'block';
        if (tabC) { tabC.classList.remove('activo'); }
        if (tabG) { tabG.classList.add('activo'); }
        if (arcaCont) arcaCont.style.display = modoApp === 'presupuestos' ? 'block' : 'none';
        obtenerYRenderizarCreados();
    }
}


// Recibe metros y terminales para el armado del HTML
function agregarItem(tipoBase = "", desc = "", cant = 1, precioForzado = null, metros = 1, terminales = 2) {
    const contenedor = document.getElementById('lista-maquinas-dom');
    const idUnico = Date.now() + Math.random(); 
    const dictPrecios = modoApp === 'ofertas' ? PRECIOS_OFERTAS : PRECIOS_PRESUPUESTOS;
    
    let opcionesHTML = "";
    for (const [nombre, data] of Object.entries(dictPrecios)) {
        let lblPrecio = `(${data.moneda === 'USD' ? 'U$D' : '$'} ${data.precio.toLocaleString('es-AR')})`;
        opcionesHTML += `<option value="${nombre}">${lblPrecio}</option>`;
    }

    const div = document.createElement('div');
    div.className = "maquina-item";
    div.style.cssText = "background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 4px solid #1a73e8; box-shadow: 0 1px 4px rgba(0,0,0,0.08);";
    div.id = `maq-${idUnico}`;
    
    let gridColumnas = modoApp === 'presupuestos' ? '1fr 1fr 1fr 1.2fr' : '1fr 1fr';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <h4 style="margin:0; color:#1a73e8;">Ítem</h4>
            <span style="color:#d93025; font-weight:bold; cursor:pointer;" onclick="eliminarMaquinaDOM('${div.id}')">✖ Quitar</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
            
            <div>
                <label style="font-size: 12px; font-weight: bold; color: #5f6368;">Detalle / Marca:</label>
                <input type="text" class="maq-desc" value="${desc}" placeholder="Ej: Cinta StarTrac / Pantalla..." style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc;">
            </div>

            <div>
                <label style="font-size: 12px; font-weight: bold; color: #5f6368;">Componente:</label>
                <input type="text" class="maq-tipo" list="dl-${idUnico}" value="${tipoBase}" placeholder="Buscá en la lista o escribí libremente..." style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc; font-weight:bold;" oninput="actualizarPrecioItem(this)">
                <datalist id="dl-${idUnico}">${opcionesHTML}</datalist>
            </div>
            
            <div class="cable-options" style="display:none; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; background: #f1f3f4; padding: 10px; border-radius: 6px; border-left: 3px solid #fbbc04;">
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Metros de Cable:</label>
                    <input type="number" class="maq-metros" value="${metros}" min="0.1" step="0.1" oninput="actualizarPrecioItem(this.closest('.maquina-item').querySelector('.maq-tipo'))" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Cant. Terminales:</label>
                    <input type="number" class="maq-terminales" value="${terminales}" min="0" oninput="actualizarPrecioItem(this.closest('.maquina-item').querySelector('.maq-tipo'))" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: ${gridColumnas}; gap: 10px; margin-top: 5px;">
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Cant:</label>
                    <input type="number" class="maq-cant" value="${cant}" min="1" oninput="calcularTotal()" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc; text-align:center;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Unit. (ARS):</label>
                    <input type="number" class="maq-precio" placeholder="$" style="width:100%; padding:8px; border-radius:6px; border:1px solid #1a73e8; font-weight:bold;" oninput="calcularTotal()">
                </div>
                ${modoApp === 'presupuestos' ? `
                <div>
                    <label style="font-size: 11px; font-weight: bold; color:#d93025;">IVA 21%:</label>
                    <input type="text" class="maq-iva" disabled value="$0" style="width:100%; padding:8px; border-radius:6px; border:none; background:#fce8e6; color:#d93025; font-weight:bold;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color:#0f9d58;">P. Final:</label>
                    <input type="text" class="maq-final" disabled value="$0" style="width:100%; padding:8px; border-radius:6px; border:none; background:#e6f4ea; color:#0f9d58; font-weight:bold;">
                </div>
                ` : ''}
            </div>

            <!-- 🔥 PREVISUALIZACIÓN DE IMÁGENES DEL ÍTEM 🔥 -->
            <div style="margin-top:12px; border-top:1px dashed #e0e0e0; padding-top:10px;">
                <label style="font-size:11px; font-weight:800; color:#5f6368; text-transform:uppercase; letter-spacing:0.4px; cursor:pointer; display:flex; align-items:center; gap:6px;"
                       onclick="document.getElementById('img-input-${idUnico}').click()">
                    📎 Adjuntar foto del ítem (opcional)
                    <span style="background:#e8f0fe; color:#1a73e8; padding:2px 8px; border-radius:10px; font-size:11px;">+ Agregar</span>
                </label>
                <input type="file" id="img-input-${idUnico}" accept="image/*" multiple style="display:none;"
                       onchange="previewItemImages(this, 'img-preview-${idUnico}')">
                <div id="img-preview-${idUnico}" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
            </div>
        </div>
    `;
    
    contenedor.appendChild(div);
    
    if (precioForzado !== null) {
        div.querySelector('.maq-precio').value = precioForzado;
        actualizarPrecioItem(div.querySelector('.maq-tipo'), true);
    } else if (tipoBase !== "") {
        actualizarPrecioItem(div.querySelector('.maq-tipo'));
    }
}

// 🔥 PREVISUALIZACIÓN DE IMÁGENES EN ÍTEMS 🔥
function previewItemImages(inputEl, previewContainerId) {
    const container = document.getElementById(previewContainerId);
    if (!container) return;

    Array.from(inputEl.files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target.result;
            const thumb = document.createElement('div');
            thumb.className = 'foto-preview-thumb';
            thumb.innerHTML = `
                <img src="${url}" alt="${file.name}" title="${file.name}"
                     onclick="abrirPreviewImagen('${url}')">
                <button class="foto-remove" title="Quitar foto"
                        onclick="this.parentElement.remove()">✕</button>
            `;
            container.appendChild(thumb);
        };
        reader.readAsDataURL(file);
    });
    inputEl.value = ''; // Resetear para permitir re-selección
}

function abrirPreviewImagen(url) {
    const modal = document.getElementById('modal-img-preview');
    const img   = document.getElementById('modal-img-preview-src');
    if (modal && img) {
        img.src = url;
        modal.classList.add('open');
    } else if (window.mostrarPreviaImagen) {
        window.mostrarPreviaImagen(url);
    }
}

function actualizarPrecioItem(inputElement, skipPriceUpdate = false) {
    const item = inputElement.closest('.maquina-item');
    const tipo = inputElement.value.trim();
    const inputPrecio = item.querySelector('.maq-precio');
    const dictPrecios = modoApp === 'ofertas' ? PRECIOS_OFERTAS : PRECIOS_PRESUPUESTOS;
    
    const cableOptions = item.querySelector('.cable-options');
    let isCable = tipo.toLowerCase().includes('cable');
    cableOptions.style.display = isCable ? 'grid' : 'none';

    // 🔥 Usar siempre el dólar real — valorDolarOficial se actualiza automáticamente 🔥
    const tasaDolar = valorDolarOficial;

    if (dictPrecios[tipo] && !skipPriceUpdate) {
        const info = dictPrecios[tipo];
        
        if (isCable) {
            let mts = parseFloat(item.querySelector('.maq-metros').value) || 0;
            let terms = parseInt(item.querySelector('.maq-terminales').value) || 0;
            let costoMtsUSD = mts * info.precio;
            let costoTermsUSD = terms * 10;
            let totalUSD = costoMtsUSD + costoTermsUSD;
            inputPrecio.value = Math.round(totalUSD * tasaDolar);
            
            // Mostrar info del dólar en el item si es USD
            let infoDiv = item.querySelector('.info-usd');
            if (!infoDiv) {
                infoDiv = document.createElement('div');
                infoDiv.className = 'info-usd';
                infoDiv.style.cssText = 'font-size:11px; color:#0f9d58; background:#e6f4ea; padding:4px 8px; border-radius:4px; margin-top:4px; font-weight:bold;';
                inputPrecio.parentElement.appendChild(infoDiv);
            }
            infoDiv.innerText = `U$D ${totalUSD.toFixed(2)} × $${tasaDolar.toLocaleString('es-AR')} = $${Math.round(totalUSD * tasaDolar).toLocaleString('es-AR')}`;
        } else if (info.moneda === "USD") {
            let precioEnPesos = Math.round(info.precio * tasaDolar);
            inputPrecio.value = precioEnPesos;
            
            // Mostrar info del dólar
            let infoDiv = item.querySelector('.info-usd');
            if (!infoDiv) {
                infoDiv = document.createElement('div');
                infoDiv.className = 'info-usd';
                infoDiv.style.cssText = 'font-size:11px; color:#0f9d58; background:#e6f4ea; padding:4px 8px; border-radius:4px; margin-top:4px; font-weight:bold;';
                inputPrecio.parentElement.appendChild(infoDiv);
            }
            infoDiv.innerText = `U$D ${info.precio} × $${tasaDolar.toLocaleString('es-AR')} = $${precioEnPesos.toLocaleString('es-AR')}`;
        } else {
            inputPrecio.value = Math.round(info.precio);
            // Quitar info de dólar si no aplica
            let infoDiv = item.querySelector('.info-usd');
            if (infoDiv) infoDiv.remove();
        }
    } 
    
    calcularTotal();
}

function eliminarMaquinaDOM(idDiv) {
    document.getElementById(idDiv).remove();
    calcularTotal();
}

function calcularTotal() {
    let subtotal = 0;
    const items = document.querySelectorAll('.maquina-item');
    
    items.forEach(item => {
        const cant = parseInt(item.querySelector('.maq-cant').value) || 0;
        const precioUnitario = parseFloat(item.querySelector('.maq-precio').value) || 0;
        
        const subtotalItem = cant * precioUnitario;
        subtotal += subtotalItem;

        // Solo calcula y llena los campos de IVA si estamos en modo presupuestos
        if (modoApp === 'presupuestos') {
            const ivaItem = subtotalItem * 0.21;
            const totalConIva = subtotalItem + ivaItem;
            item.querySelector('.maq-iva').value = `$${Math.round(ivaItem).toLocaleString('es-AR')}`;
            item.querySelector('.maq-final').value = `$${Math.round(totalConIva).toLocaleString('es-AR')}`;
        }
    });

    let totalFinal = subtotal;
    
    // Matemática general de la caja de abajo
    if (modoApp === 'presupuestos') {
        const ivaTotal = subtotal * 0.21;
        totalFinal = subtotal + ivaTotal;
        document.getElementById('subtotal-precio').innerText = `$${Math.round(subtotal).toLocaleString('es-AR')}`;
        document.getElementById('iva-precio').innerText = `$${Math.round(ivaTotal).toLocaleString('es-AR')}`;
    }
    document.getElementById('input-total-manual').value = Math.round(totalFinal);
    return totalFinal;
}

function filtrarGimnasiosPersonalizado() {
    const input = document.getElementById('input-gym');
    const texto = input.value.toLowerCase();
    const sugerenciasBox = document.getElementById('sugerencias-gym');
    
    // Limpiamos lo anterior
    document.getElementById('contenedor-burbujas-fecha').innerHTML = '';
    document.getElementById('detalle-motivo-burbuja').style.display = 'none';

    if (!texto) {
        sugerenciasBox.style.display = 'none';
        return;
    }

    const listaUsar = modoApp === 'ofertas' ? globalGymsOfertas : globalGymsPresupuestos;
    const filtrados = listaUsar.filter(g => g.toLowerCase().includes(texto));

    sugerenciasBox.innerHTML = '';
    
    if (filtrados.length === 0) {
        sugerenciasBox.style.display = 'none';
        return;
    }

    filtrados.forEach(gym => {
        const div = document.createElement('div');
        div.style.cssText = "padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; color: #333; font-weight:bold; font-size: 15px;";
        div.innerText = gym;
        
        div.onclick = () => {
            input.value = gym;
            sugerenciasBox.style.display = 'none'; // Cerramos la lista
            
            // 🔥 IMPORTANTE: Forzamos que aparezcan las burbujas
            if (modoApp === 'presupuestos') {
                mostrarBurbujasFecha(gym);
            }
        };
        sugerenciasBox.appendChild(div);
    });

    sugerenciasBox.style.display = 'block';
}
async function guardarDocumento() {
    const cliente = document.getElementById('input-gym').value.trim();
    const frecObj = modoApp === 'ofertas' ? document.getElementById('informe-frecuencia').value : "";
    const totalFinal = parseFloat(document.getElementById('input-total-manual').value) || 0;
    
    // Capturamos el CUIT
    const cuitVal = document.getElementById('input-cuit') ? document.getElementById('input-cuit').value.trim() : "";
    
    if (!cliente) { mostrarMensaje('⚠️ Identificá el gimnasio.', 'error'); return; }

    const itemsDOM = document.querySelectorAll('.maquina-item');
    if (itemsDOM.length === 0) { mostrarMensaje('⚠️ Agregá al menos un ítem.', 'error'); return; }

    let maquinas = [];
    itemsDOM.forEach(item => {
        const tipo = item.querySelector('.maq-tipo').value.trim() || "Sin Especificar";
        let isCable = tipo.toLowerCase().includes('cable');
        let metros = isCable ? (parseFloat(item.querySelector('.maq-metros').value) || 0) : null;
        let terminales = isCable ? (parseInt(item.querySelector('.maq-terminales').value) || 0) : null;
        
        maquinas.push({
            tipo: tipo,
            desc: item.querySelector('.maq-desc').value.trim(),
            cant: parseInt(item.querySelector('.maq-cant').value) || 1,
            precio: parseFloat(item.querySelector('.maq-precio').value) || 0,
            metros: metros,
            terminales: terminales
        });
    });

    let estadoActual = "Pendiente";
    if (idEditando) {
        const prev = documentosGuardados.find(i => i.id === idEditando);
        if (prev && prev.estado) estadoActual = prev.estado;
    }

    let fechaText = "";
    if (modoApp === 'presupuestos') {
        fechaText = document.getElementById('input-fecha-presup').value.trim();
    } else {
        const hoy = new Date();
        fechaText = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth()+1).padStart(2, '0')}/${hoy.getFullYear()}`;
    }

    const payloadDoc = {
        hoja: modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS,
        datos: {
            id: idEditando || Date.now(), 
            fecha: fechaText,
            cliente: cliente,
            atributoExtra: frecObj,
            total: totalFinal,
            estado: estadoActual,
            items: maquinas,
            fechaVisita: fechaSeleccionadaOriginal, 
            pagado: idEditando ? (documentosGuardados.find(i => i.id === idEditando)?.pagado || "Pendiente") : "Pendiente",
            cuit: cuitVal,
            numFactura: idEditando ? (documentosGuardados.find(i => i.id === idEditando)?.numFactura || "") : "" // 🔥 CONSERVAMOS LA FACTURA
        }
    };

    const btn = document.getElementById('btn-guardar');
    btn.disabled = true;
    mostrarMensaje('Sincronizando con la nube... ☁️', 'cargando');

    try {
        await llamarAPI({ accion: "guardarDocumentoBD", payload: payloadDoc });
        idEditando = null;
        
        document.getElementById('input-gym').value = '';
        if (document.getElementById('input-cuit')) document.getElementById('input-cuit').value = '';
        
        document.getElementById('lista-maquinas-dom').innerHTML = '';
        
        const contBurbujas = document.getElementById('contenedor-burbujas-fecha');
        if(contBurbujas) contBurbujas.innerHTML = '';
        const detBurbujas = document.getElementById('detalle-motivo-burbuja');
        if(detBurbujas) detBurbujas.style.display = 'none';
        
        agregarItem();
        mostrarMensaje('✅ Guardado exitosamente.', 'exito');

        // Mostrar acceso rápido PDF/Mail con el ID del documento guardado
        const nuevoId = respuesta?.id || payload.datos.id;
        const accesoPDF = document.getElementById('acceso-rapido-pdf');
        const btnPDF    = document.getElementById('btn-rapido-pdf');
        const btnMail   = document.getElementById('btn-rapido-mail');
        if (accesoPDF && nuevoId) {
            accesoPDF.style.display = 'block';
            if (btnPDF)  btnPDF.onclick  = () => abrirVistaPresupuesto(nuevoId);
            if (btnMail) btnMail.onclick = () => prepararMail(nuevoId);
        }
        setTimeout(() => switchTab('creados'), 1500);
    } catch (e) {
        const msg = e?.message || String(e) || 'Error desconocido';
        console.error('guardarDocumento error:', e);
        mostrarMensaje('❌ Error de conexión: ' + msg + '\n(Verificá tu internet y que el script de Google esté activo)', 'error');
    } finally { btn.disabled = false; }
}
// Para que la lista se cierre si tocas en cualquier otra parte de la pantalla
document.addEventListener('click', (e) => {
    if (!e.target.closest('#container-gym')) {
        const box = document.getElementById('sugerencias-gym');
        if(box) box.style.display = 'none';
    }
});
async function obtenerYRenderizarCreados() {
    const contenedor = document.getElementById('contenedor-informes-creados');
    contenedor.innerHTML = '<p style="text-align:center; color:#1a73e8; font-weight:bold;">Leyendo desde la nube... ⏳</p>';
    const hojaReq = modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS;

    try {
        documentosGuardados = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: hojaReq } });
        renderizarTarjetas(); // Llama al dibujador
    } catch(e) { 
        contenedor.innerHTML = '<p style="text-align:center; color:red;">❌ Error de conexión.</p>'; 
    }
}

// 🔥 FUNCIÓN TRADUCTORA DE FECHAS GOOGLE 🔥
function limpiarFecha(fechaRaw) {
    if (!fechaRaw) return "Sin Fecha";
    let f = String(fechaRaw);
    if (f.includes('T') && f.includes('Z')) {
        const d = new Date(f);
        return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    } else if (f.includes('-')) {
        const partes = f.split('-');
        if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return f;
}

// 🔥 VARIABLES GLOBALES PARA LOS FILTROS (Pegar donde estaba renderizarTarjetas) 🔥
let filtroPagoActual = 'Pendiente';
let filtroMesActual = 'Todos';

function setFiltroPago(valor) {
    // Normalizar: el nuevo HTML pasa 'pendiente','pagado','todos' en minúsculas
    const map = { pendiente: 'Pendiente', pagado: 'Pagado', todos: 'Todos' };
    filtroPagoActual = map[valor.toLowerCase()] || valor;
    renderizarTarjetas();
}
function setFiltroMes(valor) { filtroMesActual = valor; renderizarTarjetas(); }

function renderizarTarjetas() {
    const contenedor = document.getElementById('contenedor-informes-creados');
    contenedor.innerHTML = '';
    
    // ============================================================
    // 1. AUTO-NOMBRE POR CUIT GLOBAL (Conecta Ofertas y Presupuestos)
    // ============================================================
    let cuitDic = JSON.parse(localStorage.getItem('cuitGlobalDic')) || {};
    
    documentosGuardados.forEach(d => {
        let clienteStr = String(d.cliente || "Sin Nombre");
        if (d.cuit && !clienteStr.includes("⚠️ IMPORTADO")) {
            cuitDic[d.cuit] = clienteStr;
        }
        d.fechaLimpia = limpiarFecha(d.fecha);
        const partes = d.fechaLimpia.split('/');
        d.mesAnio = partes.length === 3 ? `${partes[1]}/${partes[2]}` : "Sin Fecha";
    });
    
    localStorage.setItem('cuitGlobalDic', JSON.stringify(cuitDic));

    documentosGuardados.forEach(d => {
        if (d.cuit && cuitDic[d.cuit]) {
            d.cliente = cuitDic[d.cuit];
        }
        d.cliente = String(d.cliente || "Sin Nombre");
    });

    // ============================================================
    // 2. BUSCADOR INTELIGENTE (Permite buscar "Gym 09/05/2025")
    // ============================================================
    const textoBuscado = (document.getElementById('buscador-global')?.value || "").toLowerCase().trim();
    
    let filtrados = documentosGuardados.filter(d => {
        let itemsStr = d.items && Array.isArray(d.items) ? d.items.map(i => i.tipo + " " + i.desc).join(" ") : "";
        let numFactFix = String(d.numFactura || "");
        
        // Palabras clave extra para que encuentre fácil si pones "Factura" o "Nota"
        let tipoFacturaOculto = "";
        if (numFactFix.startsWith("NC ")) tipoFacturaOculto = `nota de credito ${numFactFix.replace("NC ", "")}`;
        else if (numFactFix.includes("-")) tipoFacturaOculto = `factura ${numFactFix}`;
        
        let busqueda = `${d.cliente} ${d.cuit} ${d.fechaLimpia} ${d.total} ${numFactFix} ${tipoFacturaOculto} ${itemsStr}`.toLowerCase();
        
        // Si el usuario escribe varias palabras separadas por espacio, exigimos que TODAS coincidan
        let palabrasBuscadas = textoBuscado.split(" ");
        return palabrasBuscadas.every(palabra => busqueda.includes(palabra));
    });

    // ============================================================
    // 3. EXTRAER Y ORDENAR LOS MESES (🔥 DE MÁS RECIENTE A MÁS ANTIGUO 🔥)
    // ============================================================
    let mesesSet = new Set();
    filtrados.forEach(d => mesesSet.add(d.mesAnio));
    let mesesArr = Array.from(mesesSet).sort((a,b) => {
        if(a === "Sin Fecha") return 1; if(b === "Sin Fecha") return -1;
        let [ma, ya] = a.split('/'); let [mb, yb] = b.split('/');
        // Invertido: Año mayor y mes mayor van primero
        return new Date(yb, mb-1) - new Date(ya, ma-1); 
    });

    if (filtroMesActual !== 'Todos' && !mesesSet.has(filtroMesActual)) filtroMesActual = 'Todos';

    // 4. APLICAR FILTROS DE BURBUJA
    let finales = filtrados.filter(d => {
        let matchPago = (filtroPagoActual === 'Todos' || d.pagado === filtroPagoActual);
        let matchMes = (filtroMesActual === 'Todos' || d.mesAnio === filtroMesActual);
        return matchPago && matchMes;
    });

    // 🔥 ORDENAMOS LAS TARJETAS DE MÁS NUEVA A MÁS VIEJA 🔥
    finales.sort((a, b) => {
        if(a.fechaLimpia === "Sin Fecha") return 1;
        if(b.fechaLimpia === "Sin Fecha") return -1;
        let [da, ma, ya] = a.fechaLimpia.split('/');
        let [db, mb, yb] = b.fechaLimpia.split('/');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    });

    // 5. CHIPS DE MES (meses-scroll con clase mes-chip)
    const mesesScrollEl = document.getElementById('meses-scroll');
    if (mesesScrollEl) {
        let chipsHTML = `<button class="mes-chip ${filtroMesActual==='Todos'?'activo':''}" onclick="setFiltroMes('Todos')">Ver todos</button>`;
        mesesArr.forEach(m => {
            chipsHTML += `<button class="mes-chip ${filtroMesActual===m?'activo':''}" onclick="setFiltroMes('${m}')">${m}</button>`;
        });
        mesesScrollEl.innerHTML = chipsHTML;
    }

    // Botones filtro estado con colores
    const filtroMap = { pendiente:'Pendiente', pagado:'Pagado', todos:'Todos' };
    Object.entries(filtroMap).forEach(([k, v]) => {
        const btn = document.getElementById('filtro-' + k);
        if (!btn) return;
        const isActive = filtroPagoActual === v;
        const colors = {
            pendiente: { bg: isActive ? '#fce8e6' : '#f4f6f9', col: isActive ? '#d93025' : '#5f6368' },
            pagado:    { bg: isActive ? '#e6f4ea' : '#f4f6f9', col: isActive ? '#0f9d58' : '#5f6368' },
            todos:     { bg: isActive ? '#e8f0fe' : '#f4f6f9', col: isActive ? '#1a73e8' : '#5f6368' },
        };
        btn.style.background = colors[k].bg;
        btn.style.color      = colors[k].col;
        btn.style.boxShadow  = isActive ? '0 2px 8px rgba(0,0,0,0.12)' : 'none';
    });

    // 6. TARJETAS CON NUEVO DISEÑO
    if (finales.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#9aa0a6;">
            <div style="font-size:36px; margin-bottom:10px;">🗂️</div>
            <div style="font-weight:700; font-size:15px;">No hay documentos en esta categoría</div>
        </div>`;
        return;
    }

    finales.forEach((doc, animIdx) => {
        const estadoReal = doc.estado || "Pendiente";
        const esPagado   = doc.pagado === "Pagado";
        const colorEst   = estadoReal === "Facturado / Aprobado" ? "#34a853" : estadoReal === "Enviado" ? "#1a73e8" : "#fbbc04";
        const colorPag   = esPagado ? "#0f9d58" : "#d93025";
        const bgPag      = esPagado ? "#e6f4ea" : "#fce8e6";

        const badgeCuit = doc.cuit
            ? `<span style="background:#f1f3f4; color:#5f6368; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:700; border:1px solid #e0e0e0; margin-right:4px;">${doc.cuit}</span>`
            : '';
        let factStr = String(doc.numFactura || '');
        let displayFact = factStr.startsWith("NC ") ? `🔄 NC ${factStr.replace("NC ","")}` : factStr.includes("-") ? `📄 Factura ${factStr}` : factStr ? `📄 ${factStr}` : '';
        const badgeFact = displayFact ? `<span class="badge-fact">${displayFact}</span>` : '';

        let maquinasHTML = '';
        if (doc.items && Array.isArray(doc.items)) {
            maquinasHTML = `<ul style="margin:0 0 10px; padding-left:18px; font-size:13px; color:#475467; line-height:1.7;">` +
                doc.items.map(m => {
                    let extra = (m.metros && m.terminales) ? ` <span style="color:#0f9d58; font-size:11px;">(${m.metros}m / ${m.terminales} term.)</span>` : '';
                    return `<li><b>${m.cant}x ${m.desc||'—'}</b> — ${m.tipo} <span style="color:#d93025; font-size:11px;">($${(m.precio||0).toLocaleString('es-AR')} c/u)</span>${extra}</li>`;
                }).join('') + `</ul>`;
        }

        const selectsHTML = modoApp === 'presupuestos' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#5f6368; margin-bottom:4px;">Estado Operativo</div>
                    <select onchange="cambiarEstado(${doc.id}, this.value, 'estado')"
                            style="width:100%; padding:9px; border-radius:8px; border:1.5px solid ${colorEst}; font-weight:700; color:${colorEst}; outline:none; background:white;">
                        <option value="Pendiente"            ${estadoReal==='Pendiente'?'selected':''}>Pendiente</option>
                        <option value="Enviado"              ${estadoReal==='Enviado'?'selected':''}>Enviado</option>
                        <option value="Facturado / Aprobado" ${estadoReal==='Facturado / Aprobado'?'selected':''}>Facturado / Aprobado</option>
                    </select>
                </div>
                <div>
                    <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#5f6368; margin-bottom:4px;">Estado de Pago</div>
                    <select onchange="cambiarEstado(${doc.id}, this.value, 'pagado')"
                            style="width:100%; padding:9px; border-radius:8px; border:1.5px solid ${colorPag}; font-weight:700; color:${colorPag}; background:${bgPag}; outline:none;">
                        <option value="Pendiente" ${doc.pagado==='Pendiente'?'selected':''}>Pendiente</option>
                        <option value="Pagado"    ${doc.pagado==='Pagado'?'selected':''}>Pagado</option>
                    </select>
                </div>
            </div>` : '';

        const div = document.createElement('div');
        div.className = `doc-card-v3 ${esPagado?'pagado':'pendiente'}`;
        div.style.animationDelay = (animIdx * 0.035) + 's';

        div.innerHTML = `
            <div class="doc-header-v3" onclick="
                const body = this.nextElementSibling;
                const open = body.classList.toggle('abierto');
                this.querySelector('.arrow').innerText = open ? '▲' : '▼';
            ">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                        <span class="doc-gym-v3">${doc.cliente}</span>
                        ${badgeCuit}
                        ${badgeFact}
                    </div>
                    <div class="doc-meta-v3">
                        ${doc.fechaLimpia}
                        &nbsp;·&nbsp;
                        Total: <strong style="color:#1a73e8;">$${Number(doc.total).toLocaleString('es-AR')}</strong>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${modoApp==='presupuestos' ? `<span class="badge-estado ${esPagado?'pagado':'pendiente'}">${doc.pagado}</span>` : ''}
                    <span class="arrow" style="font-size:13px; color:#1a73e8; font-weight:800;">▼</span>
                </div>
            </div>
            <div class="doc-expand-v3">
                ${maquinasHTML}
                ${selectsHTML}
                <div class="doc-actions">
                    <button class="btn-doc-edit" onclick="editarDocumento(${doc.id})">✏️ Editar</button>
                    <button class="btn-doc-del"  onclick="eliminarDocumento(${doc.id})">🗑️ Eliminar</button>
                </div>
                <!-- Acciones rápidas: PDF y Mail -->
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button onclick="abrirVistaPresupuesto(${doc.id})"
                            style="flex:1; padding:11px; background:linear-gradient(135deg,#1a73e8,#1155cc);
                                   color:white; border:none; border-radius:10px; font-weight:900;
                                   font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(26,115,232,0.35);
                                   display:flex; align-items:center; justify-content:center; gap:6px;">
                        📄 Ver y Exportar PDF
                    </button>
                    <button onclick="prepararMail(${doc.id})"
                            style="flex:1; padding:11px; background:linear-gradient(135deg,#0f9d58,#0b7a42);
                                   color:white; border:none; border-radius:10px; font-weight:900;
                                   font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(15,157,88,0.35);
                                   display:flex; align-items:center; justify-content:center; gap:6px;">
                        📧 Preparar Mail
                    </button>
                </div>
            </div>
        `;
        contenedor.appendChild(div);
    });
}

// ════════════════════════════════════════════════════════════════
//  📄 GENERADOR DE PRESUPUESTO PDF + 📧 MAIL AUTOMÁTICO
// ════════════════════════════════════════════════════════════════

function abrirVistaPresupuesto(id) {
    const doc = documentosGuardados.find(d => d.id === id);
    if (!doc) return;

    // ── Base URL para los assets ─────────────────────────────────
    const href = window.location.href;
    const raiz = href.includes('/Informes/')
        ? href.substring(0, href.indexOf('/Informes/')) + '/'
        : href.substring(0, href.lastIndexOf('/') + 1);
    const A = (f) => raiz + 'assets/' + f;

    // ── Fecha limpia (usa fechaLimpia que ya parsea ISO) ─────────
    const fechaLimpia = doc.fechaLimpia && doc.fechaLimpia !== 'Sin Fecha'
        ? doc.fechaLimpia
        : (() => {
            const f = String(doc.fecha || '');
            if (f.includes('T')) {
                const d = new Date(f);
                return String(d.getUTCDate()).padStart(2,'0') + '/' +
                       String(d.getUTCMonth()+1).padStart(2,'0') + '/' +
                       d.getUTCFullYear();
            }
            return f || '—';
        })();
    const fechaFormateada = fechaLimpia.replace(/\//g, ' / ');

    // ── Montos ───────────────────────────────────────────────────
    const total  = Number(doc.total) || 0;
    const sinIVA = total > 0 ? Math.round(total / 1.21) : 0;
    const ivaVal = total > 0 ? Math.round(total - sinIVA) : 0;
    // Mostrar totales solo si el doc tiene precio real en el total
    const mostrarTotales = total > 0;
    const fmtARS = n => '$' + Math.round(n).toLocaleString('es-AR');
    const DASH = '————————';

    // ── Filas de ítems ───────────────────────────────────────────
    let filasHTML = '';
    (doc.items || []).forEach(m => {
        const precioUnit = Number(m.precio) || 0;
        const cant       = Number(m.cant) || 1;
        const subtotal   = precioUnit * cant;
        const extra      = (m.metros && m.terminales)
            ? ` (${m.metros}m / ${m.terminales} term.)` : '';

        if (m.desc && m.desc.trim()) {
            filasHTML += `
            <tr style="background:#eaf0fb;">
                <td style="padding:5px 8px; border:1px solid #c8d3ec;"></td>
                <td colspan="4" style="padding:7px 12px; font-weight:900; font-size:14px;
                    border:1px solid #c8d3ec; color:#1a1a1a;">${m.desc}:</td>
            </tr>`;
        }
        filasHTML += `
        <tr>
            <td style="padding:7px 8px; border:1px solid #c8d3ec; text-align:center;
                font-weight:900; font-size:14px; width:90px;">
                ${cant > 1 ? '* ' + cant : ''}</td>
            <td style="padding:7px 12px; border:1px solid #c8d3ec; font-size:13px;">
                ${m.tipo}${extra}</td>
            <td style="padding:7px 8px; border:1px solid #c8d3ec; text-align:center;
                font-size:13px; width:60px; font-weight:700;">SI</td>
            <td style="padding:7px 8px; border:1px solid #c8d3ec; text-align:right;
                font-size:13px; font-weight:700; width:130px;">
                ${cant > 1 && precioUnit > 0 ? fmtARS(precioUnit) : ''}</td>
            <td style="padding:7px 8px; border:1px solid #c8d3ec; text-align:right;
                font-weight:900; font-size:14px; width:155px;">
                ${subtotal > 0 ? fmtARS(subtotal) + '+IVA' : ''}</td>
        </tr>`;
    });

    // Filas de relleno
    const nItems = (doc.items || []).length;
    for (let i = 0; i < Math.max(0, 5 - nItems * 2); i++) {
        filasHTML += `<tr>
            <td style="height:28px; border:1px solid #c8d3ec;"></td>
            <td style="border:1px solid #c8d3ec;"></td>
            <td style="border:1px solid #c8d3ec;"></td>
            <td style="border:1px solid #c8d3ec;"></td>
            <td style="border:1px solid #c8d3ec;"></td>
        </tr>`;
    }

    // Fila observación + totales
    filasHTML += `
    <tr>
        <td rowspan="3" style="border:1px solid #c8d3ec;"></td>
        <td rowspan="3" style="padding:8px 12px; border:1px solid #c8d3ec;
            font-size:12px; vertical-align:top; font-weight:700; color:#555;">Observación:</td>
        <td rowspan="3" style="border:1px solid #c8d3ec;"></td>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; font-weight:800;
            background:#eaf0fb; font-size:12px; text-align:right; color:#1a3a8f;">SUBTOTAL</td>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; text-align:right;
            font-size:12px; font-weight:700; color:#555; font-family:monospace;">
            ${mostrarTotales ? fmtARS(sinIVA) : DASH}</td>
    </tr>
    <tr>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; font-weight:800;
            background:#eaf0fb; font-size:12px; text-align:right; color:#1a3a8f;">IVA 21 %</td>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; text-align:right;
            font-size:12px; font-weight:700; color:#555; font-family:monospace;">
            ${mostrarTotales ? fmtARS(ivaVal) : DASH}</td>
    </tr>
    <tr>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; font-weight:900;
            background:#1a3a8f; color:white; font-size:13px; text-align:right;">TOTAL</td>
        <td style="padding:7px 10px; border:1px solid #c8d3ec; text-align:right;
            font-weight:900; font-size:13px; background:#1a3a8f; color:white; font-family:monospace;">
            ${mostrarTotales ? fmtARS(total) : DASH}</td>
    </tr>`;

    // ── Registrar en historial local ─────────────────────────────
    registrarPDFGenerado(doc);

    const clienteUpper = (doc.cliente || '').toUpperCase();
    const cuitStr      = doc.cuit ? '  ·  CUIT: ' + doc.cuit : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Presupuesto — ${doc.cliente}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    background: #dde3ec;
    padding: 20px 16px 90px;
    color: #111;
}
.hoja {
    background: white;
    max-width: 860px;
    margin: 0 auto;
    border: 1px solid #aab;
    box-shadow: 0 4px 28px rgba(0,0,0,0.18);
}
.hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 10px 12px;
    border-bottom: 3px solid #1a3a8f;
    gap: 10px;
}
.hdr-logo img { height: 76px; display: block; object-fit: contain; }
.hdr-marcas {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: flex-end;
}
.hdr-marcas img {
    height: 40px;
    object-fit: contain;
    max-width: 130px;
}
.band {
    background: #f4f7fb;
    border-bottom: 1px solid #c8d3ec;
    padding: 6px 14px;
}
.pres-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 3px;
    color: #1a3a8f;
    margin-bottom: 5px;
}
.band-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 3px;
    flex-wrap: wrap;
}
.band-empresa { font-size: 12px; font-weight: 700; color: #111; }
.band-cliente { font-size: 13px; font-weight: 900; color: #1a3a8f; }
.band-sub { font-size: 11px; color: #444; font-style: italic; }
.band-fecha { font-size: 12px; font-weight: 900; color: #111; }
.tabla-wrap { padding: 10px 14px 0; }
table.items { width:100%; border-collapse:collapse; }
table.items thead th {
    background: #1a3a8f;
    color: white;
    padding: 8px 10px;
    font-size: 12px;
    border: 1px solid #112d78;
    font-weight: 800;
}
table.items thead th:nth-child(1) { width:90px; text-align:center; }
table.items thead th:nth-child(3) { width:60px; text-align:center; }
table.items thead th:nth-child(4) { width:130px; text-align:right; }
table.items thead th:nth-child(5) { width:155px; text-align:right; }
.obs-bloque { padding: 8px 14px 14px; }
#obs-area {
    width: 100%;
    min-height: 68px;
    font-size: 12px;
    font-family: Arial, sans-serif;
    font-weight: 700;
    color: #c0392b;
    border: 1px dashed #ddd;
    border-radius: 3px;
    padding: 6px 8px;
    resize: vertical;
    line-height: 1.8;
    white-space: pre-wrap;
    background: transparent;
}
.toolbar {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: rgba(255,255,255,0.96);
    border-top: 2px solid #dde3f0;
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 12px 20px;
    z-index: 100;
    flex-wrap: wrap;
    backdrop-filter: blur(6px);
}
.btn {
    padding: 11px 22px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
}
.btn:active { transform: scale(0.97); }
.btn-pdf  { background:linear-gradient(135deg,#1a3a8f,#1155cc); color:white; box-shadow:0 4px 14px rgba(26,58,143,0.45); }
.btn-mail { background:linear-gradient(135deg,#0f9d58,#0b7a42); color:white; box-shadow:0 4px 14px rgba(15,157,88,0.4); }
.btn-close{ background:#f1f3f5; color:#3c4043; border:1.5px solid #ddd; }
@media print {
    body { background:white !important; padding:0 !important; }
    .hoja { box-shadow:none !important; border:none !important; max-width:100% !important; }
    .toolbar { display:none !important; }
    #obs-area { border:none !important; }
    table.items thead th,
    tr td[style*="background:#1a3a8f"],
    tr td[style*="background:#eaf0fb"] {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
}
</style>
</head>
<body>
<div class="hoja">

    <!-- HEADER -->
    <div class="hdr">
        <div class="hdr-logo">
            <img src="${A('Logoparapdf.jpeg')}" alt="Support Fitness"
                 onerror="this.src='${A('Logoparapdf.png')}'"
                 onerror="this.src='${A('logo2.jpeg')}'">
        </div>
        <div class="hdr-marcas">
            <img src="${A('StarTrac.png')}"  alt="Star Trac"
                 onerror="this.outerHTML='<b style=&quot;color:#003087;font-size:11px;font-style:italic;&quot;>⊙ STAR TRAC·</b>'">
            <img src="${A('Spinning.png')}"  alt="Spinning"
                 onerror="this.outerHTML='<b style=&quot;color:#e31837;font-size:11px;&quot;>⊗ SPINNING.</b>'">
            <img src="${A('Octane.png')}"    alt="Octane"
                 onerror="this.outerHTML='<b style=&quot;color:#ff6600;font-size:11px;&quot;>Octane</b>'">
            <img src="${A('Paramount.png')}" alt="Paramount"
                 onerror="this.outerHTML='<b style=&quot;color:#111;font-size:11px;&quot;>/PARAMOUNT.</b>'">
        </div>
    </div>

    <!-- INFO BANDA -->
    <div class="band">
        <div class="pres-title">P R E S U P U E S T O</div>
        <div class="band-row">
            <span class="band-empresa">SUPPORT FITNESS de Aban Ricardo Ezequiel</span>
            <span class="band-cliente">CLIENTE : ${clienteUpper}${cuitStr}</span>
        </div>
        <div class="band-row">
            <span class="band-sub">CHILE 1239 &nbsp; CP1098 - CABA &nbsp;&nbsp; | &nbsp;&nbsp; CEL :15-61177878 &nbsp;&nbsp; support_fitness@hotmail.com</span>
            <span class="band-fecha">FECHA : ${fechaFormateada}</span>
        </div>
    </div>

    <!-- TABLA -->
    <div class="tabla-wrap">
        <table class="items">
            <thead>
                <tr>
                    <th>Cantidad</th>
                    <th style="text-align:left;"></th>
                    <th>Disp.</th>
                    <th>Precio Unit.</th>
                    <th>Precio</th>
                </tr>
            </thead>
            <tbody>${filasHTML}</tbody>
        </table>
    </div>

    <!-- OBSERVACIONES -->
    <div class="obs-bloque">
        <textarea id="obs-area">Observaciones :
Forma de Pago :  Pago Anticipado
El siguiente presupuesto tiene una validez de 3 dias</textarea>
    </div>

</div>

<!-- TOOLBAR -->
<div class="toolbar">
    <button class="btn btn-pdf" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn btn-mail" onclick="abrirMail()">📧 Preparar Mail</button>
    <button class="btn btn-close" onclick="window.close()">✕ Cerrar</button>
</div>

<script>
function abrirMail() {
    const cli   = ${JSON.stringify(doc.cliente || '')};
    const cuit  = ${JSON.stringify(doc.cuit || '')};
    const fecha = ${JSON.stringify(fechaLimpia)};
    const tot   = ${total};
    const asunto= encodeURIComponent('Presupuesto Support Fitness \u2014 ' + cli);
    const cuerpo= encodeURIComponent(
        'Buenas tardes, Se\u00f1ores de administraci\u00f3n.\n\n' +
        'Adjunto el presupuesto correspondiente al trabajo a realizar en sus instalaciones.\n\n' +
        'Cliente: ' + cli + '\n' +
        (cuit ? 'CUIT: ' + cuit + '\n' : '') +
        'Fecha: ' + fecha + '\n' +
        (tot > 0 ? 'Monto total: $' + tot.toLocaleString('es-AR') + '\n' : '') +
        '\nLas reparaciones quedar\u00e1n confirmadas una vez se env\u00ede el comprobante de pago correspondiente.\n\n' +
        'Por favor Confirmar recepci\u00f3n.\n\n' +
        'Cordiales Saludos\nFacundo Dur\u00e1n\n' +
        'SUPPORT FITNESS\n' +
        'Tel: +54 9 11 6117-7878  |  support_fitness@hotmail.com\n' +
        'Chile 1239, CP1098 - CABA  |  CUIT: 20-26285613-6'
    );
    window.location.href = 'mailto:?subject=' + asunto + '&body=' + cuerpo;
}
<\/script>
</body>
</html>`;

    const ventana = window.open('', '_blank', 'width=940,height=860,scrollbars=yes');
    if (ventana) { ventana.document.write(html); ventana.document.close(); }
    else { mostrarMensaje('⚠️ Habilitá los popups para este sitio e intentá de nuevo.', 'error'); }
}

// ── Registro de PDFs generados (localStorage) ────────────────────
function registrarPDFGenerado(doc) {
    try {
        const historial = JSON.parse(localStorage.getItem('historial_pdfs') || '[]');
        historial.unshift({
            ts:       Date.now(),
            id:       doc.id,
            cliente:  doc.cliente || '—',
            fecha:    doc.fechaLimpia || doc.fecha || '—',
            total:    doc.total || 0,
            modo:     typeof modoApp !== 'undefined' ? modoApp : '—'
        });
        // Guardar solo los últimos 100
        localStorage.setItem('historial_pdfs', JSON.stringify(historial.slice(0, 100)));
    } catch(e) {}
}

function verHistorialPDFs() {
    try {
        const historial = JSON.parse(localStorage.getItem('historial_pdfs') || '[]');
        if (historial.length === 0) {
            mostrarMensaje('No hay PDFs generados en este dispositivo todavía.', 'cargando');
            return;
        }
        const modal = document.getElementById('modal-historial-pdfs');
        const lista = document.getElementById('lista-historial-pdfs');
        if (!modal || !lista) return;

        lista.innerHTML = historial.map((r, i) => {
            const d = new Date(r.ts);
            const cuandoStr = d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'});
            const totalStr  = r.total > 0 ? '$' + Number(r.total).toLocaleString('es-AR') : '—';
            return `<div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px;
                    border-bottom:1px solid var(--inf-border); gap:10px; flex-wrap:wrap; animation:scaleIn 0.2s ease ${i*0.03}s both;">
                <div style="min-width:0;">
                    <div style="font-weight:900; font-size:14px; color:var(--inf-text);">${r.cliente}</div>
                    <div style="font-size:12px; color:var(--inf-sub); margin-top:2px;">
                        Doc. fecha: ${r.fecha} &nbsp;·&nbsp; ${r.modo === 'presupuestos' ? '💰 Presupuesto' : '🛠️ Oferta'}
                    </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-weight:900; color:var(--inf-azul);">${totalStr}</div>
                    <div style="font-size:11px; color:var(--inf-muted);">Exportado: ${cuandoStr}</div>
                </div>
            </div>`;
        }).join('');

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('mostrar'), 10);
    } catch(e) { mostrarMensaje('Error al leer historial.', 'error'); }
}



// ─────────────────────────────────────────────────────────────────
//  📧 PREPARAR MAIL (desde la tarjeta, sin abrir ventana)
// ─────────────────────────────────────────────────────────────────
function prepararMail(id) {
    const doc = documentosGuardados.find(d => d.id === id);
    if (!doc) return;

    const cliente = doc.cliente || '—';
    const total   = Number(doc.total) || 0;
    const fecha   = doc.fecha || doc.fechaLimpia || '—';

    const asunto = encodeURIComponent('Presupuesto Support Fitness — ' + cliente);

    // Resumen de ítems para el mail
    const resumenItems = (doc.items || [])
        .map(m => `• ${m.cant > 1 ? m.cant + 'x ' : ''}${m.tipo}${m.desc ? ' (' + m.desc + ')' : ''}`)
        .join('\n');

    const cuerpo = encodeURIComponent(
        'Buenas tardes, Señores de administración.\n\n' +
        'Adjunto el presupuesto correspondiente al trabajo a realizar en sus instalaciones.\n\n' +
        'Cliente: ' + cliente + '\n' +
        (doc.cuit ? 'CUIT: ' + doc.cuit + '\n' : '') +
        'Fecha: ' + fecha + '\n' +
        'Monto total: $' + total.toLocaleString('es-AR') + '\n' +
        (resumenItems ? '\nDetalle:\n' + resumenItems + '\n' : '') +
        '\nLas reparaciones quedarán confirmadas una vez se envíe el comprobante de pago de la factura correspondiente.\n\n' +
        'Por favor Confirmar recepción.\n\n' +
        'Cordiales Saludos\n' +
        'Facundo Durán\n' +
        'SUPPORT FITNESS\n' +
        'Tel: +54 9 11 6117-7878\n' +
        'support_fitness@hotmail.com'
    );

    const mailto = `mailto:?subject=${asunto}&body=${cuerpo}`;
    const link = document.createElement('a');
    link.href = mailto;
    link.click();
    link.remove();
}

// ─────────────────────────────────────────────────────────────────
// 🔥 NUEVO CAMBIO DE ESTADO (Para Múltiples Selects) 🔥
// Variable para recordar qué presupuesto estamos intentando facturar
let tempDocParaFactura = null;

async function cambiarEstado(id, nuevoValor, tipoCambiado) {
    const doc = documentosGuardados.find(i => i.id === id);
    if (!doc) return;
    
    if (tipoCambiado === 'estado') {
        if (nuevoValor === 'Facturado / Aprobado' || nuevoValor === 'Facturado') {
            // Guardamos el documento temporalmente y abrimos el Modal Custom
            tempDocParaFactura = { id: id, nuevoValor: nuevoValor };
            document.getElementById('input-modal-factura').value = ""; // Limpiamos el input
            
            const modal = document.getElementById('modalFactura');
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('mostrar'), 10);
            
            return; // CORTAMOS ACÁ: No guardamos nada hasta que llene el input.
        } else {
            doc.estado = nuevoValor; // Si es otro estado (Enviado, Pendiente), pasa directo
        }
    }
    
    if (tipoCambiado === 'pagado') doc.pagado = nuevoValor;
    
    ejecutarGuardadoDeEstado(doc);
}

// Función que se ejecuta si tocás "Guardar" en el cartel de la Factura
function confirmarModalFactura() {
    let inputFact = document.getElementById('input-modal-factura').value.trim();
    let tipoFact = document.getElementById('tipo-modal-factura').value; // 🔥 Capturamos si es A, B o NC
    
    if (!inputFact) {
        mostrarMensaje('⚠️ Debes ingresar el Nº de Factura.', 'error');
        return;
    }

    // Nos quedamos solo con los últimos 4 dígitos
    inputFact = inputFact.slice(-4);
    
    // 🔥 MAGIA: Armamos el código idéntico al de ARCA (Ej: "B-1234" o "NC A-1234") 🔥
    let facturaFinal = `${tipoFact}-${inputFact}`;

    const doc = documentosGuardados.find(i => i.id === tempDocParaFactura.id);
    if (!doc) return;
    
    doc.estado = tempDocParaFactura.nuevoValor;
    doc.numFactura = facturaFinal; // Guardamos con el nuevo formato seguro
    
    const modal = document.getElementById('modalFactura');
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; tempDocParaFactura = null; }, 300);
    
    ejecutarGuardadoDeEstado(doc);
}

// Función que se ejecuta si tocás "Cancelar"
function cerrarModalFactura() {
    const modal = document.getElementById('modalFactura');
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; tempDocParaFactura = null; }, 300);
    
    // MAGIA: Como canceló, repintamos la pantalla para que el selector vuelva a su estado anterior ("Pendiente" o el que haya tenido) y no quede como "Facturado" por error.
    renderizarTarjetas();
}

async function ejecutarGuardadoDeEstado(doc) {
    mostrarMensaje('Actualizando base de datos...', 'cargando');
    try {
        await llamarAPI({ accion: "guardarDocumentoBD", payload: { hoja: HOJA_PRESUPUESTOS, datos: doc } });
        mostrarMensaje('✅ Actualizado.', 'exito');
        renderizarTarjetas(); // Repintamos para mostrar los cambios y la nueva etiqueta
    } catch (e) { mostrarMensaje('❌ Error.', 'error'); }
}

function editarDocumento(id) {
    const doc = documentosGuardados.find(i => i.id === id);
    if (!doc) return;

    idEditando = doc.id;
    document.getElementById('input-gym').value = doc.cliente;
    
    // 🔥 CARGAR CUIT SI EXISTE 🔥
    if (document.getElementById('input-cuit')) {
        document.getElementById('input-cuit').value = doc.cuit || "";
    }
    
    if (modoApp === 'ofertas') {
        document.getElementById('informe-frecuencia').value = doc.atributoExtra;
    } else {
        document.getElementById('input-fecha-presup').value = doc.fecha;
    }
    
    document.getElementById('lista-maquinas-dom').innerHTML = '';
    doc.items.forEach(m => agregarItem(m.tipo, m.desc, m.cant, m.precio, m.metros, m.terminales));
    // RESTAURAMOS EL TOTAL ORIGINAL POR SI HABÍA SIDO MODIFICADO A MANO
    document.getElementById('input-total-manual').value = doc.total;
    switchTab('crear');
    document.getElementById('titulo-form').innerText = modoApp === 'ofertas' ? "✏️ Modificando Oferta" : "✏️ Modificando Presupuesto";
}

// Abre el modal personalizado en lugar del confirm() del navegador
function eliminarDocumento(id) {
    idAEliminar = id;
    const modal = document.getElementById('modalConfirmacion');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('mostrar'), 10);

    // Configuramos el botón de confirmación para que ejecute la acción
    document.getElementById('btn-confirmar-borrado').onclick = ejecutarEliminacionReal;
}

function cerrarModalConfirmacion() {
    const modal = document.getElementById('modalConfirmacion');
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; idAEliminar = null; }, 300);
}

// Esta es la función que realmente borra los datos en la nube
async function ejecutarEliminacionReal() {
    if (!idAEliminar) return;
    
    const idLocal = idAEliminar;
    cerrarModalConfirmacion();
    
    mostrarMensaje('Eliminando de la nube... 🗑️', 'cargando');
    const hojaReq = modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS;
    
    try {
        await llamarAPI({ accion: "eliminarDocumentoBD", payload: { hoja: hojaReq, id: idLocal } });
        // Recargamos la lista
        documentosGuardados = documentosGuardados.filter(doc => doc.id !== idLocal);
        renderizarTarjetas();
        mostrarMensaje('✅ Documento eliminado con éxito.', 'exito');
    } catch (e) {
        mostrarMensaje('❌ Error al eliminar. Intente de nuevo.', 'error');
    }
}

function mostrarMensaje(texto, tipo) {
    const status = document.getElementById('status-informe');
    status.style.display = 'block';
    status.innerText = texto;
    if (tipo === 'exito') {
        status.style.background = '#e6f4ea'; status.style.color = '#0b7a42'; status.style.border = '1px solid #a8d5b5';
    } else if (tipo === 'cargando') {
        status.style.background = '#e8f0fe'; status.style.color = '#1a73e8'; status.style.border = '1px solid #aecbfa';
    } else {
        status.style.background = '#fce8e6'; status.style.color = '#d93025'; status.style.border = '1px solid #f28b82';
    }
    if(tipo !== 'cargando') setTimeout(() => { status.style.display = 'none'; }, 3000);
}
// 1. Abre la ventana emergente al tocar el botón violeta
function ejecutarSincronizacionARCA() {
    const modal = document.getElementById('modalArca');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('mostrar'), 10);
}

// 2. Cierra la ventana si te arrepentís
function cerrarModalArca() {
    const modal = document.getElementById('modalArca');
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

// 3. Ejecuta la magia si tocás "Sincronizar" en la ventanita
async function confirmarSincronizacionARCA() {
    cerrarModalArca();
    mostrarMensaje('Analizando base de datos de AFIP... ⏳', 'cargando');
    
    // Apagamos el botón violeta para evitar dobles clics
    const btnArca = document.querySelector('#arca-container .btn-submit');
    if (btnArca) {
        btnArca.disabled = true;
        btnArca.style.opacity = '0.5';
    }
    
    try {
        const respuesta = await llamarAPI({ accion: "sincronizarConBaseARCA" });
        mostrarMensaje('🚀 ' + respuesta, 'exito');
        obtenerYRenderizarCreados(); 
    } catch (e) {
        mostrarMensaje('❌ Error: ' + e.message, 'error');
    } finally {
        // Prendemos el botón nuevamente cuando termina
        if (btnArca) {
            btnArca.disabled = false;
            btnArca.style.opacity = '1';
        }
    }
}

function setSectorAbono(sec) { sectorAbonoActual = sec; renderizarAbonos(); }

async function cargarAbonos() {
    listaAbonosBase = await llamarAPI({ accion: "obtenerAbonosBD" });
    renderizarAbonos();
}


// =========================================================================
// 🔥 EL CEREBRO VISUAL: LECTURA DE COLORES A PRUEBA DE FALLOS 🔥
// =========================================================================
function esMesBloqueado(colorHex) {
    if (!colorHex) return false;
    let c = String(colorHex).toLowerCase().trim();
    if (c === 'null' || c === 'undefined') return false;
 
    // Lista explícita de valores conocidos (por si el parser falla)
    const negrosExactos = ['#000000', '#111111', '#434343', '#000', '#0d0d0d', '#1a1a1a', '#1c1c1c'];
    if (negrosExactos.includes(c)) return true;
 
    // Método robusto por luminosidad: parsear las componentes RGB
    if (c.startsWith('#')) {
        let hex = c.slice(1);
        // Normalizar formato corto (#000 → #000000)
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0,2), 16);
            const g = parseInt(hex.slice(2,4), 16);
            const b = parseInt(hex.slice(4,6), 16);
            // Si todos los canales son muy oscuros → es negro
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                if (r < 80 && g < 80 && b < 80) return true;
            }
        }
    }
 
    return false;
}

function esMesEnviado(colorHex) {
    if (!colorHex) return false;
    let c = String(colorHex).toLowerCase();
    if (c !== '#ffffff' && !c.includes('fff') && !esMesBloqueado(c)) return true;
    return false;
}

function debeFacturarEsteMes(abono, mesNum) {
    if (!abono.coloresMeses || abono.coloresMeses.length < mesNum) return true; 
    return !esMesBloqueado(abono.coloresMeses[mesNum - 1]);
}

// 🔥 EL ESCÁNER INVENCIBLE: Rellena los meses que Google corta y encuentra el patrón 🔥
function detectarFrecuencia(coloresMeses) {
    let colores = coloresMeses || [];
    
    // Si Google Sheets mandó menos de 12 meses, rellenamos los futuros con blanco
    while (colores.length < 12) {
        colores.push("#ffffff");
    }
    
    let primerActivo = -1;
    // 1. Buscamos el primer mes que NO sea negro
    for (let i = 0; i < 12; i++) {
        if (!esMesBloqueado(colores[i])) {
            primerActivo = i;
            break;
        }
    }
    
    if (primerActivo === -1) return "Mensual"; // Si está todo negro

    // 2. Contamos cuántos negros seguidos hay DESPUÉS del primer habilitado
    let negrosSeguidos = 0;
    for (let i = primerActivo + 1; i < 12; i++) {
        if (esMesBloqueado(colores[i])) {
            negrosSeguidos++;
        } else {
            break; // Corta apenas encuentra el siguiente blanco o verde
        }
    }

    if (negrosSeguidos === 1) return "Bimestral";
    if (negrosSeguidos >= 2) return "Trimestral";
    return "Mensual";
}

// =========================================================================
// 🔥 PREVISUALIZAR MAILS EN LA TARJETA 🔥
// =========================================================================
function mostrarCajaMails(orden, correosRaw) {
    let lista = String(correosRaw).split(/[\/\-;]/).map(m => m.trim()).filter(m => m !== "");
    let formateados = lista.join(", ");

    const idMesParaEnviar = document.getElementById('selector-mes-abono').value.split('-').reverse().join('/');
    const caja = document.getElementById(`caja-mail-${orden}`);
    
    caja.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
            <textarea id="txt-mail-${orden}" style="width:100%; font-size:12px; padding:8px; border:2px solid #fbbc04; border-radius:6px; outline:none; font-family:monospace; resize:none;" rows="2">${formateados}</textarea>
            <button onclick="copiarAlPortapapeles(document.getElementById('txt-mail-${orden}').value, 'Mails copiados al portapapeles')" style="background:#fbbc04; color:#333; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer;">
                📋 Copiar Mails
            </button>
        </div>
        <button onclick="marcarComoEnviado(${orden}, '${idMesParaEnviar}')" style="background:#0f9d58; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; min-width:80px;">
            ✅ Listo
        </button>
    `;
}
// =================================================================================
// ✅ PATCH A: AGREGAR estas funciones nuevas en app.js
//    (Podés ponerlas justo antes de renderizarAbonos)
// =================================================================================
 
// 🔥 NUEVO: Devuelve el precio correcto para un mes/año dado,
//    buscando en el historial de aumentos. Si no hay historial, usa el precio base.
function getPrecioParaMes(abono, mesNum, anioNum) {
    if (!abono.preciosHistorial || abono.preciosHistorial.length === 0) {
        return Number(abono.precio); // Sin historial → precio base
    }
 
    const fechaConsulta = anioNum * 12 + mesNum;
    let precioAplicable = Number(abono.precio); // Fallback al precio base
    let mejorFecha = -1;
 
    abono.preciosHistorial.forEach(entry => {
        const [em, ey] = entry.desde.split('/').map(Number);
        const fechaEntry = ey * 12 + em;
 
        // Tomamos el precio más reciente que sea <= al mes consultado
        if (fechaEntry <= fechaConsulta && fechaEntry > mejorFecha) {
            mejorFecha = fechaEntry;
            precioAplicable = Number(entry.precio);
        }
    });
 
    return precioAplicable;
}
 
// 🔥 NUEVO: Abre un mini-modal para registrar un aumento de precio desde un mes
function abrirModalAumento(orden) {
    const abono = listaAbonosBase.find(a => a.orden === orden);
    if (!abono) return;
 
    const mesSelector = document.getElementById('selector-mes-abono').value;
    const [y, m] = mesSelector ? mesSelector.split('-') : ['2025', '01'];
 
    let modal = document.getElementById('modal-aumento-precio');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-aumento-precio';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        document.body.appendChild(modal);
    }
 
    // Construimos la tabla del historial de precios
    const historialOrdenado = (abono.preciosHistorial || []).slice().sort((a, b) => {
        const [am, ay] = a.desde.split('/').map(Number);
        const [bm, by] = b.desde.split('/').map(Number);
        return (ay * 12 + am) - (by * 12 + bm);
    });
 
    let tablaHistorial = '';
    if (historialOrdenado.length > 0) {
        tablaHistorial = `
            <div style="margin-top:12px;">
                <b style="font-size:12px; color:#5f6368;">📋 Historial de aumentos registrados:</b>
                <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:12px;">
                    <thead>
                        <tr style="background:#f1f3f4;">
                            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #ddd; color:#1a73e8;">Desde</th>
                            <th style="padding:6px 8px; text-align:right; border-bottom:2px solid #ddd; color:#1a73e8;">Precio</th>
                            <th style="padding:6px 8px; text-align:center; border-bottom:2px solid #ddd;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historialOrdenado.map((e, idx) => `
                            <tr style="border-bottom:1px solid #eee; ${idx === historialOrdenado.length-1 ? 'background:#e6f4ea;' : ''}">
                                <td style="padding:6px 8px; font-weight:bold; color:#333;">${e.desde}</td>
                                <td style="padding:6px 8px; text-align:right; font-weight:bold; color:#1a73e8;">$${Number(e.precio).toLocaleString('es-AR')}</td>
                                <td style="padding:6px 8px; text-align:center;">
                                    <button onclick="eliminarPrecioHistorico(${orden}, '${e.desde}')" 
                                            style="background:#fce8e6; color:#d93025; border:1px solid #d93025; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer; font-weight:bold;">
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="font-size:10px; color:#999; margin:4px 0 0; text-align:right;">La última entrada (verde) es el precio actual vigente.</p>
            </div>`;
    } else {
        tablaHistorial = `
            <div style="background:#fff3e0; border-radius:6px; padding:8px; margin-top:10px; font-size:12px; color:#e65100;">
                ⚠️ Sin aumentos registrados. Se usa el precio base del Excel: 
                <b>$${Number(abono.precio).toLocaleString('es-AR')}</b>
            </div>`;
    }
 
    // Sugerimos el precio base como valor inicial del input
    const ultimoPrecio = historialOrdenado.length > 0
        ? historialOrdenado[historialOrdenado.length - 1].precio
        : Number(abono.precio);
 
    modal.innerHTML = `
        <div style="background:white; padding:20px; border-radius:12px; width:100%; max-width:420px; box-shadow:0 8px 30px rgba(0,0,0,0.25); max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <h3 style="margin:0; color:#1a73e8; font-size:16px;">💰 Historial de Precios</h3>
                <span onclick="cerrarModalAumento()" style="cursor:pointer; color:#d93025; font-size:22px; font-weight:bold; line-height:1;">✖</span>
            </div>
            <p style="margin:0 0 12px; font-size:13px; color:#5f6368; border-bottom:1px solid #eee; padding-bottom:8px;">
                <b style="color:#333;">${abono.gym}</b>
            </p>
 
            ${tablaHistorial}
 
            <div style="border-top:2px solid #1a73e8; margin-top:14px; padding-top:12px;">
                <b style="font-size:13px; color:#1a73e8;">➕ Agregar nuevo precio</b>
                <p style="font-size:11px; color:#999; margin:2px 0 10px;">
                    El precio que pongas aplica desde ese mes en adelante. Los meses anteriores conservan su precio original.
                </p>
                
                <label style="font-size:12px; font-weight:bold; color:#5f6368;">Mes de inicio (MM/YYYY):</label>
                <input type="text" id="inp-aumento-desde" placeholder="07/2025" value="${m}/${y}"
                       maxlength="7"
                       oninput="this.value=this.value.replace(/[^0-9\/]/g,''); if(this.value.length===2&&!this.value.includes('/'))this.value+='/'"
                       style="width:100%; padding:10px; border:1.5px solid #1a73e8; border-radius:8px; font-size:15px; font-weight:bold; text-align:center; margin:4px 0 10px; box-sizing:border-box;">
 
                <label style="font-size:12px; font-weight:bold; color:#5f6368;">Precio base (sin IVA, en ARS):</label>
                <input type="number" id="inp-aumento-precio" placeholder="169400" value="${ultimoPrecio}"
                       style="width:100%; padding:10px; border:1.5px solid #1a73e8; border-radius:8px; font-size:15px; font-weight:bold; text-align:center; margin:4px 0 12px; box-sizing:border-box;">
            </div>
 
            <button onclick="guardarAumentoPrecio(${orden})"
                    style="width:100%; background:#1a73e8; color:white; border:none; padding:12px; border-radius:8px; font-weight:bold; font-size:14px; cursor:pointer;">
                💾 Guardar Nuevo Precio
            </button>
        </div>
    `;
    modal.style.display = 'flex';
}
 
// AGREGAR esta nueva función para eliminar una entrada del historial:
async function eliminarPrecioHistorico(orden, desde) {
    const abono = listaAbonosBase.find(a => a.orden === orden);
    if (!abono) return;
 
    if (!confirm(`¿Eliminar el precio registrado desde ${desde}?`)) return;
 
    abono.preciosHistorial = (abono.preciosHistorial || []).filter(e => e.desde !== desde);
 
    mostrarMensaje('Eliminando precio... ⏳', 'cargando');
    try {
        await llamarAPI({
            accion: "eliminarPrecioDesde",
            payload: { orden, desde }
        });
        mostrarMensaje(`✅ Precio desde ${desde} eliminado.`, 'exito');
        // Reabrimos el modal con el historial actualizado
        abrirModalAumento(orden);
        renderizarAbonos();
    } catch(e) {
        mostrarMensaje('❌ Error al eliminar: ' + e.message, 'error');
    }
}
 
function cerrarModalAumento() {
    const modal = document.getElementById('modal-aumento-precio');
    if (modal) modal.style.display = 'none';
}
 
async function guardarAumentoPrecio(orden) {
    const desde = document.getElementById('inp-aumento-desde').value.trim();
    const precio = parseFloat(document.getElementById('inp-aumento-precio').value);
 
    // Validar formato MM/YYYY
    if (!/^\d{2}\/\d{4}$/.test(desde)) {
        alert('El mes debe tener el formato MM/YYYY, por ejemplo: 07/2025');
        return;
    }
    if (!precio || isNaN(precio) || precio <= 0) {
        alert('Ingresá un precio válido mayor a 0.');
        return;
    }
 
    cerrarModalAumento();
    mostrarMensaje('Guardando aumento... ⏳', 'cargando');
 
    try {
        await llamarAPI({ accion: "actualizarPrecioDesde", payload: { orden, desde, precio } });
        
        // Actualizamos el abono en memoria sin recargar todo
        const abono = listaAbonosBase.find(a => a.orden === orden);
        if (abono) {
            if (!abono.preciosHistorial) abono.preciosHistorial = [];
            abono.preciosHistorial = abono.preciosHistorial.filter(e => e.desde !== desde);
            abono.preciosHistorial.push({ desde, precio });
            abono.preciosHistorial.sort((a, b) => {
                const [am, ay] = a.desde.split('/').map(Number);
                const [bm, by] = b.desde.split('/').map(Number);
                return (ay * 12 + am) - (by * 12 + bm);
            });
        }
        
        mostrarMensaje(`✅ Aumento registrado desde ${desde}: $${precio.toLocaleString('es-AR')}`, 'exito');
        renderizarAbonos();
    } catch(e) {
        mostrarMensaje('❌ Error al guardar: ' + e.message, 'error');
    }
}
// =========================================================================
// 🔥 TARJETAS INTELIGENTES (CON BOTÓN DE AUMENTO OCULTO POR DEFECTO) 🔥
// =========================================================================

function renderizarAbonos() {
    const contenedor = document.getElementById('contenedor-abonos-lista');
    const mesSeleccionado = document.getElementById('selector-mes-abono').value;
    if (!mesSeleccionado) { contenedor.innerHTML = "<p style='text-align:center;'>Seleccione un mes arriba.</p>"; return; }
 
    const [y, m] = mesSeleccionado.split("-");
    const anioNum = parseInt(y), mesNum = parseInt(m);
    const idMes = `${m}/${y}`;
    const anioActual = new Date().getFullYear();
 
    const tabs = { facturar: '#fce8e6', enviar: '#e8f0fe', completado: '#e6f4ea' };
    const text = { facturar: '#d93025', enviar: '#1a73e8', completado: '#0f9d58' };
    ['facturar', 'enviar', 'completado'].forEach(s => {
        const btn = document.getElementById(`tab-sec-${s}`);
        if(btn) {
            btn.classList.toggle('activo-sector', sectorAbonoActual === s);
        }
    });
 
    const abonosDelMes = listaAbonosBase.filter(a => debeFacturarEsteMes(a, mesNum));
 
    const filtrados = abonosDelMes.filter(a => {
        let fNro = String(a.facturasMeses[mesNum - 1] || "").trim();
        let bg = String(a.coloresMeses[mesNum - 1] || "#ffffff").toLowerCase();
 
        let tieneFactura = fNro !== "";
        let estaEnviado = esMesEnviado(bg);
 
        if (sectorAbonoActual === 'facturar') return !tieneFactura && !estaEnviado;
        if (sectorAbonoActual === 'enviar') return tieneFactura && !estaEnviado;
        if (sectorAbonoActual === 'completado') return estaEnviado;
    });

    let cartelAnio = "";
    if (anioNum !== anioActual) {
        cartelAnio = `<div style="background:#fff3e0; color:#e65100; padding:12px; border-radius:8px; margin-bottom:15px; text-align:center; font-weight:bold; font-size:13px; border:1px solid #ffcc80;">⚠️ Estás viendo el año ${anioNum}, pero el Excel siempre refleja el ciclo del año en curso.<br>Para empezar un año nuevo, recordá borrar las facturas cargadas en la planilla de Excel.</div>`;
    }
 
    contenedor.innerHTML = cartelAnio + (filtrados.length === 0
        ? `<p style='text-align:center; padding:20px; color:#999;'>No hay nada en este sector. ¡Buen trabajo! ✨</p>`
        : "");
 
    filtrados.sort((a,b) => a.orden - b.orden).forEach(a => {
        let fNro = String(a.facturasMeses[mesNum - 1] || "").trim();
        let frecDetectada = detectarFrecuencia(a.coloresMeses);
 
        const nombresMesesArr = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                                  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let mIdx = parseInt(m) - 1;
        let periodoStr = nombresMesesArr[mIdx];
 
        if (frecDetectada === "Bimestral") {
            periodoStr += " - " + nombresMesesArr[(mIdx + 1) % 12];
        } else if (frecDetectada === "Trimestral") {
            periodoStr += " - " + nombresMesesArr[(mIdx + 1) % 12] + " - " + nombresMesesArr[(mIdx + 2) % 12];
        }
 
        const textoMantenimiento = `Mantenimiento preventivo del gimnasio correspondiente al periodo ${periodoStr} ${y}.`;
        const cuitSinGuiones = String(a.cuit).replace(/-/g, "");
        
        // 🔥 Limpiamos y formateamos los correos automáticamente 🔥
        let listaMails = String(a.correo).split(/[\/\-;]/).map(m => m.trim()).filter(m => m !== "");
        let correosFormateados = listaMails.join(", ");
 
        let colorBadge = frecDetectada === "Mensual" ? "#1a73e8" : (frecDetectada === "Bimestral" ? "#e65100" : "#673ab7");
        let bgBadge = frecDetectada === "Mensual" ? "#e8f0fe" : (frecDetectada === "Bimestral" ? "#fff3e0" : "#f3e8fd");
        let badgeFrecuencia = `<span style="background:${bgBadge}; color:${colorBadge}; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:bold; margin-left:8px; border:1px solid ${colorBadge}; vertical-align:middle;">${frecDetectada}</span>`;
 
        let pBase = getPrecioParaMes(a, mesNum, anioNum);
        let precioBaseActual = Number(a.precio);
        let tienePrecioHistorico = pBase !== precioBaseActual;
        let badgePrecioHistorico = tienePrecioHistorico
            ? `<span style="font-size:10px; color:#e65100; background:#fff3e0; padding:2px 6px; border-radius:10px; border:1px solid #e65100; margin-left:6px;">📅 precio de ${idMes}</span>`
            : '';
 
        let alertasTopHTML = "";
        let alertasEnvioHTML = "";
        let botonIpcEnvio = "";

        const mesActualNombre = nombresMesesArr[mesNum - 1];
        const mesSiguienteNombre = nombresMesesArr[mesNum % 12];
    
        if (esMonthDeAumento(a.mesIncrem, mesActualNombre)) {
            const textoAumentoIPC = `Estimados, les informamos que el próximo mes de ${mesSiguienteNombre} se realizará la actualización semestral del abono de mantenimiento, ajustado según el IPC de Argentina de los últimos 6 meses.`;
    
            alertasTopHTML += `<div style="background:#fce8e6; color:#d93025; padding:5px; border-radius:4px; font-size:11px; font-weight:bold; margin-bottom:5px; text-align:right;">📈 ENVIAR CARTA IPC</div>`;
            botonIpcEnvio = `
                <button onclick="copiarAlPortapapeles('${textoAumentoIPC}', 'Aviso de Aumento copiado')" style="background:#fce8e6; color:#d93025; border:1px solid #d93025; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; margin-bottom:10px; display:flex; justify-content:center; align-items:center; gap:8px;">
                    📈 Copiar Texto de Aumento (IPC)
                </button>`;
        }
 
        if (a.pideRemito) {
            alertasTopHTML += `<div style="background:#fff3e0; color:#e65100; padding:5px; border-radius:4px; font-size:11px; font-weight:bold; margin-bottom:5px; text-align:right;">⚠️ VERIFICAR REMITO</div>`;
            alertasEnvioHTML += `<div style="color:#e65100; font-size:12px; font-weight:bold; margin-bottom:5px;">⚠️ Recordá adjuntar el Remito al correo.</div>`;
        }
        if (a.pideOC) {
            alertasTopHTML += `<div style="background:#e8f0fe; color:#1a73e8; padding:5px; border-radius:4px; font-size:11px; font-weight:bold; margin-bottom:5px; text-align:right;">📄 REQUERIR OC</div>`;
            alertasEnvioHTML += `<div style="color:#1a73e8; font-size:12px; font-weight:bold; margin-bottom:8px;">📄 Recordá solicitar la Orden de Compra.</div>`;
        }
 
        let htmlPrecio = "";
        if (String(a.tipoFact).trim().toUpperCase() === "A") {
            let pIva = pBase * 0.21;
            let pFinal = pBase + pIva;
            htmlPrecio = `
                <div style="background:#f8f9fa; padding:10px; border-radius:8px; border:1px dashed #ccc; margin-top:8px; display:inline-block; min-width: 200px;">
                    <div style="font-size:13px; color:#5f6368; display:flex; justify-content:space-between;">Base (ARCA): <b>$${pBase.toLocaleString('es-AR', {minimumFractionDigits:2})}</b></div>
                    <div style="font-size:12px; color:#d93025; display:flex; justify-content:space-between; margin-top:2px;">IVA (21%): <span>$${pIva.toLocaleString('es-AR', {minimumFractionDigits:2})}</span></div>
                    <div style="border-top:1px solid #ddd; margin:5px 0;"></div>
                    <div style="font-size:16px; color:#1a73e8; display:flex; justify-content:space-between; align-items:center;">Total Final: <b>$${pFinal.toLocaleString('es-AR', {minimumFractionDigits:2})} (A)</b></div>
                </div>
            `;
        } else {
            htmlPrecio = `<b style="font-size: 18px; color: #1a73e8;">$${pBase.toLocaleString('es-AR')}</b> (${a.tipoFact}) ${badgePrecioHistorico}`;
        }
 
        let mostrarBtnAumento = esMonthDeAumento(a.mesIncrem, mesActualNombre) || esMesPostAumento(a.mesIncrem, mesActualNombre);
        
        const btnHistorialPrecios = mostrarBtnAumento ? `
            <button onclick="abrirModalAumento(${a.orden})" 
                    style="margin-top:8px; background:#fff3e0; color:#e65100; border:1px solid #e65100; border-radius:6px; font-size:11px; padding:4px 8px; font-weight:bold; cursor:pointer;">
                💰 Gestionar Aumentos
            </button>` : '';
 
        const div = document.createElement('div');
        div.className = "abono-card";
        const accentColor = sectorAbonoActual === 'facturar' ? '#d93025' : sectorAbonoActual === 'enviar' ? '#1a73e8' : '#0f9d58';
        div.style.borderLeft = `4px solid ${accentColor}`;

        div.innerHTML = `
            <div class="abono-card-header">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:10px; color:#9aa0a6; font-weight:700; text-transform:uppercase; letter-spacing:0.4px;">ORDEN #${a.orden}</div>
                        <div class="abono-gym-name">${a.gym} ${badgeFrecuencia}</div>
                        <span class="abono-cuit-badge" onclick="copiarAlPortapapeles('${cuitSinGuiones}', 'CUIT copiado: ${cuitSinGuiones}')" title="Tocar para copiar">
                            📋 ${a.cuit}
                        </span>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">${alertasTopHTML}</div>
                </div>
                <div style="margin-top:8px;">
                    ${htmlPrecio}
                </div>
                ${sectorAbonoActual !== 'completado' ? btnHistorialPrecios : ''}
                ${sectorAbonoActual === 'facturar' ? `
                    <button onclick="copiarAlPortapapeles('${textoMantenimiento}', 'Detalle de Factura copiado')"
                            class="btn-mini" style="margin-top:10px; background:#f4f6f9; color:#475467; border:1px solid #e0e0e0;">
                        📋 Copiar Detalle Factura
                    </button>` : ''}
            </div>

            <div class="abono-body">
                ${sectorAbonoActual === 'facturar' ? `
                    <div style="margin-top:4px;">
                        <input type="text" placeholder="Nº Factura (Enter para guardar)" id="inp-fact-${a.orden}"
                               class="inp-factura"
                               onkeypress="if(event.key==='Enter') guardarFacturaAbono(${a.orden}, '${idMes}')">
                        <button class="btn-facturar" onclick="guardarFacturaAbono(${a.orden}, '${idMes}')" style="width:100%; margin-top:8px;">
                            💾 Facturar
                        </button>
                    </div>
                ` : sectorAbonoActual === 'enviar' ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="color:#1a73e8; font-weight:800; font-size:14px;">📄 Factura N°: ${fNro}</span>
                        <button onclick="revertirAFacturar(${a.orden}, '${idMes}')"
                                class="btn-mini" style="background:#fce8e6; color:#d93025;">✏️ Editar N°</button>
                    </div>
                    ${alertasEnvioHTML}
                    ${botonIpcEnvio}
                    <label style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#5f6368; margin-bottom:4px; display:block;">📧 Correos del cliente</label>
                    <textarea id="txt-mail-${a.orden}"
                              style="width:100%; font-size:12px; padding:10px; border:2px solid #fbbc04; border-radius:10px; outline:none; font-family:monospace; resize:vertical; min-height:44px; box-sizing:border-box;"
                              rows="2">${correosFormateados}</textarea>
                    <div class="abono-actions" style="margin-top:10px;">
                        <button class="btn-copiar" onclick="copiarAlPortapapeles(document.getElementById('txt-mail-${a.orden}').value, 'Mails copiados')">📋 Copiar Mails</button>
                        <button class="btn-enviar" onclick="marcarComoEnviado(${a.orden}, '${idMes}')">✅ Marcar Enviado</button>
                    </div>
                ` : `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#0f9d58; font-weight:800; font-size:14px;">✅ Factura ${fNro} enviada.</span>
                        <div style="display:flex; gap:6px;">
                            <button onclick="revertirAEnviar(${a.orden}, '${idMes}')"   class="btn-mini" style="background:#fce8e6; color:#d93025;">❌ Anular</button>
                            <button onclick="revertirAFacturar(${a.orden}, '${idMes}')" class="btn-mini" style="background:#f4f6f9; color:#5f6368; border:1px solid #e0e0e0;">🗑️ Borrar N°</button>
                        </div>
                    </div>
                `}
            </div>
        `;
        contenedor.appendChild(div);
    });
}

function esMonthDeAumento(mesIncrem, mesActualNombre) {
    const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesIncrStr = String(mesIncrem).trim().toLowerCase();
    const mesActStr = String(mesActualNombre).trim().toLowerCase();
 
    const idxIncrem = MESES.findIndex(m => m.toLowerCase() === mesIncrStr);
    const idxActual = MESES.findIndex(m => m.toLowerCase() === mesActStr);
 
    if (idxIncrem === -1 || idxActual === -1) return false;
 
    // Dispara en el mes del aumento Y exactamente 6 meses después
    return idxActual === idxIncrem || idxActual === (idxIncrem + 6) % 12;
}

// 🔥 NUEVA FUNCIÓN: Identifica el mes siguiente al aviso (Cuando entra en vigencia el aumento) 🔥
function esMesPostAumento(mesIncrem, mesActualNombre) {
    const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesIncrStr = String(mesIncrem).trim().toLowerCase();
    const mesActStr = String(mesActualNombre).trim().toLowerCase();
 
    const idxIncrem = MESES.findIndex(m => m.toLowerCase() === mesIncrStr);
    const idxActual = MESES.findIndex(m => m.toLowerCase() === mesActStr);
 
    if (idxIncrem === -1 || idxActual === -1) return false;
 
    // Da "true" en el mes inmediatamente posterior al aviso (Ej: Aviso en Mayo -> True en Junio)
    return idxActual === (idxIncrem + 1) % 12 || idxActual === (idxIncrem + 7) % 12;
}
function copiarAlPortapapeles(texto, msgExito) {
    navigator.clipboard.writeText(texto);
    mostrarMensaje(msgExito, 'exito');
}

function guardarFacturaAbono(orden, idMes) {
    let mesIdx = parseInt(idMes.split("/")[0], 10) - 1;
    const nro = document.getElementById(`inp-fact-${orden}`).value.trim();
    if (!nro) return;
    
    const abono = listaAbonosBase.find(a => a.orden === orden);
    abono.facturasMeses[mesIdx] = nro;
    abono.coloresMeses[mesIdx] = "#ffffff"; 
    renderizarAbonos(); 
    
    llamarAPI({ accion: "actualizarFacturaAbono", payload: { orden, mesAnio: idMes, datosMes: { factura: nro, enviado: false } } })
    .catch(() => mostrarMensaje('❌ Error de red al guardar', 'error'));
}

function marcarComoEnviado(orden, idMes) {
    let mesIdx = parseInt(idMes.split("/")[0], 10) - 1;
    const abono = listaAbonosBase.find(a => a.orden === orden);
    abono.coloresMeses[mesIdx] = "#93c47d"; 
    renderizarAbonos(); 
    
    llamarAPI({ accion: "actualizarFacturaAbono", payload: { orden, mesAnio: idMes, datosMes: { enviado: true } } })
    .catch(() => mostrarMensaje('❌ Error de red', 'error'));
}

function revertirAFacturar(orden, idMes) {
    let mesIdx = parseInt(idMes.split("/")[0], 10) - 1;
    const abono = listaAbonosBase.find(a => a.orden === orden);
    abono.facturasMeses[mesIdx] = "";
    abono.coloresMeses[mesIdx] = "#ffffff"; 
    renderizarAbonos();
    
    llamarAPI({ accion: "actualizarFacturaAbono", payload: { orden, mesAnio: idMes, datosMes: { factura: "", enviado: false } } });
}

function revertirAEnviar(orden, idMes) {
    let mesIdx = parseInt(idMes.split("/")[0], 10) - 1;
    const abono = listaAbonosBase.find(a => a.orden === orden);
    abono.coloresMeses[mesIdx] = "#ffffff"; 
    renderizarAbonos();
    
    llamarAPI({ accion: "actualizarFacturaAbono", payload: { orden, mesAnio: idMes, datosMes: { enviado: false } } });
}
// =========================================================================
// 🔥 MODO OSCURO (DARK MODE) 🔥
// =========================================================================
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'yes' : 'no');
    document.getElementById('btn-dark-mode').innerText = isDark ? '☀️' : '🌙';
}