// --- CONFIGURACIÓN DE LA API DE GOOGLE ---
const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec"; 
const VERSION_APP = 1.0;

// --- VARIABLES Y FUNCIONES RECUPERADAS ---
let valorDolarOficial = 1000;
let fechaSeleccionadaOriginal = "";
let globalGymsOfertas = [];
let globalGymsPresupuestos = [];

async function obtenerDolar() {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if (data.venta) {
            valorDolarOficial = data.venta;
            const domDolar = document.getElementById('valor-dolar');
            if(domDolar) domDolar.innerText = `Dólar Oficial: $${valorDolarOficial}`;
        }
    } catch (e) { 
        console.warn("Error al cargar dólar, usando valor por defecto."); 
    }
}

// Cache global del cronograma cargado desde Sheet
let cronogramaZonasDinamico = null;

async function cargarDatosBase() {
    try {
        // Cargar historial + Cronograma + Abonos en paralelo (Abonos para check de remito)
        const [datosViejos, resultadoAnual, datosAbonos] = await Promise.all([
            llamarAPI({ accion: "obtenerRegistroHistorico" }),
            llamarAPI({ accion: "obtenerCronogramaDesdeSheet" }).catch(() => ({ zonas: [], historial: [] })),
            llamarAPI({ accion: "obtenerAbonosBD" }).catch(() => [])
        ]);
        window.listaAbonosGlobal = datosAbonos || [];

        // Combinar historial principal con el del Historial Anual
        let combined = [...(datosViejos || [])];
        const datosNuevos = resultadoAnual.historial || [];
        datosNuevos.forEach(n => {
            let exists = combined.some(v => v.gym === n.gym && v.año === n.año && v.mes === n.mes && v.dia === n.dia);
            if (!exists) combined.push(n);
        });
        historialGlobal = combined;

        // Guardar el cronograma dinámico si se cargó correctamente
        if (resultadoAnual.zonas && resultadoAnual.zonas.length > 0) {
            cronogramaZonasDinamico = resultadoAnual.zonas;
            console.log(`✅ Cronograma cargado desde Sheet: ${cronogramaZonasDinamico.length} zonas`);
        } else {
            // Fallback: usar el cronograma hardcodeado
            cronogramaZonasDinamico = null;
        }
    } catch (e) { 
        console.error("Modo offline o error en historial"); 
    }
}

// --- FUNCIÓN PUENTE (REEMPLAZA A google.script.run) ---
async function llamarAPI(accionObj, timeoutMs = 15000) {
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
        const result = await response.json();
        if (result.status === "success") return result.data;
        throw new Error(result.message || "Error del servidor");
    } catch (error) {
        clearTimeout(timer);
        actualizarDotConexion(true);
        if (error.name === 'AbortError') {
            throw new Error("La solicitud tardó demasiado (15s). Verificá tu conexión.");
        }
        throw error;
    }
}

// --- INDICADOR ONLINE / OFFLINE ---
function actualizarDotConexion(forzarRoja = false) {
    const dot = document.getElementById('nav-dot');
    if (dot) {
        let isOnline = !forzarRoja && navigator.onLine;
        dot.classList.toggle('offline', !isOnline);
        dot.title = isOnline ? 'En línea' : 'Sin conexión';
    }
}
window.addEventListener('online', () => actualizarDotConexion(false));
window.addEventListener('offline', () => actualizarDotConexion(true));

// --- MOTOR DE BASE DE DATOS LOCAL (IndexedDB) ---
const DB_NAME = 'SupportFitnesDB';
const DB_VERSION = 2;  // v2: agrega hash para prevenir duplicados offline
let db;

// DB v2: agrega índice 'hash' para prevenir duplicados exactos

function initDB() {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror   = event => { reject(event); };
        request.onsuccess = event => { db = event.target.result; resolve(db); };
        request.onupgradeneeded = event => {
            let dbObj = event.target.result;
            // Crear o migrar el store
            if (!dbObj.objectStoreNames.contains('pendientes')) {
                let store = dbObj.createObjectStore('pendientes', { autoIncrement: true });
                store.createIndex('hash', 'hash', { unique: true });
            } else if (event.oldVersion < 2) {
                // Migración: agregar índice hash al store existente
                let store = event.target.transaction.objectStore('pendientes');
                if (!store.indexNames.contains('hash')) {
                    store.createIndex('hash', 'hash', { unique: false });
                }
            }
        };
    });
}

function guardarOfflineBD(data) {
    return new Promise((resolve, reject) => {
        // Generar hash único basado en técnico + gimnasio + motivo + timestamp truncado
        // Truncamos a 1 minuto para que reenvíos accidentales del mismo formulario
        // en el mismo minuto NO generen duplicados.
        var tsMinuto = Math.floor(Date.now() / 60000); // cambia cada minuto
        var hashStr  = (data.tecnico || '') + '|' + (data.gimnasio || '') + '|' +
                       (data.motivos || '') + '|' + tsMinuto;
        var hash = hashStr.split('').reduce(function(acc, c) {
            return ((acc << 5) - acc + c.charCodeAt(0)) | 0;
        }, 0).toString(36);

        data._hash    = hash;   // guardamos el hash en el dato
        data._savedAt = new Date().toISOString();

        var transaction = db.transaction(['pendientes'], 'readwrite');
        var store = transaction.objectStore('pendientes');

        // Verificar si ya existe un registro con el mismo hash
        var checkReq = store.openCursor();
        var yaExiste = false;
        checkReq.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                if (cursor.value._hash === hash) { yaExiste = true; }
                cursor.continue();
            } else {
                if (yaExiste) {
                    resolve(); // ya estaba guardado, no duplicar
                    return;
                }
                var addReq = store.add(data);
                addReq.onsuccess = function() { resolve(); };
                addReq.onerror   = function() { reject(); };
            }
        };
        checkReq.onerror = function() { reject(); };
    });
}

function obtenerPendientesBD() {
    return new Promise((resolve, reject) => {
        let transaction = db.transaction(['pendientes'], 'readonly');
        let store = transaction.objectStore('pendientes');
        let request = store.openCursor();
        let resultados = [];
        request.onsuccess = event => {
            let cursor = event.target.result;
            if (cursor) {
                resultados.push({ id: cursor.key, data: cursor.value });
                cursor.continue();
            } else { resolve(resultados); }
        };
        request.onerror = () => reject();
    });
}

function eliminarPendienteBD(id) {
    return new Promise((resolve, reject) => {
        let transaction = db.transaction(['pendientes'], 'readwrite');
        let store = transaction.objectStore('pendientes');
        let request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

// --- SISTEMA DE AVISOS PERSONALIZADO ---
let callbackConfirmacion = null;
function mostrarAlerta(mensaje) { document.getElementById('msg-alerta').innerText = mensaje; document.getElementById('modalAlerta').style.display = 'flex'; }
function cerrarAlerta() { document.getElementById('modalAlerta').style.display = 'none'; }
function mostrarConfirmacion(mensaje, callback) { document.getElementById('msg-confirmacion').innerText = mensaje; callbackConfirmacion = callback; document.getElementById('modalConfirmacion').style.display = 'flex'; }
function cerrarConfirmacion(confirmado) { document.getElementById('modalConfirmacion').style.display = 'none'; if (callbackConfirmacion) callbackConfirmacion(confirmado); callbackConfirmacion = null; }

// --- EVENTOS INICIALES Y UI ---
window.addEventListener('load', async () => {
    // 🔥 Inicializar menú compartido (nav.js) 🔥
    if (typeof NavBar !== 'undefined') {
        NavBar.init({
            paginaActual: 'formulario',
            botones: { historial: true, pendientesBadge: true }
        });
    } else {
        // Fallback: dark mode manual si nav.js no está disponible
        if (localStorage.getItem('darkMode') === 'yes') {
            document.body.classList.add('dark-mode');
        }
    }

    await obtenerDolar();
    await cargarDatosBase();
    try {
        await initDB(); 
        actualizarDotConexion(false);
        
        let pendientesViejos = JSON.parse(localStorage.getItem("visitas_pendientes") || "[]");
        if(pendientesViejos.length > 0) {
            for(let p of pendientesViejos) await guardarOfflineBD(p);
            localStorage.removeItem("visitas_pendientes");
        }

        mostrarLista([], false);
        let savedTecnico = localStorage.getItem("tecnico");
        if (savedTecnico) document.getElementById("tecnico").value = savedTecnico;
        cargarPanelHistorial();
        sincronizarOffline();

        window.addEventListener('online', () => { actualizarDotConexion(false); setTimeout(sincronizarOffline, 2000); });
        setInterval(() => { 
            actualizarDotConexion(false); 
            if (navigator.onLine) sincronizarOffline(); 
        }, 4000); 

        if (navigator.onLine) {
            llamarAPI({ accion: "verificarVersion" }).then(res => {
                if (res && res.versionActual > VERSION_APP) {
                    // 🔥 Mostrar banner de actualización OPCIONAL (no modal bloqueante) 🔥
                    let banner = document.getElementById('banner-actualizacion');
                    if (!banner) {
                        banner = document.createElement('div');
                        banner.id = 'banner-actualizacion';
                        banner.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); width:calc(100% - 40px); max-width:500px; background:linear-gradient(135deg,#1a73e8,#0d47a1); color:white; padding:14px 18px; border-radius:14px; box-shadow:0 4px 20px rgba(0,0,0,0.3); z-index:9999; display:flex; align-items:center; gap:12px; animation: slideUp 0.4s ease;';
                        document.body.appendChild(banner);
                    }
                    
                    let msgActualizacion = res.mensaje || "Hay mejoras disponibles en la nueva versión.";
                    
                    banner.innerHTML = `
                        <div style="flex:1;">
                            <div style="font-weight:900; font-size:14px;">🚀 Actualización disponible v${res.versionActual}</div>
                            <div style="font-size:12px; opacity:0.9; margin-top:3px;">${msgActualizacion}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
                            <a href="${res.linkDescarga}" target="_blank" onclick="document.getElementById('banner-actualizacion').style.display='none'" 
                               style="background:white; color:#1a73e8; font-weight:bold; padding:8px 14px; border-radius:8px; text-decoration:none; font-size:12px; text-align:center; white-space:nowrap;">
                                ⬇️ Actualizar
                            </a>
                            <button onclick="document.getElementById('banner-actualizacion').style.display='none'" 
                                    style="background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.4); padding:6px 14px; border-radius:8px; font-size:11px; cursor:pointer; font-weight:bold;">
                                Ahora no
                            </button>
                        </div>
                    `;
                    
                    // También mostrar el modal viejo si existe (compatibilidad)
                    const modalAnt = document.getElementById('modalActualizacion');
                    if (modalAnt) {
                        let btnDescarga = document.getElementById('linkDescargaApk');
                        if(btnDescarga) {
                            btnDescarga.href = res.linkDescarga;
                            btnDescarga.onclick = function() { modalAnt.style.display = 'none'; };
                        }
                        modalAnt.style.display = 'flex';
                    }
                }
            }).catch(e => console.log("Modo offline o error al checkear version"));
        }
    } catch(e) { console.error(e); }
    // Lógica para detectar navegación desde otras pestañas
    const urlParams = new URLSearchParams(window.location.search);
    const vistaSolicitada = urlParams.get('vista');

    if (vistaSolicitada === 'jefatura') {
        setTimeout(intentarAbrirJefatura, 500);
    }
});



let gimnasios = [
    "46 PLAZA PILAR (CAMAGNO)", "Administracion Barrio Privado la lomada", "Always Club 1 (Guatemala)", "Always Club 2 (Costa Rica)",
    "Arcos Barrancas S.R.L. (Arcos 1539)", "ASOCIACION CIVIL EL YACHT NORDELTA", "Banco Galicia (Torre Leiva)", "BARRANCAS DEL LAGO","BARRIO LA LOMADA PILAR", "BARRIO MI REFUGIO (Canning)", "BARRIOS LOS ALISOS", "CARMEL COUNTRY S.A.",
    "CLUB ARMENIA (Pilar)", "CLUB DE CAMPO ARMENIA S A", "CLUB DEPORTIVO SANTA BARBARA S.A", "CLUB HIPICO ARGENTINO", "CLUB SANTA BARBARA",
    "CONS. DOZ PLAZAS (Torre 1)", "CONS. DOZ PLAZAS (Torre 2)", "CONS. PROP, CABALLITO NUEVO COLPAYO 760", "CONS. PROP. CABALLITO NUEVO FELIPE VALLES",
    "CONS. PROP. JUNCAL 3220/80 PARK", "CONS. PROP. JUNCAL 3220/80 PLAZA", "CONS.DE PROP. F.J. STA. MARIA DE ORO 2833", "CONS.DE PROP. UGARTECHE (SEGUI 3672)",
    "CONSORCIO 3 DE FEBRERO 2845", "CONSORCIO ANTARES NORDELTA", "CONSORCIO ARCOS 1167", "Consorcio AREVALO 1950", "CONSORCIO ASTOR NUÑEZ",
    "Consorcio Austria 1709", "Consorcio Austria 2660", "CONSORCIO CHARLONE 555", "CONSORCIO CLUB CAMPO PILAR", "CONSORCIO CONDOMINIOS BAHIA",
    "CONSORCIO CRAMER 1753", "CONSORCIO DE PROP COUNTRY GOLF EL SOSIEGO", "CONSORCIO DE PROP, RODRIGUEZ PEÑA 1675", "CONSORCIO DE PROPIETARIOS NICARAGUA 6045 (LIVE H)",
    "CONSORCIO DE PROPIETARIOS QUARTIER NORDELTA", "CONSORCIO EDIFICIO AV MANUEL M DE OCA 153", "Consorcio Grand Bourg (Figueroa Alcorta 3051)",
    "Consorcio Gurruchaga 2140", "CONSORCIO JARDINES DEL LIBERTADOR", "Consorcio Juncal 1919", "Consorcio Juncal Park", "Consorcio Juncal Plaza",
    "CONSORCIO LA ALAMEDA NORDELTA", "CONSORCIO LACROZE 2201", "Consorcio Libertador 2424", "CONSORCIO LIVE HOTEL", "CONSORCIO M. OCA",
    "Consorcio Malabia 444", "CONSORCIO MEDRANO 820", "CONSORCIO MIRADORES DE LA BAHIA", "Consorcio Palacio Alcorta", "Consorcio Palermo 1 (Uriarte)",
    "Consorcio Paraguay 4747 (Town House)", "Consorcio Paraguay 4871 (Godoy Cruz)", "Consorcio Premier Rodriguez Peña", "CONSORCIO PROP. LIBERTADOR 1235/1265 WAVE",
    "CONSORCIO PROPIETARIOS RIO DE JANEIRO 259", "CONSORCIO QUANTUM BERUTI", "CONSORCIO QUARTIER DE MARIA", "Consorcio Riobamba 1261",
    "CONSORCIO ROSALES 2575", "Consorcio Ruggieri 2935 (Cerviño)", "Consorcio Ruggieri 3045", "CONSORCIO SEGUI 4602",
    "CONSORCIO SUITCH (Medrano 1020)", "Consorcio Torre Gelly 3650", "CONSORCIO TORRE ORO", "CONSORCIO TORRES DEL YACHT NORTE",
    "CONSORCIO TORRES DEL YACHT SUR", "CONSORCIO VIRREY DEL PINO 1769", "CONSORCIO WAVE LIBERTADOR", "CONSORCIO WOW (Nuñez 2422)",
    "COUNTRY BAHIA DEL SOL", "COUNTRY EL CARMEL (Pilar)", "COUNTRY LA DELFINA", "COUNTRY PILAR DEL LAGO", "DHL EXPRESS (Av. Larrazabal)",
    "EDIFICIO AWWA", "EDIFICIO CENTINELA", "FIDEICOMISO CONDOMINIOS DE BAHIA GRANDE", "FIDEICOMISO CORDOBA 3815 (CONS. MEDRANO 1020)",
    "GIMNASIO ELEACHE", "Gimnasio Narziso Fitness Club", "GIMNASIO OLIMPO SPA (La Plata)", "HOTEL MARRIOT Buenos Aires", "Hotel Palladio",
    "OSSEG SINDICATO SEGUROS", "SUITES TEMATICAS (HOTEL BOCA)", "TORRE CABALLITO NUEVO COLPAYO", "TORRE CABALLITO NUEVO FELIPE V.",
    "TORRE MILENIUM TOWER 3 ( 2264 )", "TORRES DOSPLAZAS", "TRAINER GYM TIGRE", "VILA POINT BENAVIDEZ",
    "CONSORCIO ARCOS 1965", "CONSORCIO ELCANO 2855", "CONSORCIO RIO DE JANEIRO 257", "GIMNASIO GRACIELA","PUAN DIAZ DE SOLIS 2222 (Olivos)", "CONSORCIO ARRIBEÑOS 1669", "CONSORCIO LIBERTADOR 8008 (Centennial)"
];

const cronogramaZonas = [
    { zona: "Zona 1", clientes: [{ nombre: "Always Club 1 (Guatemala)", freq: "Mensual" }, { nombre: "Always Club 2 (Costa Rica)", freq: "Mensual" }, { nombre: "Gimnasio Narziso Fitness Club", freq: "Mensual" }, { nombre: "Consorcio Gurruchaga 2140", freq: "Trimestral" }, { nombre: "Consorcio Palermo 1 (Uriarte)", freq: "Mensual" }, { nombre: "Consorcio Paraguay 4871 (Godoy Cruz)", freq: "Bimestral" }, { nombre: "Consorcio Paraguay 4747 (Town House)", freq: "Mensual" }, { nombre: "Consorcio Grand Bourg (Figueroa Alcorta 3051)", freq: "Mensual" }, { nombre: "Consorcio Palacio Alcorta", freq: "Mensual" }, { nombre: "Consorcio Torre Gelly 3650", freq: "Mensual" }, { nombre: "Consorcio Segui 3672", freq: "Mensual" }, { nombre: "Consorcio Libertador 2424", freq: "Mensual" }, { nombre: "Consorcio Ruggieri 3045", freq: "Mensual" }, { nombre: "Consorcio Austria 2660", freq: "Mensual" }, { nombre: "Consorcio Austria 1709", freq: "Mensual" }, { nombre: "Consorcio Rugierri 2935 (Cerviño)", freq: "Mensual" }, { nombre: "Consorcio Juncal Plaza", freq: "Mensual" }, { nombre: "Consorcio Juncal Park", freq: "Mensual" }, { nombre: "Hotel Palladio", freq: "Trimestral" }, { nombre: "Consorcio Riobamba 1261", freq: "Bimestral" }, { nombre: "Consorcio Premier Rodriguez Peña", freq: "Mensual" }, { nombre: "Consorcio Juncal 1919", freq: "Mensual" }, { nombre: "Arcos Barrancas S.R.L. (Arcos 1539)", freq: "Trimestral" }] },
    { zona: "Zona 2", clientes: [{ nombre: "CONSORCIO MALABIA 444", freq: "Mensual" }, { nombre: "Banco Galicia (Torre Leiva)", freq: "Mensual" }, { nombre: "CONSORCIO CHARLONE 555", freq: "Mensual" }, { nombre: "CONSORCIO VIRREY DEL PINO 1769", freq: "Mensual" }, { nombre: "Consorcio AREVALO 1950", freq: "Bimestral" }, { nombre: "CONSORCIO LIVE HOTEL", freq: "Mensual" }, { nombre: "CONSORCIO CRAMER 1753", freq: "Mensual" }, { nombre: "CONSORCIO ASTOR NUÑEZ", freq: "Bimestral" }, { nombre: "CONSORCIO WOW (Nuñez 2422)", freq: "Mensual" }, { nombre: "CONSORCIO 3 DE FEBRERO 2845", freq: "Trimestral" }, { nombre: "CONSORCIO JARDINES DEL LIBERTADOR", freq: "Mensual" }, { nombre: "CLUB HIPICO ARGENTINO", freq: "Bimestral" }, { nombre: "EDIFICIO AWWA", freq: "Mensual" }, { nombre: "CONSORCIO ROSALES 2575", freq: "Bimestral" }, { nombre: "CONSORCIO WAVE LIBERTADOR", freq: "Bimestral" }, { nombre: "CONSORCIO ARCOS 1539", freq: "Trimestral" }, { nombre: "CONSORCIO ARCOS 1965", freq: "Trimestral" }, { nombre: "CONSORCIO LACROZE 2201", freq: "Mensual" }, { nombre: "CONSORCIO ELCANO 2855", freq: "Mensual" }] },
    { zona: "Zona 3", clientes: [{ nombre: "CONSORCIO SEGUI 4602", freq: "Mensual" }, { nombre: "CONSORCIO QUARTIER DE MARIA", freq: "Mensual" }, { nombre: "CONSORCIO TORRE ORO", freq: "Mensual" }, { nombre: "CONSORCIO QUANTUM BERUTI", freq: "Bimestral" }, { nombre: "CONSORCIO TORRES DEL YACHT NORTE", freq: "Mensual" }, { nombre: "CONSORCIO TORRES DEL YACHT SUR", freq: "Mensual" }, { nombre: "OSSEG SINDICATO SEGUROS", freq: "Mensual" }, { nombre: "SUITES TEMATICAS (HOTEL BOCA)", freq: "Bimestral" }, { nombre: "HOTEL MARRIOT Buenos Aires", freq: "Bimestral" }, { nombre: "CONSORCIO M. OCA", freq: "Mensual" }, { nombre: "EDIFICIO CENTINELA", freq: "Mensual" }, { nombre: "CONSORCIO SUITCH (Medrano 1020)", freq: "Mensual" }, { nombre: "CONSORCIO MEDRANO 820", freq: "Trimestral" }, { nombre: "GIMNASIO ELEACHE", freq: "Bimestral" }, { nombre: "TORRE CABALLITO NUEVO COLPAYO", freq: "Mensual" }, { nombre: "TORRE CABALLITO NUEVO FELIPE V.", freq: "Mensual" }, { nombre: "CONS. DOZ PLAZAS (Torre 1)", freq: "Mensual" }, { nombre: "CONS. DOZ PLAZAS (Torre 2)", freq: "Mensual" }, { nombre: "TORRE MILENIUM TOWER 3 ( 2264 )", freq: "Bimestral" }, { nombre: "DHL EXPRESS (Av. Larrazabal)", freq: "Bimestral" }, { nombre: "CONSORCIO RIO DE JANEIRO 257", freq: "Bimestral" }] },
    { zona: "Zona 4", clientes: [{ nombre: "CONSORCIO MIRADORES DE LA BAHIA", freq: "Mensual" }, { nombre: "CONSORCIO CONDOMINIOS BAHIA", freq: "Mensual" }, { nombre: "ASOCIACION CIVIL EL YACHT NORDELTA", freq: "Mensual" }, { nombre: "BARRIOS LOS ALISOS", freq: "Mensual" }, { nombre: "BARRANCAS DEL LAGO", freq: "Mensual" }, { nombre: "CLUB SANTA BARBARA", freq: "Mensual" }, { nombre: "COUNTRY BAHIA DEL SOL", freq: "Mensual" }, { nombre: "CONSORCIO ANTARES NORDELTA", freq: "Trimestral" }, { nombre: "CONSORCIO LA ALAMEDA NORDELTA", freq: "Mensual" }, { nombre: "CONSORCIO DE PROPIETARIOS QUARTIER NORDELTA", freq: "Bimestral" }, { nombre: "TRAINER GYM TIGRE", freq: "Mensual" }] },
    { zona: "Zona 5", clientes: [{ nombre: "COUNTRY EL CARMEL (Pilar)", freq: "Mensual" }, { nombre: "COUNTRY LA DELFINA", freq: "Mensual" }, { nombre: "COUNTRY PILAR DEL LAGO", freq: "Mensual" }, { nombre: "BARRIO LA LOMADA PILAR", freq: "Mensual" }, { nombre: "CLUB ARMENIA (Pilar)", freq: "Mensual" }, { nombre: "46 PLAZA PILAR (CAMAGNO)", freq: "Mensual" }, { nombre: "BARRIO MI REFUGIO (Canning)", freq: "Mensual" }, { nombre: "CONSORCIO DE PROP COUNTRY GOLF EL SOSIEGO", freq: "Mensual" }, { nombre: "GIMNASIO OLIMPO SPA (La Plata)", freq: "Mensual" }, { nombre: "VILA POINT BENAVIDEZ", freq: "Mensual" }, { nombre: "GIMNASIO GRACIELA", freq: "Mensual" }] }
];

window.archivosSeleccionados = []; // Ahora es global para que index.html la pueda leer
let historialGlobal    = [];
let añoVistaActual     = new Date().getFullYear();

// --- NUEVO SISTEMA DE PREVIEW AUTOMÁTICO ---
document.getElementById('archivo-oculto').addEventListener('change', function (e) {
    for (let i = 0; i < this.files.length; i++) { 
        window.archivosSeleccionados.push(this.files[i]); 
    }
    this.value = "";
    if (window._renderizarFotos) window._renderizarFotos(window.archivosSeleccionados);
    if (typeof actualizarProgress === 'function') actualizarProgress(); // Actualiza progreso visual en el formulario
});

window.eliminarArchivo = function(index) { 
    window.archivosSeleccionados.splice(index, 1); 
    if (window._renderizarFotos) window._renderizarFotos(window.archivosSeleccionados);
    if (typeof actualizarProgress === 'function') actualizarProgress();
};
function toggleHistorial() { const panel = document.getElementById("contenedor-meses"); const btn = document.getElementById("btnToggle"); if (panel.classList.contains("mostrar-en-movil")) { panel.classList.remove("mostrar-en-movil"); btn.innerText = "Ver Historial de Visitas ▼"; } else { panel.classList.add("mostrar-en-movil"); btn.innerText = "Ocultar Historial ▲"; } }
function mostrarLista(listaFiltrada, mostrar) { let listaContainer = document.getElementById("lista"); listaContainer.innerHTML = ""; if (!mostrar || listaFiltrada.length === 0) { listaContainer.style.display = "none"; return; } listaContainer.style.display = "block"; listaFiltrada.forEach(g => { let item = document.createElement("div"); item.className = "gym-list-item"; item.innerText = g; item.addEventListener('mousedown', function (e) { e.preventDefault(); }); item.onclick = () => seleccionar(g); listaContainer.appendChild(item); }); }
function normalizar(str) { return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function filtrar() {
    let val = document.getElementById("buscador").value;
    let valNorm = normalizar(val);
    let ghost = document.getElementById("ghost");

    // Limpiar aviso si el campo se borró
    if (!val.trim()) {
        ['aviso-remito', 'aviso-oc'].forEach(function(id) {
            var el = document.getElementById(id); if (el) el.remove();
        });
    } 
    if (val.length > 0) { let match = gimnasios.find(g => normalizar(g).startsWith(valNorm)); if (match) { let parteEscrita = match.substring(0, val.length); let parteRestante = match.substring(val.length); ghost.innerHTML = `<span style="opacity:0;">${parteEscrita}</span>${parteRestante}`; } else { ghost.innerHTML = ""; } } else { ghost.innerHTML = ""; } if (valNorm.length > 0) { let filtrados = gimnasios.filter(g => normalizar(g).includes(valNorm)); mostrarLista(filtrados, true); } else { mostrarLista([], false); } }
function seleccionar(valor) {
    let buscador = document.getElementById("buscador");
    buscador.value = valor;
    document.getElementById("ghost").innerHTML = "";
    mostrarLista([], false);
    setTimeout(() => { buscador.blur(); }, 10);

    // MEJORA 8 — Verificar si el gym pide remito y advertir al técnico
    _verificarRemitoGym(valor);
}

// ── Diccionario de abreviaturas comunes ──────────────────────

const _ABREV_GYM = {
    'cons\\.?': 'consorcio',
    'prop\\.?': 'propietarios',
    'de prop\\.?': 'de propietarios',
    'coprops?\\.?': 'copropietarios',
    's\\.?a\\.?': '',          // "S.A." → ignorar (demasiado genérico)
    's\\.?r\\.?l\\.?': '',     // "S.R.L." → ignorar
    'av\\.?': 'avenida',
    'gral\\.?': 'general',
    'dto\\.?': 'departamento',
};
 
/**
 * Normaliza un nombre de gimnasio expandiendo abreviaturas y
 * eliminando puntuación irrelevante para comparación.
 */
function _normalizarNombreGym(str) {
    let s = String(str || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .trim();
 
    // Expandir abreviaturas
    for (const [abrev, expansion] of Object.entries(_ABREV_GYM)) {
        s = s.replace(new RegExp('\\b' + abrev + '\\b', 'gi'), expansion + ' ');
    }
 
    // Limpiar puntuación (mantener números para "1709", "3650", etc.)
    s = s.replace(/[.,\-_¡!¿?()[\]{}'"]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
 
    return s;
}
 
/**
 * Calcula un score de similitud entre dos nombres de gimnasio
 * basado en palabras significativas compartidas.
 * Retorna un número entre 0 y 1.
 */
function _scoreGym(a, b) {
    const na = _normalizarNombreGym(a);
    const nb = _normalizarNombreGym(b);
 
    // Coincidencia exacta después de normalizar
    if (na === nb) return 1.0;
 
    // Palabras significativas (longitud > 3 para evitar "de", "la", "los")
    const wordsA = na.split(' ').filter(w => w.length > 3 && isNaN(w));
    const wordsB = nb.split(' ').filter(w => w.length > 3 && isNaN(w));
    // Números exactos (ej: "1709", "3650") también son significativos
    const numsA  = na.split(' ').filter(w => !isNaN(w) && w.length > 0);
    const numsB  = nb.split(' ').filter(w => !isNaN(w) && w.length > 0);
 
    if (wordsA.length === 0 && numsA.length === 0) return 0;
    if (wordsB.length === 0 && numsB.length === 0) return 0;
 
    // Coincidencias de palabras
    const matchWords = wordsA.filter(w => wordsB.includes(w)).length;
    // Coincidencias de números (peso alto: "1709" es muy identificatorio)
    const matchNums  = numsA.filter(n => numsB.includes(n)).length;
 
    const totalA = wordsA.length + numsA.length * 2; // Números valen doble
    const totalB = wordsB.length + numsB.length * 2;
    const score  = (matchWords + matchNums * 2) / Math.max(totalA, totalB);
 
    return score;
}
 
// ── UMBRAL DE SIMILITUD ───────────────────────────────────────
// 0.70 = el 70% de las palabras significativas deben coincidir.
// Subir a 0.80 si hay demasiados falsos positivos.
// Bajar a 0.60 si algunos gyms con nombres muy distintos no se detectan.
const _UMBRAL_REMITO = 0.70;
 
/**
 * Verifica si el gimnasio seleccionado necesita remito u OC.
 * Muestra un toast naranja prominente + aviso inline.
 *
 * REEMPLAZA la función _verificarRemitoGym() del app.js original.
 */
function _verificarRemitoGym(gymNombre) {
    // Limpiar avisos anteriores
    ['aviso-remito', 'aviso-oc', 'toast-remito'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
 
    if (!gymNombre || !gymNombre.trim()) return;
 
    // Si los abonos todavía no cargaron, reintentar en 2 segundos
    if (!window.listaAbonosGlobal || window.listaAbonosGlobal.length === 0) {
        setTimeout(() => _verificarRemitoGym(gymNombre), 2000);
        return;
    }
 
    // Encontrar el abono con mejor score de similitud
    let mejorMatch  = null;
    let mejorScore  = 0;
 
    window.listaAbonosGlobal.forEach(abono => {
        const score = _scoreGym(gymNombre, String(abono.gym || ''));
        if (score > mejorScore) {
            mejorScore  = score;
            mejorMatch  = abono;
        }
    });
 
    // No hay match suficientemente bueno → no mostrar nada
    if (!mejorMatch || mejorScore < _UMBRAL_REMITO) return;
 
    const necesitaRemito = mejorMatch.pideRemito === true;
    const necesitaOC     = mejorMatch.pideOC === true;
 
    // Sin requisitos especiales → no hacer nada
    if (!necesitaRemito && !necesitaOC) return;
 
    // ── Aviso inline (debajo del buscador) ───────────────────
    const aviso = document.createElement("div");
    aviso.id = "aviso-remito";
    aviso.style.cssText = [
        "background:#fff3e0;",
        "border-left:4px solid #ff9800;",
        "border-radius:10px;",
        "padding:14px 16px;",
        "margin-top:12px;",
        "display:flex;",
        "align-items:flex-start;",
        "gap:12px;",
    ].join(" ");
 
    let textoReq = [];
    if (necesitaRemito) textoReq.push(`<strong>REMITO firmado</strong>`);
    if (necesitaOC)     textoReq.push(`<strong>ORDEN DE COMPRA</strong>`);
 
    aviso.innerHTML = `
        <span style="font-size:24px; flex-shrink:0;">📋</span>
        <div>
            <div style="font-weight:900; font-size:14px; color:#e65100; margin-bottom:5px;">
                ⚠️ Documentación requerida
            </div>
            <div style="font-size:13px; color:#bf360c; line-height:1.6;">
                <strong>${gymNombre}</strong> exige: ${textoReq.join(' y ')}.<br>
                <u>Fotografialo antes de enviar y adjuntalo como foto.</u>
            </div>
        </div>`;
 
    const cardGim = document.getElementById("card-gimnasio");
    if (cardGim) cardGim.appendChild(aviso);
 
    // ── Toast prominente (solo si pide remito) ────────────────
    if (necesitaRemito) {
        const toast = document.createElement("div");
        toast.id = "toast-remito";
        toast.style.cssText = [
            "position: fixed;",
            "top: 70px;",
            "left: 50%;",
            "transform: translateX(-50%);",
            "width: calc(100% - 32px);",
            "max-width: 520px;",
            "z-index: 9999;",
            "background: linear-gradient(135deg, #e65100, #bf360c);",
            "color: white;",
            "border-radius: 14px;",
            "padding: 16px 20px;",
            "box-shadow: 0 8px 32px rgba(230,81,0,0.45);",
            "display: flex;",
            "align-items: center;",
            "gap: 14px;",
        ].join(" ");
 
        toast.innerHTML = `
            <div style="font-size:36px; flex-shrink:0;">📋</div>
            <div style="flex:1;">
                <div style="font-weight:900; font-size:15px; margin-bottom:4px;">
                    ¡Este cliente requiere REMITO físico!
                </div>
                <div style="font-size:13px; opacity:0.92; line-height:1.5;">
                    Fotografiá el remito firmado y subilo como foto en el formulario.
                </div>
            </div>
            <button onclick="document.getElementById('toast-remito').remove()"
                    style="background:rgba(255,255,255,0.25); border:none; color:white;
                           width:30px; height:30px; border-radius:50%; font-size:16px;
                           cursor:pointer; flex-shrink:0; font-weight:900;">✕</button>
        `;
 
        toast.addEventListener('click', (e) => {
            if (e.target === toast) toast.remove();
        });
 
        document.body.appendChild(toast);
 
        // Auto-cerrar a los 8 segundos
        setTimeout(() => {
            const t = document.getElementById('toast-remito');
            if (t) t.remove();
        }, 8000);
    }
}

document.addEventListener('click', function (event) { const buscador = document.getElementById('buscador'); const lista = document.getElementById('lista'); if (event.target !== buscador && event.target !== lista) { mostrarLista([], false); } });
function mostrarBotonHistorial() { 
    let btnNav = document.getElementById('btn-historial-nav');
    let btnMovil = document.getElementById('btn-historial-movil');
    let bnavHistorial = document.getElementById('bnav-historial');
    
    if(btnNav) {
        btnNav.disabled = false;
        btnNav.innerText = "📅 Historial Anual";
        btnNav.style.background = "#0f9d58"; 
        btnNav.style.color = "white";
        btnNav.style.opacity = '1';
        btnNav.onclick = () => abrirRegistroAnual();
    }
    if(btnMovil) {
        btnMovil.disabled = false;
        btnMovil.innerText = "📅 Ver Historial Anual";
        btnMovil.style.background = "#0f9d58"; 
        btnMovil.style.color = "white";
        btnMovil.style.opacity = '1';
        btnMovil.onclick = () => abrirRegistroAnual();
    }
    if(bnavHistorial) {
        bnavHistorial.style.opacity = '1';
        bnavHistorial.style.color = 'var(--verde, #0f9d58)';
        bnavHistorial.onclick = () => abrirRegistroAnual();
    }
}
function cargarPanelHistorial(esReintento = false) { 
    let btnNav = document.getElementById('btn-historial-nav');
    let btnMovil = document.getElementById('btn-historial-movil');
    let bnavHistorial = document.getElementById('bnav-historial');
    
    const setEstado = (texto, bg, color, disabled, onclick) => {
        [btnNav, btnMovil].forEach(btn => {
            if (!btn) return;
            btn.innerText = texto;
            btn.disabled = disabled;
            btn.style.background = bg;
            btn.style.color = color;
            btn.style.opacity = disabled ? '0.8' : '1';
            btn.onclick = onclick;
        });
        if (bnavHistorial) {
            bnavHistorial.style.opacity = disabled ? '0.5' : '1';
            if (onclick) bnavHistorial.onclick = onclick;
        }
    };

    setEstado(esReintento ? "🔄 Reintentando..." : "⏳ Cargando...", "#e8f0fe", "#1a73e8", true, null);

    llamarAPI({ accion: "obtenerRegistroHistorico" })
        .then(datos => { procesarHistorialCargado(datos); })
        .catch(() => { 
            setEstado("🔄 Reintentar Historial", "#fce8e6", "#d93025", false, () => cargarPanelHistorial(true));
        }); 
}
function procesarHistorialCargado(datos) { if (datos && Array.isArray(datos)) { historialGlobal = datos; } else if (datos && datos.datos) { historialGlobal = datos.datos; } else { historialGlobal = []; } mostrarBotonHistorial(); }
function abrirRegistroAnual() { 
    añoVistaActual = new Date().getFullYear(); 
    const modal = document.getElementById('modalRegistro'); 
    modal.style.display = 'flex'; 
    setTimeout(() => { modal.classList.add('mostrar'); }, 10); 
    // Si no hay datos aún, intentar cargar primero
    if (historialGlobal.length === 0) { 
        cargarPanelHistorial(true); 
    } 
    renderizarGrillaAnual(); 
}
function cambiarAño(direccion) { const añoActualReal = new Date().getFullYear(); const minAño = 2024; let nuevoAño = añoVistaActual + direccion; if (nuevoAño >= minAño && nuevoAño <= añoActualReal) { añoVistaActual = nuevoAño; renderizarGrillaAnual(); } }
function getTipoCasillero(frecuencia, gymNombre, mesIndex, mesInicio) { 
    if (frecuencia === "Mensual") return "M";
    
    // mesInicio = el índice del primer mes activo según el Sheet.
    // Si viene del Sheet lo usamos directo. Si no (cronograma hardcodeado), fallback.
    const inicio = (mesInicio !== undefined && mesInicio !== null) ? mesInicio : 0;
    
    if (frecuencia === "Bimestral") {
        // Activo cada 2 meses empezando en 'inicio'
        return ((mesIndex - inicio) % 2 === 0) ? "B" : "BLACK";
    }
    if (frecuencia === "Trimestral") {
        // Activo cada 3 meses empezando en 'inicio'
        return ((mesIndex - inicio) % 3 === 0) ? "T" : "BLACK";
    }
    return "M"; 
}

function renderizarGrillaAnual() { 
    document.getElementById('modal-titulo').innerHTML = 'PERIODO ' + añoVistaActual + 
        ' <span style="cursor:pointer; font-size:18px; margin-left:10px; color:#fbbc04;" onclick="forzarRefreshHistorial()" title="Sincronizar con Sheet">🔄</span>'; 
    
    document.getElementById('btn-prev').disabled = (añoVistaActual <= 2024); 
    document.getElementById('btn-next').disabled = (añoVistaActual >= new Date().getFullYear()); 

    const mesesAbrev = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]; 
    const sufijoAño = String(añoVistaActual).slice(-2); 
    let html = ''; 

    // Usar cronograma dinámico del Sheet si está disponible, sino el hardcodeado
    const zonasFuente = (cronogramaZonasDinamico && cronogramaZonasDinamico.length > 0) 
        ? cronogramaZonasDinamico 
        : cronogramaZonas;

    if (cronogramaZonasDinamico && cronogramaZonasDinamico.length > 0) {
        html += `<div style="background:#e6f4ea; color:#0f9d58; padding:8px 12px; border-radius:6px; 
            font-size:12px; font-weight:bold; margin-bottom:10px; border:1px solid #ceead6;">
            ✅ Conectado a Google Sheets (${cronogramaZonasDinamico.length} zonas). 
            Agregá un gimnasio en el Sheet y tocá 🔄 para verlo aquí.
        </div>`;
    } else {
        html += `<div style="background:#fff3e0; color:#e65100; padding:8px 12px; border-radius:6px; 
            font-size:12px; font-weight:bold; margin-bottom:10px; border:1px solid #ffcc80;">
            ⚠️ Usando cronograma interno. Creá las hojas "Zona 1".."Zona 5" en el Sheet y tocá 🔄.
        </div>`;
    }
    
    zonasFuente.forEach((zonaObj) => { 
        html += `<button class="zona-header-btn" onclick="this.nextElementSibling.classList.toggle('activa')">
            📍 ${zonaObj.zona.toUpperCase()}
        </button>`; 
        html += `<div class="zona-tabla-wrapper activa"><div class="zona-container">
            <table class="excel-table">
            <thead>
                <tr class="excel-header-row">
                    <th colspan="14">MANTENIMIENTO PREVENTIVO PERIODO ${añoVistaActual} ${zonaObj.zona.toUpperCase()}</th>
                </tr>
                <tr class="excel-subheader-row">
                    <th class="gym-number-cell">Nº</th>
                    <th class="gym-name-cell">Clientes Abonados</th>`; 
        
        for (let m = 0; m < 12; m++) html += `<th>${mesesAbrev[m]}-${sufijoAño}</th>`; 
        html += `</tr></thead><tbody>`; 
        
        zonaObj.clientes.forEach((cliente, cIndex) => { 
            // 🔥 COMPARACIÓN EXACTA: normalizar ambos lados completamente
            const gymNormExacto = normalizar(cliente.nombre); 
            html += `<tr>
                <td class="gym-number-cell">${cIndex + 1}</td>
                <td class="gym-name-cell">${cliente.nombre.toUpperCase()}</td>`; 
            
            for (let m = 0; m < 12; m++) { 
                // 🔥 FILTRO CORREGIDO: solo comparación exacta, sin substring
                let visitasMes = historialGlobal.filter(v => {
                    // Comparación exacta de nombre normalizado
                    const vGymNorm = normalizar(String(v.gym || ""));
                    const esMismoGym = vGymNorm === gymNormExacto;
                    
                    // Año y mes exactos
                    const esMismaFecha = (v.año === añoVistaActual && v.mes === m);
                    
                    // Motivo: debe contener "preventivo" o "mp", o venir del Sheet (motivo vacío)
                    const stringMotivo = String(v.motivo || "").toLowerCase();
                    const tienePreventivo = stringMotivo.includes("preventivo") || 
                                           stringMotivo.includes(" mp") ||
                                           stringMotivo === "mantenimiento preventivo";
                    
                    return esMismoGym && esMismaFecha && tienePreventivo;
                });
                
                if (visitasMes.length > 0) { 
                    // Días únicos ordenados
                    const dias = [...new Set(visitasMes.map(v => v.dia))]
                        .filter(d => d >= 1 && d <= 31)
                        .sort((a,b) => a - b)
                        .join(", "); 
                    html += `<td class="cell-visit" title="Visita el día ${dias}">${dias}</td>`; 
                } else { 
                    const tipo = getTipoCasillero(cliente.freq, cliente.nombre, m, cliente.mesInicio); 
                    if (tipo === "BLACK") html += `<td class="cell-black"></td>`; 
                    else if (tipo === "B") html += `<td class="cell-b">B</td>`; 
                    else if (tipo === "T") html += `<td class="cell-t">T</td>`; 
                    else html += `<td></td>`; 
                } 
            } 
            html += `</tr>`; 
        }); 
        html += `</tbody></table></div></div>`; 
    }); 
    
    document.getElementById('contenido-registro').innerHTML = html; 
}
function cerrarRegistro() { const modal = document.getElementById('modalRegistro'); modal.classList.remove('mostrar'); setTimeout(() => { modal.style.display = 'none'; }, 300); }
function mostrarStatus(mensaje, tipoClase) { const statusDiv = document.getElementById("status"); statusDiv.innerHTML = mensaje; statusDiv.className = "status mostrar " + tipoClase; }

function validarYEnviar() {
    document.getElementById("status").className = "status"; document.getElementById("tecnico").classList.remove("error-input"); document.getElementById("buscador").classList.remove("error-input"); document.getElementById("otroGimnasio").classList.remove("error-input"); document.getElementById("card-motivo").style.border = "none";
    const tecnico = document.getElementById("tecnico").value.trim(); const buscadorVal = document.getElementById("buscador").value.trim(); const otroGimVal = document.getElementById("otroGimnasio").value.trim(); const gimnasioCompleto = buscadorVal || otroGimVal; const algunMotivoTildado = document.querySelectorAll(".motivo:checked").length > 0; const otroMotivoEscrito = document.getElementById("otroMotivo").value.trim() !== "";
    let errores = []; if (!tecnico) { errores.push("Técnico"); document.getElementById("tecnico").classList.add("error-input"); } if (buscadorVal !== "" && otroGimVal !== "") { errores.push("Elegí de la lista O escribí uno nuevo"); document.getElementById("buscador").classList.add("error-input"); document.getElementById("otroGimnasio").classList.add("error-input"); } else if (!gimnasioCompleto) { errores.push("Gimnasio"); document.getElementById("buscador").classList.add("error-input"); document.getElementById("otroGimnasio").classList.add("error-input"); } if (!algunMotivoTildado && !otroMotivoEscrito) { errores.push("Motivo"); document.getElementById("card-motivo").style.border = "2px solid #d93025"; }
    if (errores.length > 0) { mostrarStatus("⚠️ Error: " + errores.join(", "), "error"); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; } enviarFormulario();
}

function obtenerUbicacion() { return new Promise((resolve) => { if (!navigator.geolocation) { resolve({ lat: "No soportado", lng: "No soportado" }); return; } navigator.geolocation.getCurrentPosition( (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), (err) => resolve({ lat: "Sin permiso", lng: "Sin permiso" }), { timeout: 5000 } ); }); }

function leerYComprimirArchivoAsincrono(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.match(/image.*/)) {
            let reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject; reader.readAsDataURL(file);
            return;
        }
        
        let reader = new FileReader();
        reader.onload = (readerEvent) => {
            let img = new Image();
            img.onload = () => {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                let MAX_WIDTH = 1200; let MAX_HEIGHT = 1200; let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
                canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
                let dataUrl = canvas.toDataURL('image/jpeg', 0.6); 
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = reject; img.src = readerEvent.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
    });
}

let enviandoFormulario = false; // Candado anti-duplicados

async function enviarFormulario() {
    if (enviandoFormulario) return; 
    enviandoFormulario = true;

    const btnEnviar = document.getElementById("btnEnviar"); 
    btnEnviar.disabled = true; 
    localStorage.setItem("tecnico", document.getElementById("tecnico").value.trim()); 
    mostrarStatus("Obteniendo ubicación... 📍", "cargando"); 
    
    const ubicacion = await obtenerUbicacion(); 
    
    const gymFinal = document.getElementById("buscador").value.trim() || document.getElementById("otroGimnasio").value.trim(); 
    const esNuevoGimnasio = !gimnasios.some(g => normalizar(g) === normalizar(gymFinal));
    
    let valReparacion = document.querySelector('input[name="reparacion"]:checked') ? document.querySelector('input[name="reparacion"]:checked').value : "";

    // ─── CORRECCIÓN CRÍTICA: COMPRIMIR Y EMPAQUETAR FOTOS ───
    mostrarStatus("Comprimiendo fotos... 📸", "cargando");
    const archivosProcesados = [];
    if (window.archivosSeleccionados && window.archivosSeleccionados.length > 0) {
        for (let i = 0; i < window.archivosSeleccionados.length; i++) {
            let file = window.archivosSeleccionados[i];
            try {
                let base64 = await leerYComprimirArchivoAsincrono(file);
                archivosProcesados.push({
                    name: file.name || `foto_adjunta_${i}.jpg`,
                    mimeType: file.type || 'image/jpeg',
                    base64Data: base64
                });
            } catch (err) {
                console.warn("No se pudo comprimir la foto", err);
            }
        }
    }
    
    mostrarStatus("Preparando envío... ⏳", "cargando");
    
    const data = { 
        tecnico: document.getElementById("tecnico").value.trim(), 
        gimnasio: gymFinal, 
        esNuevoGimnasio: esNuevoGimnasio, 
        motivos: Array.from(document.querySelectorAll(".motivo:checked")).map(e => e.value).join(", "), 
        otroMotivo: document.getElementById("otroMotivo").value.trim(), 
        reparacion: valReparacion, 
        lat: ubicacion.lat, 
        lng: ubicacion.lng, 
        archivos: archivosProcesados,
        // ID único para este intento de envío — el backend lo usa para detectar duplicados.
        // Si el mismo formulario llega dos veces (timeout + reenvío offline), el backend
        // devuelve el resultado original sin insertar una segunda fila.
        _submitId: (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2)
    };
    
    const guardarLocal = async () => { 
        try { 
            await guardarOfflineBD(data); 
            mostrarStatus("Sin conexión. Guardado en el teléfono. 📡", "exito"); 
            setTimeout(() => reiniciarFormulario(), 3000); 
        } catch (e) { 
            mostrarStatus("Error crítico al guardar.", "error"); 
        } finally {
            enviandoFormulario = false; btnEnviar.disabled = false;
        }
    };

    if (!navigator.onLine) { guardarLocal(); return; }
    
    // Timeout mayor cuando hay fotos (GAS puede tardar 20-30s procesando imágenes)
    const timeoutEnvio = archivosProcesados.length > 0 ? 50000 : 20000;
    mostrarStatus("Enviando datos a la nube... ☁️", "cargando");

    llamarAPI({ accion: "procesarYGuardarTodo", payload: data }, timeoutEnvio)
        .then((respuesta) => {
            // Éxito: limpiar el flag anti-duplicado
            localStorage.removeItem('_ultimo_envio_hash');
            const numR = (respuesta.match(/R-\d+/) || [''])[0];
            const msgFinal = numR
                ? `✅ Visita registrada correctamente (Registro ${numR})`
                : `✅ ${respuesta}`;
            mostrarStatus(msgFinal, "exito");
            reiniciarFormulario();
        })
        .catch((error) => {
            if (error.name === 'AbortError' || error.message.includes('tardó')) {
                // ⚠️ TIMEOUT: el servidor puede que SÍ haya guardado el registro
                // Mostrar advertencia para evitar que el usuario reenvíe y duplique
                mostrarStatus(
                    "⚠️ La conexión tardó demasiado. " +
                    "El registro PUEDE estar guardado. " +
                    "Verificá el historial antes de reintentar.",
                    "error"
                );
                // Guardar localmente también por si no se guardó
                guardarOfflineBD(data).catch(() => {});
            } else if (error.message.includes("Failed to fetch") || error.message.includes("Network")) {
                guardarLocal();
            } else {
                mostrarStatus("❌ " + (error.message || "Error al guardar."), "error");
            }
        })
        .finally(() => {
            enviandoFormulario = false;
            btnEnviar.disabled = false;
        });
}

let estaSincronizando = false;

async function sincronizarOffline() { 
    if (!navigator.onLine || estaSincronizando) return; 
    
    estaSincronizando = true; // 🔒 Bloquea intentos paralelos
    
    try {
        if (!db) await initDB();
        let pendientes = await obtenerPendientesBD();
        
        if (pendientes.length > 0) { 
            mostrarStatus(`☁️ Enviando ${pendientes.length} registro(s) pendiente(s)...`, "cargando"); 
            
            // Envía de a UNO por vez. Si falla, corta y deja el resto para después.
            for (let i = 0; i < pendientes.length; i++) {
                let item = pendientes[i];
                // Timeout mayor si el registro offline tiene fotos adjuntas
                const tOut = (item.data.archivos && item.data.archivos.length > 0) ? 60000 : 20000;
                await llamarAPI({ accion: "procesarYGuardarTodo", payload: item.data }, tOut);
                await eliminarPendienteBD(item.id); // Solo lo borra si Google dice "Ok"
            }
            
            mostrarStatus("Registros pendientes sincronizados con éxito ✅", "exito"); 
            setTimeout(() => { document.getElementById("status").className = "status"; }, 3000); 
            cargarPanelHistorial(); 
        } else {
            let contenedor = document.getElementById('contenedor-meses');
            if(contenedor && contenedor.innerHTML.includes("Error de red")) cargarPanelHistorial();
        }
    } catch (error) {
        mostrarStatus("Conexión inestable. Se reintentará en breve.", "error"); 
        actualizarDotConexion(true); // Enciende la luz roja
    } finally {
        estaSincronizando = false;
    }
}

function reiniciarFormulario() { 
    document.getElementById("visitaForm").reset(); 
    window.archivosSeleccionados = []; 
    if (window._renderizarFotos) window._renderizarFotos(window.archivosSeleccionados);
    mostrarLista([], false); 
    document.getElementById("ghost").innerHTML = ""; 
    
    let savedTecnico = localStorage.getItem("tecnico"); 
    if (savedTecnico) document.getElementById("tecnico").value = savedTecnico; 
    
    document.getElementById("tecnico").classList.remove("error-input"); 
    document.getElementById("buscador").classList.remove("error-input"); 
    document.getElementById("otroGimnasio").classList.remove("error-input"); 
    document.getElementById("card-motivo").style.border = "none"; 
    
    // Limpieza de etiquetas personalizadas de motivos
    if (typeof otrosMotivosArray !== 'undefined') {
        otrosMotivosArray = [];
        if (typeof actualizarUIOtrosMotivos === 'function') {
            actualizarUIOtrosMotivos();
        }
    }
    localStorage.removeItem('borrador_otros_motivos');

    cargarPanelHistorial(); 
    if (typeof actualizarProgress === 'function') actualizarProgress(); // Reinicia los puntitos verdes de pasos
    
    setTimeout(() => { 
        document.getElementById("btnEnviar").disabled = false; 
        document.getElementById("status").className = "status"; 
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    }, 5000); 
}
// ============================================================
//   SISTEMA DE "OTROS MOTIVOS" MÚLTIPLES (ETIQUETAS)
// ============================================================
let otrosMotivosArray = [];

function agregarOtroMotivo() {
    const input = document.getElementById('input-otro-motivo');
    const texto = input.value.trim();
    if (texto) {
        otrosMotivosArray.push(texto);
        input.value = '';
        actualizarUIOtrosMotivos();
    }
}

function eliminarOtroMotivo(index) {
    otrosMotivosArray.splice(index, 1);
    actualizarUIOtrosMotivos();
}

function editarOtroMotivo(index) {
    const input = document.getElementById('input-otro-motivo');
    // Pasamos el texto de vuelta al input para editarlo
    input.value = otrosMotivosArray[index]; 
    // Lo sacamos de la lista temporal
    otrosMotivosArray.splice(index, 1); 
    actualizarUIOtrosMotivos();
    input.focus();
}

function actualizarUIOtrosMotivos() {
    const contenedor = document.getElementById('contenedor-otros-motivos');
    const hiddenInput = document.getElementById('otroMotivo');
    contenedor.innerHTML = '';
    
    otrosMotivosArray.forEach((motivo, index) => {
        const div = document.createElement('div');
        div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #e8f0fe; padding: 10px 14px; border-radius: 8px; border-left: 4px solid #1a73e8;";
        div.innerHTML = `
            <span style="font-size: 14px; color: #1a73e8; font-weight: bold; flex: 1; word-break: break-word; padding-right: 10px;">${motivo}</span>
            <div style="display: flex; gap: 15px; flex-shrink: 0;">
                <span onclick="editarOtroMotivo(${index})" style="font-size: 16px; cursor: pointer;" title="Editar">✏️</span>
                <span onclick="eliminarOtroMotivo(${index})" style="color: #d93025; font-size: 16px; cursor: pointer; font-weight:bold;" title="Eliminar">✖</span>
            </div>
        `;
        contenedor.appendChild(div);
    });

    // Actualizamos el input oculto uniéndolos con el signo "+" (Para que llegue perfecto a Google Sheets)
    hiddenInput.value = otrosMotivosArray.join(" + ");
    
    // Guardar borrador local
    localStorage.setItem('borrador_otros_motivos', JSON.stringify(otrosMotivosArray));
}
window.addEventListener('DOMContentLoaded', () => {
    const formContacto = document.getElementById('form-contacto');
    
    if (formContacto) {
        formContacto.addEventListener('submit', async function(e) {
            e.preventDefault(); // Evita que la página salte a la web de Formspree
            
            const status = document.getElementById('status-contacto');
            const btn = formContacto.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            
            // Estado de "Cargando"
            btn.innerText = 'Enviando... ⏳';
            btn.disabled = true;
            status.style.display = 'none';

            try {
                // Enviamos los datos por detrás usando Fetch
                const response = await fetch(formContacto.action, {
                    method: formContacto.method,
                    body: new FormData(formContacto),
                    headers: { 'Accept': 'application/json' }
                });
                
                if (response.ok) {
                    // ÉXITO: Mostramos cartel verde y limpiamos los campos
                    status.style.display = 'block';
                    status.style.background = '#e6f4ea';
                    status.style.color = '#0b7a42';
                    status.style.border = '1px solid #a8d5b5';
                    status.innerText = '✅ ¡Consulta enviada con éxito! Nos contactaremos pronto.';
                    formContacto.reset();
                } else {
                    throw new Error('Error en el servidor de Formspree');
                }
            } catch(err) {
                // ERROR: Mostramos cartel rojo
                status.style.display = 'block';
                status.style.background = '#fce8e6';
                status.style.color = '#d93025';
                status.style.border = '1px solid #f28b82';
                status.innerText = '❌ Hubo un error al enviar. Intentá de nuevo.';
            } finally {
                // Restauramos el botón a la normalidad
                btn.innerText = originalText;
                btn.disabled = false;
                
                // Ocultamos el cartel de éxito después de 5 segundos
                setTimeout(() => { 
                    status.style.display = 'none'; 
                }, 5000);
            }
        });
    }
});

// =========================================================================
// 🔥 FORZAR ACTUALIZACIÓN DEL HISTORIAL (CUANDO SE EDITA EL EXCEL A MANO) 🔥
// =========================================================================
function forzarRefreshHistorial() {
    const titulo = document.getElementById('modal-titulo');
    if(titulo) titulo.innerHTML = 'Actualizando... ⏳';
    
    // Recargar historial principal + Historial Anual + Cronograma desde Sheet
    Promise.all([
        llamarAPI({ accion: "obtenerRegistroHistorico", payload: { forzar: true } }),
        llamarAPI({ accion: "obtenerCronogramaDesdeSheet" }).catch(() => ({ zonas: [], historial: [] }))
    ]).then(([datosViejos, resultadoAnual]) => {
        let combined = [...(datosViejos || [])];
        const datosNuevos = (resultadoAnual && resultadoAnual.historial) || [];
        datosNuevos.forEach(n => {
            let exists = combined.some(v => v.gym === n.gym && v.año === n.año && v.mes === n.mes && v.dia === n.dia);
            if (!exists) combined.push(n);
        });
        procesarHistorialCargado(combined);

        // Actualizar cronograma dinámico
        if (resultadoAnual && resultadoAnual.zonas && resultadoAnual.zonas.length > 0) {
            cronogramaZonasDinamico = resultadoAnual.zonas;
        }
        
        renderizarGrillaAnual();
    }).catch(() => {
        if(titulo) titulo.innerHTML = 'Error de red ❌';
    });
}