console.info('[inf-docs] build 2026-09-30 · Notas de crédito / Ver PDF doble');
// ── inf-docs.js — Documentos, ítems, PDF y correo ─────────────

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
            numFactura: idEditando ? (documentosGuardados.find(i => i.id === idEditando)?.numFactura || "") : "",
            // FIX: presupuestos creados manualmente siempre son Reparacion
            tipoDoc: "Reparacion",
            remito: idEditando ? (documentosGuardados.find(i => i.id === idEditando)?.remito || "") : ""
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

        // Usar el id que ya tenemos en el payload (el backend devuelve string, no objeto con id)
        const nuevoId = payloadDoc.datos.id;
        const accesoPDF = document.getElementById('acceso-rapido-pdf');
        const btnPDF    = document.getElementById('btn-rapido-pdf');
        const btnMail   = document.getElementById('btn-rapido-mail');
        if (accesoPDF && nuevoId) {
            accesoPDF.style.display = 'block';
            if (btnPDF)  btnPDF.onclick  = (e) => abrirVistaPresupuesto(nuevoId, e.currentTarget);
            if (btnMail) btnMail.onclick = () => prepararMail(nuevoId);
        }
        setTimeout(() => switchTab('creados'), 1500);
    } catch (e) {
        const msg = e?.message || String(e) || 'Error desconocido';
        // [debug removed] console.error('guardarDocumento error:', e...)
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
// 🔥 ACTUALIZACIÓN: Hace que la carga de "Ver Guardados" sea INSTANTÁNEA
async function obtenerYRenderizarCreados(forzarRecarga = false) {
    const contenedor = document.getElementById('contenedor-informes-creados');
    if (!contenedor) return;

    const hojaReq = modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS;

    // Los documentos en memoria deben ser de la hoja del modo actual; si no, se descartan.
    // (Evita mostrar datos de "Ofertas" dentro de "Presupuestos" o al revés.)
    if (!forzarRecarga && window._hojaDocsCargada !== hojaReq) {
        const pre = window._docsPorHoja && window._docsPorHoja[hojaReq];
        if (pre && pre.length) { documentosGuardados = pre; window._hojaDocsCargada = hojaReq; }
        else documentosGuardados = [];
    }

    // Si no tenemos documentos o forzamos recarga, pedimos al servidor
    if (forzarRecarga || !documentosGuardados || documentosGuardados.length === 0) {
        contenedor.innerHTML = `
            <div style="padding:12px 0;">
                ${[1,2,3].map(() => `
                <div style="background:var(--inf-card,rgba(255,255,255,0.03)); border-radius:14px; padding:16px; margin-bottom:10px; border:1px solid var(--inf-border,rgba(255,255,255,0.06));">
                    <div class="inf-skeleton inf-skeleton-line inf-skeleton-line--medium" style="margin-bottom:10px;"></div>
                    <div class="inf-skeleton inf-skeleton-line inf-skeleton-line--short"></div>
                </div>`).join('')}
            </div>`;

        try {
            const docsNuevos = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: hojaReq } });
            // Si mientras tanto cambió el modo, esta respuesta ya no corresponde a lo que se está viendo
            const hojaAhora = modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS;
            window._docsPorHoja = window._docsPorHoja || {};
            window._docsPorHoja[hojaReq] = docsNuevos;
            if (hojaAhora !== hojaReq) return;
            documentosGuardados = docsNuevos;
            window._hojaDocsCargada = hojaReq;
            _invalidarCuitSet();
        } catch(e) {
            const esRedeploy = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));
            const mensajeError = esRedeploy
                ? 'Sin conexión con el servidor de Google. Verificá tu internet.'
                : (e.message || 'Error desconocido');

            contenedor.innerHTML = `
                <div style="padding:24px 20px; text-align:center; background:var(--inf-rojo-lt,#fce8e6);
                     border-radius:14px; border:1px solid rgba(217,48,37,0.3); margin-top:8px;">
                    <div style="font-size:28px; margin-bottom:10px;">🔌</div>
                    <div style="font-weight:900; font-size:15px; color:#d93025; margin-bottom:6px;">Error de conexión</div>
                    <div style="font-size:13px; color:#5f6368; margin-bottom:16px; font-family:monospace; background:rgba(0,0,0,0.05);
                         padding:8px 12px; border-radius:8px; text-align:left; word-break:break-all;">
                        ${mensajeError}
                    </div>
                    <div style="font-size:13px; color:#475467; margin-bottom:16px; text-align:left; line-height:1.7;">
                        <b>Causas comunes:</b><br>
                        1️⃣ El Apps Script no está desplegado como <b>"Acceso: Cualquier persona"</b><br>
                        2️⃣ Agregaste funciones nuevas al Backend y no lo <b>volviste a desplegar</b><br>
                        3️⃣ La URL del script en <code>API_URL</code> es incorrecta
                    </div>
                    <button onclick="obtenerYRenderizarCreados(true)"
                            style="background:#1a73e8; color:white; border:none; padding:12px 24px;
                                   border-radius:10px; font-weight:900; font-size:14px; cursor:pointer;">
                        🔄 Reintentar
                    </button>
                </div>`;
            return; // Cortar ejecución si falla
        }
    }
    
    // Si ya teníamos los datos precargados, los dibuja instantáneamente
    renderizarTarjetas();
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
let filtroPagoActual = 'Todos';   // ← inicia mostrando TODO (antes: 'Pendiente')
let filtroMesActual = 'Todos';

function setFiltroPago(valor) {
    // Normalizar: el nuevo HTML pasa 'pendiente','pagado','todos' en minúsculas
    const map = { pendiente: 'Pendiente', pagado: 'Pagado', todos: 'Todos' };
    filtroPagoActual = map[valor.toLowerCase()] || valor;
    renderizarTarjetas();
}
function setFiltroMes(valor) { filtroMesActual = valor; renderizarTarjetas(); }

// ── Debounce para el buscador (evita renderizar en cada tecla) ───
let _searchTimer = null;
function _debounceSearch(val) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        window._paginaDocsActual = 0;  // reset a página 1 en nueva búsqueda
        renderizarTarjetas();
    }, 280);  // 280ms — suficiente para no percibir el delay
}
 
let filtroTipoActual = 'todos'; // 'todos' | 'abono' | 'reparacion' | 'sin_desc'
 
function setFiltroTipo(valor) {
    filtroTipoActual = valor;
    window._paginaDocsActual = 0;
    renderizarTarjetas();
}
//////////////////////////////////////
let _cuitSetAbonos = null;
function _getCuitSetAbonos() {
    // No cachear si la lista todavía no cargó — así el próximo render lo intenta de nuevo
    if (_cuitSetAbonos && _cuitSetAbonos.size > 0) return _cuitSetAbonos;
    _cuitSetAbonos = new Set();
    if (typeof listaAbonosBase !== 'undefined' && listaAbonosBase.length > 0) {
        listaAbonosBase.forEach(a => {
            const c = String(a.cuit || '').replace(/\D/g, '');
            if (c.length >= 8) _cuitSetAbonos.add(c);
        });
    }
    // Si quedó vacío, no guardar caché para que se reintente
    if (_cuitSetAbonos.size === 0) _cuitSetAbonos = null;
    return _cuitSetAbonos || new Set();
}
// Invalidar el set cuando se recarguen los abonos
function _invalidarCuitSet() { _cuitSetAbonos = null; }
 ////////////////////////////////////
 
/**
 * Clasifica un documento en:
 *   'abono'          → mantenimiento preventivo mensual
 *   'reparacion'     → reparación con descripción manual
 *   'presup_enviado' → presupuesto enviado al cliente (en proceso de aprobación)
 *   'sin_desc'       → importado de ARCA sin identificar
 *
 * PRIORIDAD (de mayor a menor):
 * 1. Si el CUIT está en Base Abonos → SIEMPRE es abono (más confiable que tipoDoc)
 * 2. Si la descripción dice "mantenimiento preventivo" → abono
 * 3. tipoDoc del backend → para distinguir presup_enviado vs reparacion
 * 4. Heurística por estado y descripción
 */
/**
 * Clasifica un documento con UNA SOLA REGLA DETERMINISTA:
 *
 *   Si el CUIT del documento existe en Base Abonos  → 'abono'
 *   Si no existe                                    → 'reparacion' o 'presup_enviado'
 *
 * No hay heurísticas por nombre ni por descripción.
 * La única fuente de verdad es Base Abonos (listaAbonosBase).
 *
 * Excepción: si el estado es "Enviado" y NO es abono → 'presup_enviado'
 */
/**
 * Clasifica un documento con prioridad en la selección manual de tipoDoc.
 * Si no posee una selección explícita, recurre a las reglas deterministas de la Base de Abonos.
 */
function clasificarDocumento(doc) {
    // ── PRIORIDAD MÁXIMA: Selector manual ──
    if (doc.tipoDoc) {
        const tipo = doc.tipoDoc.toLowerCase();
        if (tipo.includes('abono')) return 'abono';
        if (tipo.includes('reparaci')) return 'reparacion';
    }

    const estado = (doc.estado || '').toLowerCase().trim();

    // ── REGLA SECUNDARIA: CUIT ──
    if (doc.cuit) {
        const cuitDoc = String(doc.cuit).replace(/\D/g, '');
        if (cuitDoc.length >= 8) {
            const setAbonos = _getCuitSetAbonos();
            if (setAbonos.size > 0 && setAbonos.has(cuitDoc)) {
                return 'abono';
            }
        }
    }

    // ── POR DEFECTO ──
    return 'reparacion';
}
 
 
/**
 * Badge HTML del tipo de documento.
 * NUEVO: el badge 'abono' distingue entre identificado por descripción
 * o solo por CUIT (muestra "📅 Abono (por CUIT)" en el segundo caso).
 */
function badgeTipoDoc(tipo, doc) {
    // Detectar si el abono fue identificado por CUIT...
    let esPorCuit = false;
    if (tipo === 'abono' && doc) {
        const descs = (doc.items || []).map(i => String(i.desc || '').toLowerCase());
        const tieneDescExplicita = descs.some(d => d.includes('mantenimiento preventivo'));
        esPorCuit = !tieneDescExplicita;
    }
 
    const conf = {
        abono: {
            label: esPorCuit ? '📅 Abono (CUIT)' : '📅 Abono',
            bg:    '#1e3a5f',
            color: '#60a5fa',
            border:'rgba(96,165,250,0.3)',
            title: esPorCuit
                ? 'Identificado como Abono por coincidencia de CUIT con Base Abonos'
                : 'Mantenimiento Preventivo identificado en la descripción'
        },
        reparacion: {
            label: '🔧 Reparación',
            bg:    '#1a3520',
            color: '#4ade80',
            border:'rgba(74,222,128,0.3)',
            title: 'Presupuesto de reparación con detalle manual'
        },
        // FIX 2: nuevo tipo para presupuestos enviados al cliente
        presup_enviado: {
            label: '📤 Presup. Enviado',
            bg:    '#2d1f4e',
            color: '#c084fc',
            border:'rgba(192,132,252,0.35)',
            title: 'Presupuesto enviado al cliente — en proceso de aprobación'
        },
        sin_desc: {
            label: '⚠️ Sin CUIT',
            bg:    '#3d2500',
            color: '#fb923c',
            border:'rgba(251,146,60,0.4)',
            title: 'Reparación sin CUIT verificable — no se puede confirmar si es abono o reparación'
        },
    };
    const c = conf[tipo] || conf['sin_desc'];
    const docId = doc ? doc.id : 'temp'; // Aseguramos que tenga un ID

    // 🔥 AGREGAMOS id="badge-tipo-${docId}" AL SPAN 🔥
    return `<span id="badge-tipo-${docId}" title="${c.title}"
        style="background:${c.bg}; color:${c.color}; border:1px solid ${c.border};
               padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;
               letter-spacing:0.3px; white-space:nowrap; flex-shrink:0; cursor:help;">
        ${c.label}
    </span>`;
}

// ════════════════════════════════════════════════════════════════
//  Estado operativo simplificado: Facturado / Anulado
//  ("Cancelada (NC)" lo escribe el backend al detectar una Nota de Crédito)
// ════════════════════════════════════════════════════════════════
function _estadoOperativo(doc) {
    const e = String(doc.estado || '').toLowerCase();
    if (/anulad|cancelad/.test(e)) return 'anulado';
    if (e.startsWith('facturado')) return 'facturado';
    return 'sinfacturar'; // estados viejos (Pendiente / Enviado)
}

// ════════════════════════════════════════════════════════════════
//  📄 VER PDF — busca la factura en la carpeta Drive "Facturas Support"
//  por número de factura y la muestra como vista previa.
// ════════════════════════════════════════════════════════════════
// ── Caché de PDFs (en memoria): la 2ª vez que se abre una factura es instantáneo ──
const _pdfCache    = new Map();   // clave -> { res, url }   (url = blob: ya decodificado)
const _pdfPromesas = new Map();   // clave -> Promise en vuelo (evita pedir dos veces lo mismo)
const _PDF_CACHE_MAX = 16;

// "ANULADA B-4240" -> "B-4240"  (el backend marca así las facturas anuladas por nota de crédito)
function _numFacturaLimpio(n) { return String(n || '').trim().replace(/^ANULADA\s+/i, ''); }
function _esAnulado(doc) { return _estadoOperativo(doc) === 'anulado'; }

function _base64ABlobUrl(b64, mime) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime || 'application/pdf' }));
}

// Carga (con caché) el PDF de un comprobante por su número: "B-4240" o "NC B-0203"
function _cargarPDFPorNumero(num, cuit, fileId) {
    const clave = String(num).trim() + '|' + (fileId || '');
    if (_pdfCache.has(clave))    return Promise.resolve(_pdfCache.get(clave));
    if (_pdfPromesas.has(clave)) return _pdfPromesas.get(clave);

    const p = llamarAPI({
        accion: 'obtenerFacturaPDFDrive',
        payload: { numFactura: String(num).trim(), cuit: cuit || '', fileId: fileId || '' }
    }, 60000).then(res => {
        if (!res || !res.ok) throw new Error((res && res.error) || 'No se pudo obtener el comprobante.');
        const entry = { res, url: _base64ABlobUrl(res.seleccionado.base64, res.seleccionado.mime) };
        res.seleccionado.base64 = null;                       // liberar memoria: ya tenemos el blob
        _pdfCache.set(clave, entry);
        if (_pdfCache.size > _PDF_CACHE_MAX) {                // descartar el más viejo
            for (const [k, v] of _pdfCache) {
                if (k === clave) continue;
                URL.revokeObjectURL(v.url); _pdfCache.delete(k); break;
            }
        }
        return entry;
    }).finally(() => _pdfPromesas.delete(clave));

    _pdfPromesas.set(clave, p);
    return p;
}

function _cargarPDFFactura(doc, fileId) {
    return _cargarPDFPorNumero(_numFacturaLimpio(doc.numFactura), doc.cuit, fileId);
}
// Devuelve null si el documento no tiene nota de crédito asociada
function _cargarPDFNotaCredito(doc) {
    const nc = String(doc.numNC || '').trim();
    return nc ? _cargarPDFPorNumero(nc, doc.cuit, '') : null;
}

// Se llama al expandir la tarjeta / pasar el mouse por "Ver PDF": empieza a bajar los PDFs antes del clic
function precargarPDFFactura(id) {
    try {
        const doc = documentosGuardados.find(d => String(d.id) === String(id));
        if (!doc || !/\d{4}/.test(String(doc.numFactura || ''))) return;
        _cargarPDFFactura(doc).catch(() => {});                // silencioso: el error real se muestra al hacer clic
        const pn = _cargarPDFNotaCredito(doc);
        if (pn) pn.catch(() => {});
    } catch (e) {}
}

// ════════════════════════════════════════════════════════════════
//  📄 VER PDF — factura (y su nota de crédito si fue anulada) desde Drive "Facturas Support"
// ════════════════════════════════════════════════════════════════
async function verPDFFactura(id, btnEl, fileId) {
    const doc = documentosGuardados.find(d => String(d.id) === String(id));
    if (!doc) { mostrarMensaje('❌ Documento no encontrado.', 'error'); return; }

    if (!/\d{4}/.test(_numFacturaLimpio(doc.numFactura))) {
        mostrarMensaje('⚠️ Este documento no tiene número de factura cargado.', 'error');
        return;
    }

    const textoOriginal = btnEl ? btnEl.innerHTML : '';
    let reloj = null;
    if (btnEl) {
        btnEl.disabled = true;
        const t0 = Date.now();
        const pintar = () => { btnEl.innerHTML = `<span class="spinner-mini"></span> Buscando… ${Math.floor((Date.now() - t0) / 1000)}s`; };
        pintar();
        reloj = setInterval(pintar, 1000);
    }

    try {
        // Factura y nota de crédito se piden EN PARALELO (y desde caché si ya estaban)
        const pF = _cargarPDFFactura(doc, fileId);
        const pN = _cargarPDFNotaCredito(doc);
        const envolver = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, e }));
        const [rF, rN] = await Promise.all([envolver(pF), pN ? envolver(pN) : Promise.resolve(null)]);

        if (!rF.ok && !(rN && rN.ok)) throw rF.e;             // no hay nada para mostrar
        _mostrarVisorFactura(doc, rF.ok ? rF.v : null, rN && rN.ok ? rN.v : null,
            { errFactura: rF.ok ? '' : rF.e.message, errNC: (rN && !rN.ok) ? rN.e.message : '' });
    } catch (e) {
        mostrarMensaje('❌ ' + e.message, 'error');
    } finally {
        if (reloj) clearInterval(reloj);
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = textoOriginal; }
    }
}

function _visorSeleccionar(i) {
    const items = window._visorItems || [];
    const it = items[i];
    if (!it) return;
    const sel = it.entry.res.seleccionado;
    const $ = id => document.getElementById(id);
    if ($('_visor-iframe'))  $('_visor-iframe').src = it.entry.url + '#toolbar=1&navpanes=0&view=FitH';
    if ($('_visor-nombre'))  $('_visor-nombre').textContent = sel.name;
    if ($('_visor-drive'))   $('_visor-drive').href = sel.driveUrl;
    window._visorUrlActual = it.entry.url;
    document.querySelectorAll('#_visor-factura .visor-tab').forEach((b, k) => b.classList.toggle('activo', k === i));
}

function _mostrarVisorFactura(doc, entryF, entryN, avisos) {
    document.getElementById('_visor-factura')?.remove();
    avisos = avisos || {};

    const items = [];
    if (entryF) items.push({ tab: '📄 Factura ' + _numFacturaLimpio(doc.numFactura), entry: entryF });
    if (entryN) items.push({ tab: '🔄 Nota de Crédito ' + String(doc.numNC || '').replace(/^NC\s*/i, ''), entry: entryN });
    window._visorItems = items;

    const selF = entryF ? entryF.res.seleccionado : null;
    const otros = (entryF && (entryF.res.archivos || []).length > 1)
        ? `<div style="display:flex; gap:6px; flex-wrap:wrap; padding:8px 14px; background:#111827;">
              <span style="font-size:12px; color:#fbbf24; font-weight:700; align-self:center;">Hay ${entryF.res.archivos.length} archivos parecidos:</span>
              ${entryF.res.archivos.map(a => `
                  <button onclick="verPDFFactura(${doc.id}, null, '${a.id}')"
                          style="padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;
                                 border:1.5px solid #60a5fa; color:${a.id===selF.id?'white':'#60a5fa'};
                                 background:${a.id===selF.id?'#1a73e8':'transparent'};">${a.name}</button>`).join('')}
           </div>` : '';

    const tabs = items.length > 1
        ? `<div class="visor-tabs">${items.map((it, i) =>
              `<button class="visor-tab ${i === 0 ? 'activo' : ''}" onclick="_visorSeleccionar(${i})">${it.tab}</button>`).join('')}</div>` : '';

    const aviso = (avisos.errNC || avisos.errFactura)
        ? `<div style="padding:7px 14px; background:#3d2500; color:#fdba74; font-size:12px; font-weight:700;">
              ⚠️ ${avisos.errFactura ? 'Factura: ' + avisos.errFactura : 'Nota de crédito: ' + avisos.errNC}</div>` : '';

    const ov = document.createElement('div');
    ov.id = '_visor-factura';
    ov.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; padding:12px;';
    ov.innerHTML = `
        <div style="background:#0f172a; border-radius:14px; width:100%; max-width:900px; height:94vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:#1e293b;">
                <div style="flex:1; min-width:0;">
                    <div id="_visor-nombre" style="font-weight:800; font-size:14px; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                    <div style="font-size:11px; color:#94a3b8;">${doc.cliente} · ${doc.numFactura}</div>
                </div>
                <button onclick="window.open(window._visorUrlActual,'_blank')" style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:transparent; color:#e2e8f0; font-weight:700; font-size:12px; cursor:pointer;">↗ Abrir</button>
                <a id="_visor-drive" href="#" target="_blank" rel="noopener" style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); color:#e2e8f0; font-weight:700; font-size:12px; text-decoration:none;">Drive</a>
                <button onclick="document.getElementById('_visor-factura').remove()" style="padding:8px 12px; border-radius:8px; border:none; background:#d93025; color:white; font-weight:900; font-size:12px; cursor:pointer;">✕ Cerrar</button>
            </div>
            ${tabs}
            ${aviso}
            ${otros}
            <iframe id="_visor-iframe" style="flex:1; width:100%; border:0; background:#525659;"></iframe>
        </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    _visorSeleccionar(0);
}

function renderizarTarjetas() {
    const contenedor = document.getElementById('contenedor-informes-creados');
    
    // 1. 🔥 MAGIA: RECUERDA QUÉ TARJETAS ESTABAN ABIERTAS ANTES DE BORRAR 🔥
    const tarjetasAbiertas = Array.from(contenedor.querySelectorAll('.doc-expand-v3.abierto'))
        .map(el => el.closest('.doc-card-v3').getAttribute('data-id'));

    contenedor.innerHTML = '';

    // 2. Auto-nombre por CUIT y parseo de fechas
    let cuitDic = JSON.parse(localStorage.getItem('cuitGlobalDic')) || {};
    documentosGuardados.forEach(d => {
        let clienteStr = String(d.cliente || "Sin Nombre");
        if (d.cuit && !clienteStr.includes("⚠️ IMPORTADO")) cuitDic[d.cuit] = clienteStr;
        d.fechaLimpia = limpiarFecha(d.fecha);
        const partes  = d.fechaLimpia.split('/');
        d.mesAnio     = partes.length === 3 ? `${partes[1]}/${partes[2]}` : "Sin Fecha";
        d._tipo = clasificarDocumento(d);
    });
    localStorage.setItem('cuitGlobalDic', JSON.stringify(cuitDic));
    documentosGuardados.forEach(d => {
        if (d.cuit && cuitDic[d.cuit]) d.cliente = cuitDic[d.cuit];
        d.cliente = String(d.cliente || "Sin Nombre");
    });

    // 3. Buscador
    const textoBuscado = (document.getElementById('buscador-global')?.value || "").toLowerCase().trim();
    let filtrados = documentosGuardados.filter(d => {
        let itemsStr  = d.items && Array.isArray(d.items) ? d.items.map(i => i.tipo + " " + i.desc).join(" ") : "";
        let numFactFix = String(d.numFactura || "");
        let tipoFacturaOculto = "";
        if (numFactFix.startsWith("NC ")) tipoFacturaOculto = `nota de credito ${numFactFix.replace("NC ", "")}`;
        else if (numFactFix.includes("-")) tipoFacturaOculto = `factura ${numFactFix}`;
        let busqueda = `${d.cliente} ${d.cuit} ${d.fechaLimpia} ${d.total} ${numFactFix} ${tipoFacturaOculto} ${itemsStr}`.toLowerCase();
        return textoBuscado.split(" ").every(p => busqueda.includes(p));
    });

    // 4. Meses y filtros
    let mesesSet = new Set();
    filtrados.forEach(d => mesesSet.add(d.mesAnio));
    let mesesArr = Array.from(mesesSet).sort((a, b) => {
        if (a === "Sin Fecha") return 1; if (b === "Sin Fecha") return -1;
        let [ma, ya] = a.split('/'); let [mb, yb] = b.split('/');
        return new Date(yb, mb-1) - new Date(ya, ma-1);
    });

    if (filtroMesActual !== 'Todos' && !mesesSet.has(filtroMesActual)) filtroMesActual = 'Todos';

    // 5. Aplicar filtros (pago + mes + TIPO)
    let finales = filtrados.filter(d => {
        const pagadoNorm = String(d.pagado || '').trim();
        // Una factura anulada (nota de crédito) no es ni "pendiente" ni "pagada": solo se ve en "Todos"
        const matchPago = _esAnulado(d)
            ? (filtroPagoActual === 'Todos')
            : (filtroPagoActual === 'Todos'
               || pagadoNorm === filtroPagoActual
               || pagadoNorm.toLowerCase() === filtroPagoActual.toLowerCase());
        const matchMes  = (filtroMesActual  === 'Todos' || d.mesAnio === filtroMesActual);
        const matchTipo = filtroTipoActual === 'todos' ? true
            : filtroTipoActual === 'sin_cuit' ? (d._tipo === 'reparacion' && !String(d.cuit || '').replace(/\D/g,'').length)
            : d._tipo === filtroTipoActual;
        return matchPago && matchMes && matchTipo;
    });

    // Ordenar de más nuevo a más viejo
    finales.sort((a, b) => {
        if (a.fechaLimpia === "Sin Fecha") return 1;
        if (b.fechaLimpia === "Sin Fecha") return -1;
        let [da, ma, ya] = a.fechaLimpia.split('/');
        let [db, mb, yb] = b.fechaLimpia.split('/');
        let tiempoA = new Date(ya, ma-1, da).getTime();
        let tiempoB = new Date(yb, mb-1, db).getTime();
        if (tiempoA !== tiempoB) return tiempoB - tiempoA;
        const factA = String(a.numFactura || '').trim();
        const factB = String(b.numFactura || '').trim();
        return factB.localeCompare(factA);
    });

    // 6. Chips de mes
    const mesesScrollEl = document.getElementById('meses-scroll');
    if (mesesScrollEl) {
        let chipsHTML = `<button class="mes-chip ${filtroMesActual==='Todos'?'activo':''}" onclick="setFiltroMes('Todos')">Ver todos</button>`;
        mesesArr.forEach(m => {
            chipsHTML += `<button class="mes-chip ${filtroMesActual===m?'activo':''}" onclick="setFiltroMes('${m}')">${m}</button>`;
        });
        const _prevLeft = mesesScrollEl.scrollLeft;          // no perder la posición al redibujar
        mesesScrollEl.innerHTML = chipsHTML;
        mesesScrollEl.scrollLeft = _prevLeft;
        _initMesesScroll(mesesScrollEl);
        const _act = mesesScrollEl.querySelector('.mes-chip.activo');
        if (_act && window._mesAnteriorScroll !== filtroMesActual) {
            mesesScrollEl.scrollTo({ left: Math.max(0, _act.offsetLeft - (mesesScrollEl.clientWidth - _act.offsetWidth) / 2), behavior: 'smooth' });
        }
        window._mesAnteriorScroll = filtroMesActual;
        requestAnimationFrame(() => _actualizarFlechasMeses(mesesScrollEl));
    }

    // 7. Chips de tipo
    let tipoScrollEl = document.getElementById('tipo-scroll');
    if (!tipoScrollEl && mesesScrollEl) {
        tipoScrollEl = document.createElement('div');
        tipoScrollEl.id = 'tipo-scroll';
        tipoScrollEl.style.cssText = 'display:flex; gap:6px; overflow-x:auto; padding:4px 0 10px; flex-wrap:wrap;';
        const _refMeses = mesesScrollEl.closest('.meses-wrap') || mesesScrollEl;
        _refMeses.parentNode.insertBefore(tipoScrollEl, _refMeses);
    }
    if (tipoScrollEl) {
        const conteos = { todos: filtrados.length, abono: 0, reparacion: 0, presup_enviado: 0 };
        filtrados.forEach(d => { if (conteos[d._tipo] !== undefined) conteos[d._tipo]++; });
        const sinCuitCount = filtrados.filter(d => d._tipo === 'reparacion' && !String(d.cuit || '').replace(/\D/g,'').length).length;
        const tiposChips = [
            { val: 'todos',          label: `Todos (${conteos.todos})`,                   color: '#1a73e8' },
            { val: 'abono',          label: `📅 Abonos (${conteos.abono})`,               color: '#60a5fa' },
            { val: 'reparacion',     label: `🔧 Reparaciones (${conteos.reparacion})`,    color: '#4ade80' },
            sinCuitCount > 0 ? { val: 'sin_cuit', label: `⚠️ Sin CUIT (${sinCuitCount})`, color: '#fb923c' } : null,
        ].filter(Boolean);
        tipoScrollEl.innerHTML = tiposChips.map(t => `
            <button onclick="setFiltroTipo('${t.val}')"
                    style="padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700;
                           cursor:pointer; white-space:nowrap; transition:all 0.2s; border:1.5px solid ${t.color};
                           background:${filtroTipoActual===t.val ? t.color : 'transparent'};
                           color:${filtroTipoActual===t.val ? 'white' : t.color};">
                ${t.label}
            </button>`).join('');
    }

    // 8. Botones filtro pago — el aspecto (claro/oscuro) lo define el CSS con la clase .activo
    const filtroMap = { pendiente:'Pendiente', pagado:'Pagado', todos:'Todos' };
    Object.entries(filtroMap).forEach(([k, v]) => {
        const btn = document.getElementById('filtro-' + k);
        if (!btn) return;
        const isActive = filtroPagoActual === v;
        const eraActivo = btn.classList.contains('activo');
        btn.style.background = ''; btn.style.color = ''; btn.style.boxShadow = '';   // limpiar estilos viejos en línea
        btn.classList.toggle('activo', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (isActive && !eraActivo) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    });

    // 9. Paginación
    const DOCS_POR_PAG = 15;
    if (typeof window._paginaDocsActual === 'undefined') window._paginaDocsActual = 0;
    const _keyFiltro = textoBuscado + filtroPagoActual + filtroMesActual + filtroTipoActual;
    if (window._keyFiltroAnterior !== _keyFiltro) {
        window._paginaDocsActual  = 0;
        window._keyFiltroAnterior = _keyFiltro;
    }
    const totalPags = Math.ceil(finales.length / DOCS_POR_PAG);
    const paginados = finales.slice(window._paginaDocsActual * DOCS_POR_PAG, (window._paginaDocsActual + 1) * DOCS_POR_PAG);

    if (finales.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#9aa0a6;">
            <div class="inf-empty__icon">🗂️</div>
            <div style="font-weight:700; font-size:15px;">No hay documentos en esta categoría</div>
        </div>`;
        return;
    }

    paginados.forEach((doc, animIdx) => {
        const estadoReal = doc.estado || "Pendiente";
        const esPagado   = doc.pagado === "Pagado";
        const estadoNorm = _estadoOperativo(doc);
        const colorEst   = estadoNorm === 'facturado' ? "#34a853" : estadoNorm === 'anulado' ? "#f87171" : "#fbbc04";
        
        const badgeCuit  = doc.cuit ? `<span style="background:#f1f3f4; color:#5f6368; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:700; border:1px solid #e0e0e0; margin-right:4px;">${doc.cuit}</span>` : '';
        let factStr      = String(doc.numFactura || '');
        const anulado    = estadoNorm === 'anulado';
        const factLimpia = _numFacturaLimpio(factStr);
        let displayFact  = factStr.startsWith("NC ") ? `🔄 NC ${factStr.replace("NC ","")}` : factLimpia.includes("-") ? `${anulado ? '🚫' : '📄'} Factura ${factLimpia}` : factLimpia ? `📄 ${factLimpia}` : '';
        const badgeFact  = displayFact ? `<span class="badge-fact ${anulado ? 'badge-anulada' : ''}">${displayFact}</span>` : '';
        const badgeNC    = doc.numNC ? `<span class="badge-fact badge-nc" title="Nota de crédito que anuló esta factura">🔄 ${doc.numNC}</span>` : '';
        const bdgTipo    = badgeTipoDoc(doc._tipo, doc);

        let maquinasHTML = '';
        if (doc.items && Array.isArray(doc.items)) {
            maquinasHTML = `<ul style="margin:0 0 10px; padding-left:18px; font-size:13px; color:#475467; line-height:1.7;">` +
                doc.items.map(m => {
                    let extra = (m.metros && m.terminales) ? ` <span style="color:#0f9d58; font-size:11px;">(${m.metros}m / ${m.terminales} term.)</span>` : '';
                    return `<li><b>${m.cant}x ${m.desc||'—'}</b> — ${m.tipo} <span style="color:#d93025; font-size:11px;">($${(m.precio||0).toLocaleString('es-AR')} c/u)</span>${extra}</li>`;
                }).join('') + `</ul>`;
        }

        const esPendientePago = String(doc.pagado || '').trim() !== 'Pagado';
        const esPagadoPago    = !esPendientePago;
        const selectsHTML = modoApp === 'presupuestos' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div>
                    <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#94a3b8; margin-bottom:4px;">Estado Operativo</div>
                    <select onchange="cambiarEstado(${doc.id}, this.value, 'estado')"
                            style="width:100%; padding:10px; border-radius:10px; border:2px solid ${colorEst};
                                   font-weight:800; color:${colorEst}; outline:none;
                                   background:#1e293b; cursor:pointer; font-size:13px;">
                        ${estadoNorm==='sinfacturar' ? `<option value="${estadoReal}" selected disabled>⏳ Sin facturar</option>` : ''}
                        <option value="Facturado / Aprobado" ${estadoNorm==='facturado'?'selected':''}>✅ Facturado</option>
                        <option value="Anulado"              ${estadoNorm==='anulado'?'selected':''}>🚫 Anulado</option>
                    </select>
                </div>
                <div>
                    <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#94a3b8; margin-bottom:4px;">Estado de Pago</div>
                    <div style="display:flex; gap:6px;">
                        <button onclick="cambiarEstado(${doc.id}, 'Pendiente', 'pagado')"
                                style="flex:1; padding:10px 6px; border-radius:10px; border:2px solid #f87171;
                                       background:${esPendientePago?'rgba(239,68,68,0.2)':'rgba(255,255,255,0.04)'};
                                       color:${esPendientePago?'#f87171':'#64748b'};
                                       font-weight:${esPendientePago?900:600}; font-size:12px;
                                       cursor:pointer; transition:all 0.2s;">
                            🔴 Pendiente
                        </button>
                        <button onclick="cambiarEstado(${doc.id}, 'Pagado', 'pagado')"
                                style="flex:1; padding:10px 6px; border-radius:10px; border:2px solid #4ade80;
                                       background:${esPagadoPago?'rgba(74,222,128,0.2)':'rgba(255,255,255,0.04)'};
                                       color:${esPagadoPago?'#4ade80':'#64748b'};
                                       font-weight:${esPagadoPago?900:600}; font-size:12px;
                                       cursor:pointer; transition:all 0.2s;">
                            ✅ Pagado
                        </button>
                    </div>
                </div>
            </div>` : '';

        const tipoInformeActual = doc._tipo === 'abono' ? 'Abono' : 'Reparación';
        const selectTipoDocHTML = `
            <div style="margin-bottom:12px;">
                <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:#94a3b8; margin-bottom:4px;">Tipo de Informe (PDF)</div>
                <select onchange="cambiarEstado(${doc.id}, this.value, 'tipoDoc')"
                        style="width:100%; padding:10px; border-radius:10px; border:2px solid #60a5fa;
                               font-weight:800; color:#60a5fa; outline:none;
                               background:#1e293b; cursor:pointer; font-size:13px;">
                    <option value="Reparación" ${tipoInformeActual === 'Reparación' ? 'selected' : ''}>Reparación</option>
                    <option value="Abono" ${tipoInformeActual === 'Abono' ? 'selected' : ''}>Abono</option>
                </select>
            </div>`;

        // 🔥 VERIFICA SI LA TARJETA ESTABA ABIERTA ANTES DEL REFRESH 🔥
        const estabaAbierta = tarjetasAbiertas.includes(String(doc.id));
        const claseAbierto = estabaAbierta ? 'abierto' : '';
        const flechaIcono = estabaAbierta ? '▲' : '▼';

        const div = document.createElement('div');
        div.className = `doc-card-v3 ${anulado ? 'anulada' : (esPagado?'pagado':'pendiente')}`;
        div.setAttribute('data-id', doc.id); // 🔥 VITAL para recordar si estaba abierta
        div.style.animationDelay = (animIdx * 0.035) + 's';

        div.innerHTML = `
            <div class="doc-header-v3" onclick="
                const body = this.nextElementSibling;
                const open = body.classList.toggle('abierto');
                this.querySelector('.arrow').innerText = open ? '▲' : '▼';
                if (open) precargarPDFFactura(${doc.id});
            ">
                <div class="inf-flex-1">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                        <span class="doc-gym-v3">${doc.cliente}</span>
                        ${badgeCuit}
                        ${badgeFact}${badgeNC}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px;">
                        ${bdgTipo}
                        <span class="doc-meta-v3">
                            ${doc.fechaLimpia}
                            &nbsp;·&nbsp;
                            Total: <strong style="color:#1a73e8;${anulado ? 'text-decoration:line-through; opacity:.55;' : ''}">$${Number(doc.total).toLocaleString('es-AR')}</strong>
                        </span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${anulado ? `<span class="badge-estado anulado">ANULADA</span>` : (modoApp==='presupuestos' ? `<span class="badge-estado ${esPagado?'pagado':'pendiente'}">${doc.pagado}</span>` : '')}
                    <span class="arrow" style="font-size:13px; color:#1a73e8; font-weight:800;">${flechaIcono}</span>
                </div>
            </div>
            
            <div class="doc-expand-v3 ${claseAbierto}">
                ${maquinasHTML}
                ${selectsHTML}
                ${selectTipoDocHTML} 
                ${anulado && doc.numNC ? `<button class="btn-ncr-fix" onclick="abrirRevisionNC('${doc.numNC}')">🔧 Corregir qué factura anula ${doc.numNC}</button>` : ''}
                <div style="display:flex; gap:8px; margin-top:4px;">
                    <button class="btn-doc-edit" style="flex:1; min-height:44px;" onclick="editarDocumento(${doc.id})">✏️ Editar</button>
                    <button onclick="verPDFFactura(${doc.id}, this)" onmouseenter="precargarPDFFactura(${doc.id})" ontouchstart="precargarPDFFactura(${doc.id})"
                            style="flex:1; padding:11px; background:linear-gradient(135deg,#1a73e8,#1155cc);
                                   color:white; border:none; border-radius:10px; font-weight:900;
                                   font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(26,115,232,0.35);
                                   display:flex; align-items:center; justify-content:center; gap:6px; min-height:44px;">
                        📄 Ver PDF
                    </button>
                </div>
            </div>
        `;
        contenedor.appendChild(div);
    });

    if (totalPags > 1) {
        const navEl = document.createElement('div');
        navEl.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:10px; padding:18px 0 8px; flex-wrap:wrap;';
        
        const btnAnterior = document.createElement('button');
        btnAnterior.textContent = '← Anterior';
        btnAnterior.disabled    = window._paginaDocsActual === 0;
        btnAnterior.className   = 'inf-btn inf-btn--gris inf-btn--sm';
        btnAnterior.onclick     = () => { window._paginaDocsActual--; renderizarTarjetas(); contenedor.scrollIntoView({ behavior:'smooth', block:'start' }); };
        
        const info = document.createElement('span');
        info.style.cssText  = 'font-size:13px; font-weight:700; color:var(--inf-sub,#94a3b8);';
        info.textContent    = `Página ${window._paginaDocsActual + 1} de ${totalPags}  (${finales.length} docs)`;
        
        const btnSiguiente = document.createElement('button');
        btnSiguiente.textContent = 'Siguiente →';
        btnSiguiente.disabled    = window._paginaDocsActual >= totalPags - 1;
        btnSiguiente.className   = 'inf-btn inf-btn--gris inf-btn--sm';
        btnSiguiente.onclick     = () => { window._paginaDocsActual++; renderizarTarjetas(); contenedor.scrollIntoView({ behavior:'smooth', block:'start' }); };
        
        navEl.appendChild(btnAnterior); navEl.appendChild(info); navEl.appendChild(btnSiguiente);
        contenedor.appendChild(navEl);
    }
}

// ════════════════════════════════════════════════════════════════
//  🗂️ HISTORIAL LOCAL DE PDFs GENERADOS
// ════════════════════════════════════════════════════════════════


// ── MEJORA 7: Ver fotos de la visita en Google Drive ─────────────
// Abre Google Drive filtrado por el nombre del cliente y la fecha.
function verFotosEnDrive(cliente, fechaVisita) {
    // Construir query de búsqueda: carpeta del gimnasio en Drive
    var query = encodeURIComponent(cliente.substring(0, 30));
    // Abre Drive con búsqueda del nombre del gym
    var driveUrl = 'https://drive.google.com/drive/search?q=' + query;
    window.open(driveUrl, '_blank');
}

// ── Registrar PDF con base64 para previsualización ──────────────
function registrarPDFGenerado(doc, base64, nombre) {
    try {
        const historial = JSON.parse(localStorage.getItem('historial_pdfs') || '[]');
        const entrada = {
            ts:      Date.now(),
            id:      doc.id,
            cliente: doc.cliente || '—',
            fecha:   doc.fechaLimpia || doc.fecha || '—',
            total:   doc.total || 0,
            modo:    typeof modoApp !== 'undefined' ? modoApp : '—',
            nombre:  nombre || ('Presupuesto_' + (doc.cliente || 'doc') + '.pdf'),
            base64:  base64 || null   // null si no se guardó por tamaño
        };
        historial.unshift(entrada);

        // Guardar — si excede 4MB de localStorage, guardar sin base64
        const json = JSON.stringify(historial.slice(0, 50));
        if (json.length < 4_000_000) {
            localStorage.setItem('historial_pdfs', json);
        } else {
            // Guardar sin base64 los más viejos
            const sinBlob = historial.slice(0, 50).map((e, i) =>
                i === 0 ? e : { ...e, base64: null }
            );
            localStorage.setItem('historial_pdfs', JSON.stringify(sinBlob));
        }
    } catch(e) { console.warn('historial_pdfs error:', e); }
}

// ── Ver historial con buscador y previsualización ────────────────
function verHistorialPDFs() {
    const modal = document.getElementById('modal-historial-pdfs');
    const lista = document.getElementById('lista-historial-pdfs');
    if (!modal || !lista) { mostrarMensaje('Modal no encontrado.', 'error'); return; }

    // Renderizar con buscador
    const renderLista = (filtro) => {
        let historial = [];
        try { historial = JSON.parse(localStorage.getItem('historial_pdfs') || '[]'); }
        catch(e) {}

        const q = (filtro || '').toLowerCase().trim();
        const filtrados = q
            ? historial.filter(r => (r.cliente || '').toLowerCase().includes(q) ||
                                    (r.fecha   || '').includes(q) ||
                                    (r.nombre  || '').toLowerCase().includes(q))
            : historial;

        if (filtrados.length === 0) {
            lista.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:var(--inf-muted);">
                    <div class="inf-empty__icon">${q ? '🔍' : '📭'}</div>
                    <div style="font-weight:700;">${q ? 'Sin resultados para "' + q + '"' : 'No hay PDFs generados todavía.'}</div>
                </div>`;
            return;
        }

        lista.innerHTML = filtrados.map((r, i) => {
            const d          = new Date(r.ts);
            const cuandoStr  = d.toLocaleDateString('es-AR') + ' ' +
                               d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
            const totalStr   = r.total > 0
                ? '$' + Math.round(r.total).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                : '—';
            const tieneBlob  = !!r.base64;
            const btnVer     = tieneBlob
                ? `<button onclick="abrirPDFDesdeHistorial(${i})"
                           style="background:var(--inf-azul); color:white; border:none;
                                  padding:7px 14px; border-radius:8px; font-weight:800;
                                  font-size:12px; cursor:pointer; white-space:nowrap;
                                  transition:all 0.2s;">
                       👁️ Ver PDF
                   </button>`
                : `<span style="font-size:11px; color:var(--inf-muted); white-space:nowrap;">Sin preview</span>`;

            return `<div style="display:flex; align-items:center; justify-content:space-between;
                        padding:13px 16px; border-bottom:1px solid var(--inf-border); gap:10px;
                        flex-wrap:wrap; animation:scaleIn 0.2s ease ${i*0.025}s both;">
                <div class="inf-flex-1">
                    <div style="font-weight:900; font-size:14px; color:var(--inf-text);
                                overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${r.cliente}
                    </div>
                    <div style="font-size:12px; color:var(--inf-sub); margin-top:2px;">
                        ${r.fecha} &nbsp;·&nbsp;
                        ${r.modo === 'presupuestos' ? '💰 Presupuesto' : '🛠️ Oferta'}
                        &nbsp;·&nbsp; <span style="color:var(--inf-muted);">${cuandoStr}</span>
                    </div>
                    <div style="font-size:11px; color:var(--inf-muted); margin-top:2px;
                                overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        📄 ${r.nombre || '—'}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0;">
                    <div style="font-weight:900; color:var(--inf-azul); font-size:15px;">${totalStr}</div>
                    ${btnVer}
                </div>
            </div>`;
        }).join('');

        // Guardar filtrados en window para que abrirPDFDesdeHistorial pueda acceder por índice
        window._historialFiltrado = filtrados;
    };

    // Construir modal con buscador
    lista.innerHTML = '';
    // Inyectar buscador si no existe
    let buscadorHist = document.getElementById('buscador-historial-pdfs');
    if (!buscadorHist) {
        buscadorHist = document.createElement('div');
        buscadorHist.id = 'buscador-historial-pdfs';
        buscadorHist.style.cssText = 'padding:12px 16px; border-bottom:1px solid var(--inf-border);';
        buscadorHist.innerHTML = `
            <input type="text" id="input-busq-hist"
                   placeholder="🔍 Buscar por cliente, fecha, nombre..."
                   style="width:100%; padding:10px 14px; border:2px solid var(--inf-border);
                          border-radius:10px; font-size:14px; font-weight:600; outline:none;
                          background:var(--inf-card); color:var(--inf-text);
                          transition:border-color 0.2s;"
                   oninput="verHistorialPDFs._render(this.value)"
                   onfocus="this.style.borderColor='var(--inf-azul)'"
                   onblur="this.style.borderColor='var(--inf-border)'">`;
        lista.parentNode.insertBefore(buscadorHist, lista);
    } else {
        // Limpiar buscador al abrir
        const inp = document.getElementById('input-busq-hist');
        if (inp) inp.value = '';
    }

    // Exponer función de render para el input
    verHistorialPDFs._render = renderLista;
    renderLista('');

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('mostrar');
        document.getElementById('input-busq-hist')?.focus();
    }, 50);
}

// ── Abrir PDF desde el historial local ──────────────────────────
function abrirPDFDesdeHistorial(idx) {
    const historial = window._historialFiltrado || [];
    const entrada   = historial[idx];
    if (!entrada || !entrada.base64) {
        mostrarMensaje('Este PDF ya no está en caché. Regeneralo desde "Ver Guardados".', 'error');
        return;
    }
    try {
        const bytes  = atob(entrada.base64);
        const arr    = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob   = new Blob([arr], { type: 'application/pdf' });
        const url    = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch(e) {
        mostrarMensaje('Error al abrir el PDF: ' + e.message, 'error');
    }
}



// ── Barra de progreso para PDF ──────────────────────────────────
let _pdfEnProceso = false;

function _mostrarProgressPDF(btnEl) {
    if (!btnEl) return;
    btnEl.disabled = true;
    btnEl.dataset.textoOriginal = btnEl.innerHTML;
    btnEl.innerHTML = `
        <span style="display:flex; align-items:center; gap:8px; justify-content:center;">
            <span style="display:inline-block; width:16px; height:16px; border:2px solid rgba(255,255,255,0.4);
                         border-top-color:white; border-radius:50%; animation:spin 0.7s linear infinite;"></span>
            Generando PDF...
        </span>`;
}
function _ocultarProgressPDF(btnEl) {
    if (!btnEl) return;
    btnEl.disabled = false;
    btnEl.innerHTML = btnEl.dataset.textoOriginal || '📄 Ver y Exportar PDF';
    _pdfEnProceso  = false;
}

// ════════════════════════════════════════════════════════════════
//  📄 GENERADOR DE PRESUPUESTO PDF
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  📄 GENERADOR PDF REAL — jsPDF  (landscape A4, réplica exacta del Excel)
//  Columnas Excel: A(9.14), B(13), C(7.86), D(60.29), E(9.71), F(16.29), G(22) chars
//  Página: landscape, márgenes 0.25" = 6.35mm
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  📄 GENERAR PDF — usa Plantilla_Presupuesto en Google Sheets
//  Flujo: datos → backend escribe en la plantilla → exporta PDF
//  → descarga directa en el navegador → registra en Presupuestos_Emitidos
// ════════════════════════════════════════════════════════════════

function abrirVistaPresupuesto(id, btnEl) {
    if (_pdfEnProceso) return;
    _pdfEnProceso = true;
    _mostrarProgressPDF(btnEl);

    const doc = documentosGuardados.find(d => String(d.id) === String(id));
    if (!doc) {
        mostrarMensaje('❌ Documento no encontrado.', 'error');
        _ocultarProgressPDF(btnEl);
        _pdfEnProceso = false;
        return;
    }

    // ── Fecha limpia ─────────────────────────────────────────────
    const fechaLimpia = (() => {
        if (doc.fechaLimpia && doc.fechaLimpia !== 'Sin Fecha') return doc.fechaLimpia;
        const f = String(doc.fecha || '');
        if (!f) return new Date().toLocaleDateString('es-AR');
        if (f.includes('T')) {
            const d = new Date(f);
            return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
        }
        return f;
    })();

    // ── Payload para el backend ──────────────────────────────────
    const payload = {
        cliente: doc.cliente  || '',
        cuit:    doc.cuit     || '',
        fecha:   fechaLimpia,
        total:   Number(doc.total) || 0,
        tipoDoc: doc.tipoDoc || "Presupuesto",
        items:   (doc.items || []).map(m => ({
            desc:       m.desc      || '',
            tipo:       m.tipo      || '',
            cant:       Number(m.cant)   || 1,
            precio:     Number(m.precio) || 0,
            metros:     m.metros     || '',
            terminales: m.terminales || ''
        }))  
    };

    // ── Llamar al backend ────────────────────────────────────────
    mostrarMensaje('⏳ Generando PDF desde la plantilla... puede tardar unos segundos.', 'cargando');

    llamarAPI({ accion: 'actualizarPlantillaYExportarPDF', payload })
        .then(result => {
            if (!result.ok || !result.base64) {
                throw new Error(result.error || 'El backend no devolvió el PDF.');
            }

            // ── Descargar PDF desde base64 ───────────────────────
            const bytes    = atob(result.base64);
            const arr      = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            const blob     = new Blob([arr], { type: 'application/pdf' });
            const url      = URL.createObjectURL(blob);
            const link     = document.createElement('a');
            link.href      = url;
            link.download  = result.nombre || `Presupuesto_${doc.cliente}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);

            // Registrar en historial con base64 para preview posterior
            registrarPDFGenerado(doc, result.base64, result.nombre);
            mostrarMensaje(`✅ PDF descargado: ${result.nombre}`, 'exito');
        })
        .catch(err => {
        // [debug removed] console.error('PDF error:', err...)
            mostrarMensaje('❌ Error al generar PDF: ' + err.message, 'error');
        })
        .finally(() => {
            setTimeout(() => _ocultarProgressPDF(btnEl), 600);
        });
}


// ─────────────────────────────────────────────────────────────────
//  📧 PREPARAR MAIL — abre Outlook Web Compose directamente
//  FIX: usa encodeURIComponent (no URLSearchParams) para evitar
//  que los espacios se conviertan en "+" en Outlook Web.
//  Templates exactos de Notas_SupportFitness.md
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
//  📧 PREPARAR MAIL — abre Outlook Web Compose directamente
//  FIX: usa encodeURIComponent (no URLSearchParams) para evitar
//  que los espacios se conviertan en "+" en Outlook Web.
//  Templates exactos de Notas_SupportFitness.md
// ─────────────────────────────────────────────────────────────────

// Helper: construye URL de Outlook sin el bug del "+"
function _urlOutlook(to, subject, body) {
    const base = 'https://outlook.live.com/mail/0/deeplink/compose?';
    const q = (to      ? 'to='      + encodeURIComponent(to)      + '&' : '') +
              'subject=' + encodeURIComponent(subject) + '&' +
              'body='    + encodeURIComponent(body);
    return base + q;
}

const _FIRMA = [
    '',
    'Cordiales saludos.',
    'Facundo Durán',
    '',
    'SUPPORT FITNESS',
    'SERVICIO TÉCNICO PARA GIMNASIOS.',
    'CEL. 11 6117-7878.'
].join('\n');

function prepararMail(id) {
    const doc = documentosGuardados.find(d => String(d.id) === String(id));
    if (!doc) return;

    const cliente = doc.cliente || '—';
    let asunto, cuerpo;

    if (modoApp === 'presupuestos') {
        // REPARACIÓN APROBADA
        asunto = 'Factura Gimnasio - ' + cliente;
        cuerpo = [
            'Buenas tardes, Señores de Administración.',
            '',
            'Adjunto la factura por el presupuesto aprobado, así como los datos de la cuenta para realizar la transferencia a la brevedad, con el fin de avanzar en las reparaciones.',
            '',
            'Las reparaciones quedarán confirmadas una vez se envíe el comprobante de pago de la factura correspondiente.',
            '',
            'Por favor, confirmar recepción.',
            _FIRMA
        ].join('\n');
    } else {
        // REPARACIÓN / OFERTA
        asunto = 'Presupuesto Support Fitness - ' + cliente;
        cuerpo = [
            'Buenas tardes, Señores de administración.',
            '',
            'Adjunto presupuesto solicitado para realizar la reparación en el gimnasio. Esperamos su confirmación para hacerle su factura correspondiente.',
            '',
            'Por favor, confirmar recepción.',
            _FIRMA
        ].join('\n');
    }

    window.open(_urlOutlook('', asunto, cuerpo), '_blank');
}



// ─────────────────────────────────────────────────────────────────
// 🔥 NUEVO CAMBIO DE ESTADO (Actualización Inmediata y Silenciosa) 🔥
// ─────────────────────────────────────────────────────────────────
let tempDocParaFactura = null;

async function cambiarEstado(id, nuevoValor, tipoCambiado) {
    const doc = documentosGuardados.find(i => i.id === id);
    if (!doc) return;
    
    if (tipoCambiado === 'estado') {
        if (nuevoValor === 'Anulado') {
            const ok = await modalConfirmar({
                titulo: '¿Anular este documento?',
                mensaje: `${doc.cliente}\n${doc.numFactura || ''}\nQuedará marcado como Anulado.`,
                icono: '🚫', color: '#d93025', btnOk: 'Anular', btnCancel: 'Cancelar'
            });
            if (!ok) { renderizarTarjetas(); return; }
            doc.estado = 'Anulado';
        } else if ((nuevoValor === 'Facturado / Aprobado' || nuevoValor === 'Facturado')
                   && !(doc.numFactura && !/anulad/i.test(doc.numFactura))) {
            tempDocParaFactura = { id: id, nuevoValor: nuevoValor };
            document.getElementById('input-modal-factura').value = ""; 
            const modal = document.getElementById('modalFactura');
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('mostrar'), 10);
            return; 
        } else {
            doc.estado = nuevoValor; 
        }
        
        // 🔥 ACTUALIZACIÓN INMEDIATA SIN BLOQUEAR PANTALLA 🔥
        renderizarTarjetas();
        ejecutarGuardadoDeEstado(doc, true); // Guardado fantasma en Google
        return;
    }
    
    if (tipoCambiado === 'pagado') {
        doc.pagado = nuevoValor;
        // 🔥 ACTUALIZACIÓN INMEDIATA SIN BLOQUEAR PANTALLA 🔥
        renderizarTarjetas();
        ejecutarGuardadoDeEstado(doc, true); // Guardado fantasma en Google
        return;
    }
    
    // 🔥 ACTUALIZACIÓN RÁPIDA DE LA ETIQUETA SIN REINICIAR LA LISTA 🔥
    if (tipoCambiado === 'tipoDoc') {
        doc.tipoDoc = nuevoValor;
        doc._tipo = clasificarDocumento(doc); 
        
        const badgeViejo = document.getElementById(`badge-tipo-${id}`);
        if (badgeViejo) {
            badgeViejo.outerHTML = badgeTipoDoc(doc._tipo, doc);
        }
        
        ejecutarGuardadoDeEstado(doc, true);
        return;
    }
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

async function ejecutarGuardadoDeEstado(doc, silencioso = false) {
    mostrarMensaje('Actualizando base de datos...', 'cargando');
    try {
        await llamarAPI({ accion: "guardarDocumentoBD", payload: { hoja: HOJA_PRESUPUESTOS, datos: doc } });
        mostrarMensaje('✅ Actualizado.', 'exito');
        
        // 🔥 Si NO es silencioso, repinta todo. Si ES silencioso, no hace nada visualmente 🔥
        if (!silencioso) {
            renderizarTarjetas(); 
        }
    } catch (e) { 
        mostrarMensaje('❌ Error.', 'error'); 
    }
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

// ════════════════════════════════════════════════════════════════
//  🎨 SISTEMA DE MODALES PERSONALIZADOS
//  Reemplaza confirm(), alert() y prompt() del navegador por modales
//  con el diseño del sistema — sin el popup feo del sistema operativo.
// ════════════════════════════════════════════════════════════════

// ── Modal de confirmación (reemplaza confirm()) ──────────────────
// Uso: const ok = await modalConfirmar({ titulo, mensaje, btnOk, btnCancel, icono, color })
function modalConfirmar({ titulo = '¿Confirmar acción?', mensaje = '', btnOk = 'Confirmar',
                           btnCancel = 'Cancelar', icono = '❓', color = '#1a73e8' } = {}) {
    return new Promise(resolve => {
        // Crear o reutilizar el modal
        let overlay = document.getElementById('_modal-confirmar-custom');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = '_modal-confirmar-custom';
            overlay.style.cssText = `
                display:none; position:fixed; inset:0; z-index:99999;
                background:rgba(0,0,0,0.55); align-items:center; justify-content:center;
                padding:20px; backdrop-filter:blur(3px); animation:fadeIn 0.15s ease;`;
            overlay.innerHTML = `
                <div id="_mc-box" style="
                    background:var(--inf-card,white); border-radius:20px;
                    padding:30px 26px 24px; max-width:380px; width:100%;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3); animation:scaleIn 0.2s cubic-bezier(0.34,1.4,0.64,1);
                    border:1px solid var(--inf-border,rgba(0,0,0,0.07));">
                    <div id="_mc-icon" style="font-size:40px; text-align:center; margin-bottom:12px;"></div>
                    <div id="_mc-titulo" style="font-size:18px; font-weight:900; text-align:center;
                         margin-bottom:8px; color:var(--inf-text,#1d2939);"></div>
                    <div id="_mc-msg" style="font-size:14px; color:var(--inf-sub,#475467); text-align:center;
                         line-height:1.6; margin-bottom:22px; white-space:pre-wrap;"></div>
                    <div style="display:flex; gap:10px;">
                        <button id="_mc-btn-cancel"
                            style="flex:1; padding:13px; border-radius:10px; border:1.5px solid var(--inf-border,#e0e0e0);
                                   background:var(--inf-card,white); color:var(--inf-sub,#475467);
                                   font-size:14px; font-weight:800; cursor:pointer; transition:all 0.2s;"></button>
                        <button id="_mc-btn-ok"
                            style="flex:1; padding:13px; border-radius:10px; border:none;
                                   font-size:14px; font-weight:900; cursor:pointer; transition:all 0.2s;
                                   box-shadow:0 4px 14px rgba(0,0,0,0.2);"></button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        // Poblar contenido
        document.getElementById('_mc-icon').innerText   = icono;
        document.getElementById('_mc-titulo').innerText = titulo;
        document.getElementById('_mc-msg').innerText    = mensaje;

        const btnOkEl = document.getElementById('_mc-btn-ok');
        const btnCnEl = document.getElementById('_mc-btn-cancel');
        btnOkEl.innerText = btnOk;
        btnCnEl.innerText = btnCancel;
        btnOkEl.style.background = color;
        btnOkEl.style.color      = 'white';
        document.getElementById('_mc-titulo').style.color = color;

        overlay.style.display = 'flex';
        setTimeout(() => btnOkEl.focus(), 50);

        // Handlers
        const cleanup = (val) => {
            overlay.style.display = 'none';
            btnOkEl.onclick = null;
            btnCnEl.onclick = null;
            overlay.onclick = null;
            resolve(val);
        };
        btnOkEl.onclick = () => cleanup(true);
        btnCnEl.onclick = () => cleanup(false);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
}

// ── Modal de alerta/aviso (reemplaza alert()) ────────────────────
// Uso: await modalAviso({ titulo, mensaje, icono, color })
function modalAviso({ titulo = 'Aviso', mensaje = '', icono = 'ℹ️',
                       color = '#1a73e8', btnOk = 'Entendido' } = {}) {
    return modalConfirmar({ titulo, mensaje, icono, color, btnOk, btnCancel: '' })
        .then(() => {});  // ignora el resultado, siempre resolve
}

// Sobrescribir el botón de borrar historial para que use el modal propio
function borrarHistorialPDFs() {
    modalConfirmar({
        titulo:    '¿Borrar historial?',
        mensaje:   'Se eliminarán todos los PDFs guardados en este dispositivo.\nEsta acción no se puede deshacer.',
        icono:     '🗑️',
        color:     '#d93025',
        btnOk:     'Borrar todo',
        btnCancel: 'Cancelar'
    }).then(ok => {
        if (!ok) return;
        localStorage.removeItem('historial_pdfs');
        const lista = document.getElementById('lista-historial-pdfs');
        if (lista) lista.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--inf-muted);">
                <div class="inf-empty__icon">📭</div>
                <div style="font-weight:700;">Historial borrado.</div>
            </div>`;
    });
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
        const respuesta = await llamarAPI({ accion: "sincronizarConBaseARCA" }, 120000);
        mostrarMensaje('🚀 ' + respuesta, 'exito');
        await obtenerYRenderizarCreados(true);
        if (/para revisar/.test(String(respuesta))) abrirRevisionNC();
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

// ════════════════════════════════════════════════════════════════
//  FIX 3: Vincular ARCA desde la pestaña Presupuestar
//  Marca las facturas en documentosGuardados cruzando por CUIT+importe
//  con lo que devuelve sincronizarConBaseARCA (mismo algoritmo del backend).
// ════════════════════════════════════════════════════════════════
async function vincularARCADesdePresupuestar() {
    const btn = document.getElementById('btn-vincular-arca-presup');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Vinculando...'; }
    mostrarMensaje('Analizando ARCA para presupuestos... ⏳', 'cargando');
    try {
        const respuesta = await llamarAPI({ accion: 'sincronizarConBaseARCA' }, 120000);
        mostrarMensaje('🚀 ' + respuesta, 'exito');
        // Recargar documentos para reflejar facturas vinculadas
        await obtenerYRenderizarCreados(true);
        if (/para revisar/.test(String(respuesta))) abrirRevisionNC();
    } catch(e) {
        mostrarMensaje('❌ Error: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔗 Vincular ARCA'; }
    }
}

// ════════════════════════════════════════════════════════════════
//  📋 PDF LISTA MENSUAL — Control de facturas en papel
// ════════════════════════════════════════════════════════════════

function generarPDFListaMensual() {
    let modal = document.getElementById('_modal-lista-pdf');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = '_modal-lista-pdf';
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

        const hoy = new Date();
        const y = hoy.getFullYear(), m = String(hoy.getMonth()+1).padStart(2,'0');
        const primerDia = `${y}-${m}-01`;
        const ultimoDia = new Date(y, hoy.getMonth()+1, 0);
        const lastStr   = `${y}-${m}-${String(ultimoDia.getDate()).padStart(2,'0')}`;

        // 🔥 OBTENER GIMNASIOS LIMPIOS PARA EL BUSCADOR 🔥
        let clientesUnicos = [];
        if (typeof documentosGuardados !== 'undefined') {
            clientesUnicos = [...new Set(documentosGuardados
                .map(d => (d.cliente || '').trim())
                .filter(c => c && !c.toUpperCase().includes('IMPORTADO') && !c.toUpperCase().includes('ARCA') && !c.toUpperCase().includes('⚠️'))
            )].sort((a,b) => a.localeCompare(b));
        }

        modal.innerHTML = `
        <div style="background:var(--inf-card,#1a1f2e);border-radius:18px;width:100%;max-width:440px;
                    border:1px solid rgba(255,255,255,0.1);padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.5);max-height:95vh;overflow-y:auto;">
            <div style="font-size:18px;font-weight:900;color:var(--inf-text,#e2e8f0);margin-bottom:6px;">📋 Reportes PDF v2.1</div>
            <div style="font-size:12px;color:var(--inf-sub,#94a3b8);margin-bottom:20px;">Configuración de impresión y auditoría</div>

            <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">Formato del Reporte</label>
            <select id="_lpdf-formato-reporte" 
                    onchange="const fmt=this.value; document.getElementById('_lpdf-contenedor-columnas').style.display=(fmt==='control'?'block':'none'); _lpdfActualizarPreview();"
                    style="width:100%; padding:10px; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1);
                           background:#1e293b; color:white; font-size:13px; font-weight:700; margin-bottom:16px; box-sizing:border-box; cursor:pointer; outline:none;">
                <option value="control">📊 Control de Facturación (Tabla Completa)</option>
                <option value="clientes">🔤 Lista de Clientes y CUIT (Orden Alfabético)</option>
            </select>

            <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">Buscar Gimnasio</label>
            <input type="text" id="_lpdf-filtro-cliente" list="_lpdf-lista-gimnasios" 
                   placeholder="🔍 Escribí para buscar (Dejá vacío para Todos)"
                   oninput="_lpdfActualizarPreview()"
                   style="width:100%; padding:10px; border-radius:8px; border:1.5px solid rgba(255,255,255,0.1);
                          background:rgba(255,255,255,0.04); color:#60a5fa; font-size:13px; font-weight:800; margin-bottom:16px; box-sizing:border-box; outline:none;">
            <datalist id="_lpdf-lista-gimnasios">
                ${clientesUnicos.map(c => `<option value="${c}">`).join('')}
            </datalist>

            <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">Accesibilidad Visual</label>
            <div style="background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:8px; border:1px dashed rgba(255,255,255,0.15); margin-bottom:16px;">
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:white; font-weight:700; cursor:pointer;">
                    <input type="checkbox" id="_lpdf-fuente-grande" style="width:18px; height:18px; accent-color:#7c3aed;">
                    🔎 Agrandar texto para fácil lectura
                </label>
            </div>

            <div id="_lpdf-contenedor-columnas" style="display: block; margin-bottom: 16px;">
                <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">COLUMNAS DE ESTADO (en papel)</label>
                <div style="display:flex;gap:12px;flex-wrap:wrap;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                    ${[['Pagado','#22c55e'],['Adeuda','#f87171'],['Reclamo','#fb923c']].map(([l,c]) =>
                        `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--inf-text,#e2e8f0);cursor:pointer;">
                            <input type="checkbox" id="_lpdf-col-${l.toLowerCase()}" checked
                                style="accent-color:${c};width:16px;height:16px;"> ${l}
                        </label>`
                    ).join('')}
                </div>
            </div>

            <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">RANGO DE FECHAS</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <div>
                    <div style="font-size:10px;color:var(--inf-muted,#6b7db3);margin-bottom:4px;">Desde</div>
                    <input type="date" id="_lpdf-desde" value="${primerDia}"
                        style="width:100%;padding:10px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);
                               background:rgba(255,255,255,0.06);color:var(--inf-text,#e2e8f0);font-size:13px;box-sizing:border-box; outline:none;">
                </div>
                <div>
                    <div style="font-size:10px;color:var(--inf-muted,#6b7db3);margin-bottom:4px;">Hasta</div>
                    <input type="date" id="_lpdf-hasta" value="${lastStr}"
                        style="width:100%;padding:10px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);
                               background:rgba(255,255,255,0.06);color:var(--inf-text,#e2e8f0);font-size:13px;box-sizing:border-box; outline:none;">
                </div>
            </div>

            <label style="font-size:11px;font-weight:800;color:var(--inf-sub,#94a3b8);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:6px;">FILTRAR POR TIPO</label>
            <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
                ${[['todos','Todos','#1a73e8'],['abono','Abonos','#60a5fa'],['reparacion','Reparaciones','#4ade80']].map(([v,l,c]) =>
                    `<button data-tipo="${v}" onclick="_lpdfSetTipo(this,'${v}')"
                        style="padding:6px 12px;border-radius:8px;border:1.5px solid ${c};
                               background:${v==='todos'?c:'transparent'};color:${v==='todos'?'white':c};
                               font-size:12px;font-weight:700;cursor:pointer;">
                        ${l}
                    </button>`
                ).join('')}
            </div>

            <div id="_lpdf-preview" style="font-size:12px;color:var(--inf-muted,#94a3b8);margin-bottom:18px;padding:8px 12px;
                background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                Calculando...
            </div>

            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('_modal-lista-pdf').remove()"
                    style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);
                           background:rgba(255,255,255,0.04);color:var(--inf-sub,#94a3b8);font-weight:700;cursor:pointer;">
                    Cancelar
                </button>
                <button onclick="_generarListaPDFEjecutar()"
                    style="flex:1;padding:12px;border-radius:10px;border:none;font-weight:900;cursor:pointer;
                           background:linear-gradient(135deg,#7c3aed,#4c1d95);color:white;font-size:14px;">
                    📄 Generar PDF
                </button>
            </div>
        </div>`;

        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    window._lpdfTipoActual = 'todos';
    _lpdfActualizarPreview();

    ['_lpdf-desde','_lpdf-hasta'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', _lpdfActualizarPreview);
    });
}

window._lpdfTipoActual = 'todos';

function _lpdfSetTipo(btn, tipo) {
    window._lpdfTipoActual = tipo;
    document.querySelectorAll('[data-tipo]').forEach(function(b) {
        const t = b.dataset.tipo;
        const colors = {todos:'#1a73e8',abono:'#60a5fa',reparacion:'#4ade80',presup_enviado:'#c084fc'};
        const c = colors[t] || '#1a73e8';
        b.style.background = t === tipo ? c : 'transparent';
        b.style.color      = t === tipo ? 'white' : c;
    });
    _lpdfActualizarPreview();
}

function _lpdfFiltrarDocs() {
    const desde = document.getElementById('_lpdf-desde')?.value;
    const hasta = document.getElementById('_lpdf-hasta')?.value;
    const tipo  = window._lpdfTipoActual || 'todos';
    
    // 🔥 CAPTURA EL TEXTO MIENTRAS ESCRIBÍS 🔥
    const textoBuscado = (document.getElementById('_lpdf-filtro-cliente')?.value || '').toLowerCase().trim();

    if (!Array.isArray(documentosGuardados) || !documentosGuardados.length) return [];

    return documentosGuardados.filter(function(doc) {
        const f  = (doc.fechaLimpia || doc.fecha || '').split('/');
        let fecha;
        if (f.length === 3) fecha = `${f[2]}-${f[1]}-${f[0]}`;
        else fecha = String(doc.fecha || '').slice(0,10);
        
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
        if (tipo !== 'todos' && doc._tipo !== tipo) return false;
        
        // 🔥 FILTRO INTELIGENTE TIPO GOOGLE 🔥
        if (textoBuscado) {
            const nombreGym = String(doc.cliente || '').toLowerCase();
            if (!nombreGym.includes(textoBuscado)) return false; 
        }

        return true;
    }).sort(function(a, b) {
        const fa = (a.fechaLimpia || '').split('/').reverse().join('');
        const fb = (b.fechaLimpia || '').split('/').reverse().join('');
        const comparacionFecha = fb.localeCompare(fa);
        if (comparacionFecha !== 0) return comparacionFecha;
        
        const factA = String(a.numFactura || '').trim();
        const factB = String(b.numFactura || '').trim();
        return factB.localeCompare(factA);
    });
}

function _lpdfActualizarPreview() {
    const docs = _lpdfFiltrarDocs();
    const el   = document.getElementById('_lpdf-preview');
    if (el) {
        const vigentes = docs.filter(function(d) { return !_esAnulado(d); });
        const nAnul = docs.length - vigentes.length;
        const total = vigentes.reduce(function(s, d) { return s + Number(d.total || 0); }, 0);
        el.innerHTML = `<strong>${vigentes.length} facturas</strong>${nAnul ? ` (+${nAnul} anulada${nAnul>1?'s':''}, no suman)` : ''} encontradas (${vigentes.filter(d => String(d.pagado||'').trim().toLowerCase()==='pagado').length} pagadas) · Total: <strong style="color:#60a5fa;">$${Math.round(total).toLocaleString('es-AR')}</strong>`;
    }
}

async function _generarListaPDFEjecutar() {
    let docs = _lpdfFiltrarDocs();

    if (!docs.length) { 
        mostrarMensaje('No hay documentos que coincidan con la búsqueda o filtros.', 'error'); 
        return; 
    }

    const desde = document.getElementById('_lpdf-desde')?.value || '';
    const hasta = document.getElementById('_lpdf-hasta')?.value || '';
    const formatoReporte = document.getElementById('_lpdf-formato-reporte')?.value || 'control';
    const fuenteGrande   = document.getElementById('_lpdf-fuente-grande')?.checked;
    const colPagado   = document.getElementById('_lpdf-col-pagado')?.checked;
    const colAdeuda   = document.getElementById('_lpdf-col-adeuda')?.checked;
    const colReclamo  = document.getElementById('_lpdf-col-reclamo')?.checked;
    
    // Captura para el cartel superior del PDF
    const textoBuscado = document.getElementById('_lpdf-filtro-cliente')?.value.trim();
    const subTituloCliente = textoBuscado ? `Filtro: "${textoBuscado}"` : 'Todos los Gimnasios';
    
    document.getElementById('_modal-lista-pdf')?.remove();
    mostrarMensaje('⏳ Generando PDF...', 'cargando');

    const szBody    = fuenteGrande ? '15px' : '11px';
    const szHead    = fuenteGrande ? '14px' : '10px';
    const szTitle   = fuenteGrande ? '25px' : '20px';
    const szSub     = fuenteGrande ? '15px' : '12px';
    const szMeta    = fuenteGrande ? '13px' : '9px';
    const paddingTd = fuenteGrande ? '12px 10px' : '7px 8px';

    let tablaHTML = '';

    if (formatoReporte === 'clientes') {
        let clientesLimpios = [];
        let registradosVistos = new Set();

        docs.forEach(doc => {
            if (_esAnulado(doc)) return;   // una factura anulada no representa al cliente
            const nombreDoc = String(doc.cliente || "").trim();
            const nombreUpper = nombreDoc.toUpperCase();
            const cuitDoc = String(doc.cuit || "").replace(/\D/g, "");

            if (!nombreDoc || nombreUpper.includes("IMPORTADO") || nombreUpper.includes("ARCA") || nombreUpper.includes("⚠️")) return;

            const claveUnica = cuitDoc || nombreUpper;
            if (!registradosVistos.has(claveUnica)) {
                registradosVistos.add(claveUnica);
                clientesLimpios.push(doc);
            }
        });

        docs = clientesLimpios;
        docs.sort((a, b) => (a.cliente || '').localeCompare(b.cliente || ''));

        tablaHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width:40px; text-align:center; font-size:${szHead}; padding:${paddingTd};">#</th>
                    <th style="font-size:${szHead}; padding:${paddingTd};">Cliente / Gimnasio</th>
                    <th style="width:160px; font-size:${szHead}; padding:${paddingTd};">CUIT</th>
                    <th style="width:100px; text-align:center; font-size:${szHead}; padding:${paddingTd};">Tipo Factura</th>
                    <th style="width:130px; text-align:center; font-size:${szHead}; padding:${paddingTd};">Última Factura</th>
                </tr>
            </thead>
            <tbody>
                ${docs.map((doc, i) => {
                    const bgRow = i % 2 === 0 ? '#ffffff' : '#f8f9fc';
                    const factNum = String(doc.numFactura || '—');
                    let tipoLetra = 'B';
                    if (factNum.toUpperCase().includes('A')) tipoLetra = 'A';
                    else if (factNum.toUpperCase().includes('NC')) tipoLetra = 'NC';

                    return `
                    <tr style="background:${bgRow};">
                        <td style="padding:${paddingTd}; font-size:${szBody}; color:#6b7280; text-align:center; border-bottom:1px solid #e5e7eb;">${i+1}</td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; font-weight:700; color:#111827; border-bottom:1px solid #e5e7eb;">${doc.cliente || '—'}</td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; font-weight:700; color:#475467; border-bottom:1px solid #e5e7eb;">${doc.cuit || '—'}</td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; font-weight:900; text-align:center; border-bottom:1px solid #e5e7eb;">
                            <span style="background:${tipoLetra==='A'?'#10b981':'#3b82f6'}22; color:${tipoLetra==='A'?'#047857':'#1d4ed8'}; padding:3px 10px; border-radius:4px;">${tipoLetra}</span>
                        </td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; font-weight:700; text-align:center; color:#374151; border-bottom:1px solid #e5e7eb;">${factNum}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    } else {
        const columnasSeleccionadas = [colPagado && 'Pagado', colAdeuda && 'Adeuda', colReclamo && 'Reclamo'].filter(Boolean);
        const headerColsHtml = columnasSeleccionadas.map(c => `<th style="width:70px; text-align:center; font-size:${szHead}; padding:${paddingTd};">${c} <span style="font-size:${fuenteGrande?'10px':'8px'}; font-weight:400; display:block;">(✓/✗)</span></th>`).join('');

        tablaHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width:28px; text-align:center; font-size:${szHead}; padding:${paddingTd};">#</th>
                    <th>Cliente / CUIT</th>
                    <th style="width:45px;">Tipo</th>
                    <th style="width:80px;">Factura</th>
                    <th style="width:85px; text-align:right;">Monto</th>
                    <th style="width:62px; text-align:center;">Fecha</th>
                    ${headerColsHtml}
                </tr>
            </thead>
            <tbody>
                ${docs.map((doc, i) => {
                    const anul  = _esAnulado(doc);
                    const bgRow = anul ? '#f3f4f6' : (i % 2 === 0 ? '#ffffff' : '#f8f9fc');
                    const factNum = _numFacturaLimpio(doc.numFactura) || '—';
                    const tachado = anul ? 'text-decoration:line-through; color:#9ca3af;' : '';
                    const tipoBadge = doc._tipo === 'abono' ? '#1d4ed8' : doc._tipo === 'reparacion' ? '#15803d' : doc._tipo === 'presup_enviado' ? '#6b21a8' : '#92400e';
                    const tipoLabel = doc._tipo === 'abono' ? 'Abono' : doc._tipo === 'reparacion' ? 'Rep.' : doc._tipo === 'presup_enviado' ? 'Env.' : '?';

                    const pagadoDoc = String(doc.pagado || '').trim().toLowerCase() === 'pagado';
                    const szBox = fuenteGrande ? '20px' : '15px';
                    const checkBoxesHtml = anul
                      ? (columnasSeleccionadas.length
                          ? `<td colspan="${columnasSeleccionadas.length}" style="text-align:center; border-bottom:1px solid #e5e7eb; padding:${paddingTd}; font-size:${szMeta}; font-weight:900; color:#b91c1c; letter-spacing:.5px;">ANULADA${doc.numNC ? '<br><span style="font-weight:700; color:#6b7280;">' + doc.numNC + '</span>' : ''}</td>`
                          : '')
                      : columnasSeleccionadas.map(col => {
                        if (pagadoDoc && col === 'Pagado') {
                            return `<td style="text-align:center; border-bottom:1px solid #e5e7eb; padding:${paddingTd};">
                                <div style="width:${szBox}; height:${szBox}; border:1.5px solid #111; border-radius:4px; margin:0 auto; background:#fff; color:#111; font-weight:900; font-size:${fuenteGrande?'16px':'12px'}; line-height:${szBox}; text-align:center;">✓</div>
                            </td>`;
                        }
                        if (pagadoDoc) {
                            return `<td style="background:#000; border-bottom:1px solid #e5e7eb; padding:${paddingTd};"></td>`;
                        }
                        return `<td style="text-align:center; border-bottom:1px solid #e5e7eb; padding:${paddingTd};">
                            <div style="width:${szBox}; height:${szBox}; border:1.5px solid #9ca3af; border-radius:4px; margin:0 auto; background:#fff;"></div>
                        </td>`;
                    }).join('');

                    return `
                    <tr style="background:${bgRow};">
                        <td style="padding:${paddingTd}; font-size:${szBody}; color:#6b7280; text-align:center; border-bottom:1px solid #e5e7eb;">${i+1}</td>
                        <td style="padding:${paddingTd}; border-bottom:1px solid #e5e7eb;">
                            <div style="font-size:${szBody}; font-weight:700; color:#111827;">${doc.cliente || '—'}</div>
                            <div style="font-size:${szMeta}; color:#6b7280;">${doc.cuit || ''}</div>
                        </td>
                        <td style="padding:${paddingTd}; border-bottom:1px solid #e5e7eb;">
                            <span style="display:inline-block; background:${tipoBadge}1a; color:${tipoBadge}; border-radius:4px; padding:1px 5px; font-size:${szMeta}; font-weight:700;">${tipoLabel}</span>
                        </td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; font-weight:700; color:#1e3a8a; border-bottom:1px solid #e5e7eb; ${tachado}">${factNum}</td>
                        <td style="padding:${paddingTd}; font-size:${fuenteGrande?'16px':'12px'}; font-weight:900; color:#1d4ed8; text-align:right; border-bottom:1px solid #e5e7eb; ${tachado}">
                            $${Number(doc.total || 0).toLocaleString('es-AR')}
                        </td>
                        <td style="padding:${paddingTd}; font-size:${szBody}; color:#374151; text-align:center; border-bottom:1px solid #e5e7eb;">${doc.fechaLimpia || ''}</td>
                        ${checkBoxesHtml}
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    }

    const docsVigentes = docs.filter(d => !_esAnulado(d));          // las anuladas se listan pero NO suman
    const nAnuladasLista = docs.length - docsVigentes.length;
    const totalGeneral = docsVigentes.reduce((s, d) => s + Number(d.total || 0), 0);
    const tituloRango  = desde && hasta ? `${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}` : 'Todos los registros';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
        @page { size: A4 portrait; margin: 15mm 12mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: 'Arial', sans-serif; font-size: ${szBody}; color: #1f2937; margin:0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        thead tr { background: #1e40af; color: white; }
        thead th { font-weight: 700; text-align: left; padding: 8px; }
        .firma-box { border: 1.5px solid #d1d5db; border-radius: 6px; padding: 8px; text-align: center; background: #f9fafb; }
    </style>
    </head><body>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #1e40af;">
        <div>
            <div style="font-size:${szTitle}; font-weight:900; color:#1e40af;">Support Fitness</div>
            <div style="font-size:${szSub}; color:#6b7280; margin-top:2px;">Servicio Técnico para Gimnasios</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:${szSub}; font-weight:800; color:#111827;">${formatoReporte==='clientes'?'📋 Lista de Clientes y CUIT':'📋 Control de Facturación'}</div>
            <div style="font-size:${szBody}; font-weight:800; color:#4c1d95; margin-top:4px; background:#f3e8ff; padding:2px 8px; border-radius:4px; display:inline-block; border: 1px solid #d8b4fe;">${subTituloCliente}</div>
            <div style="font-size:${szBody}; color:#6b7280; margin-top:4px;">${tituloRango}</div>
            <div style="font-size:${szMeta}; color:#9ca3af; margin-top:2px;">Generado: ${new Date().toLocaleDateString('es-AR')}</div>
        </div>
    </div>

    ${tablaHTML}

    <div style="text-align:right; margin-top:0px; padding:10px; background:#eff6ff; border-bottom:2px solid #1e40af; font-size:${szBody}; font-weight:900; color:#1e3a8a;">
        TOTAL EN RANGO: $${Math.round(totalGeneral).toLocaleString('es-AR')} (${docsVigentes.length} Documentos${nAnuladasLista ? ' · ' + nAnuladasLista + ' anulada' + (nAnuladasLista>1?'s':'') + ' no incluida' + (nAnuladasLista>1?'s':'') : ''})
    </div>

    ${formatoReporte==='control' && colPagado ? `<div style="font-size:${szMeta}; color:#6b7280; margin-top:8px;">✓ = pagado &nbsp;·&nbsp; celda negra = no corresponde (documento ya pagado)</div>` : ''}

    <div style="margin-top:30px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
        ${['Revisado por','Aprobado por','Fecha de revisión'].map(l => 
            `<div class="firma-box"><div style="font-size:${szMeta}; color:#6b7280; margin-bottom:30px;">${l}</div><div style="border-top:1px solid #9ca3af; padding-top:4px; font-size:${szMeta}; color:#9ca3af;">Firma / Aclaración</div></div>`
        ).join('')}
    </div>
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) {
        win.onload = function() {
            setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 600);
        };
    } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_${textoBuscado ? textoBuscado.replace(/\s+/g, '_') : 'General'}_${desde}_${hasta}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    mostrarMensaje(`✅ Reporte generado exitosamente.`, 'exito');
}

// ════════════════════════════════════════════════════════════════
//  📅 BARRA DE DESPLAZAMIENTO DE FECHAS (chips de mes)
//  · barra visible · flechas ‹ › · rueda del mouse · arrastrar · centra el mes activo
// ════════════════════════════════════════════════════════════════
function _actualizarFlechasMeses(el) {
    const wrap = el && el.closest('.meses-wrap');
    if (!wrap) return;
    const hayOverflow = el.scrollWidth > el.clientWidth + 2;
    wrap.classList.toggle('sin-overflow', !hayOverflow);
    wrap.classList.toggle('scroll-ini', el.scrollLeft <= 2);
    wrap.classList.toggle('scroll-fin', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
}

function scrollMeses(dir) {
    const el = document.getElementById('meses-scroll');
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(140, el.clientWidth * 0.7), behavior: 'smooth' });
}

function _initMesesScroll(el) {
    if (!el || el.dataset.scrollInit) return;
    el.dataset.scrollInit = '1';

    // Rueda del mouse -> desplazamiento horizontal
    el.addEventListener('wheel', e => {
        if (el.scrollWidth <= el.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });

    // Arrastrar con el mouse
    let abajo = false, movido = false, x0 = 0, l0 = 0;
    el.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') return;
        abajo = true; movido = false; x0 = e.clientX; l0 = el.scrollLeft;
    });
    window.addEventListener('pointermove', e => {
        if (!abajo) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 4) { movido = true; el.classList.add('arrastrando'); }
        if (movido) el.scrollLeft = l0 - dx;
    });
    window.addEventListener('pointerup', () => {
        if (!abajo) return;
        abajo = false; el.classList.remove('arrastrando');
        setTimeout(() => { movido = false; }, 0);
    });
    el.addEventListener('click', e => { if (movido) { e.stopPropagation(); e.preventDefault(); } }, true);

    el.addEventListener('scroll', () => _actualizarFlechasMeses(el), { passive: true });
    window.addEventListener('resize', () => _actualizarFlechasMeses(el));
}

// ════════════════════════════════════════════════════════════════
//  🔎 REVISIÓN DE NOTAS DE CRÉDITO
//  Pregunta qué factura anula cada nota cuando el algoritmo no puede decidirlo solo
//  (hay una igual del mismo día / hasta 5 días después, o el importe no coincide)
//  y permite corregir vínculos anteriores.
// ════════════════════════════════════════════════════════════════
function _ncrEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const _ncrMoneda = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

function cerrarRevisionNC() {
    document.getElementById('_modal-nc')?.remove();
    if (window._ncrCambios) {
        window._ncrCambios = false;
        obtenerYRenderizarCreados(true);        // refresca la lista con lo corregido
    }
}

async function abrirRevisionNC(ncForzada) {
    document.getElementById('_modal-nc')?.remove();
    window._ncrCambios = false;

    const ov = document.createElement('div');
    ov.id = '_modal-nc';
    ov.className = 'ncr-overlay';
    ov.innerHTML = `
        <div class="ncr-box">
            <div class="ncr-head">
                <div>
                    <h3>🔎 ${ncForzada ? 'Corregir nota de crédito' : 'Notas de crédito para revisar'}</h3>
                    <p id="ncr-sub">Buscando en Base ARCA…</p>
                </div>
                <button class="ncr-x" onclick="cerrarRevisionNC()">✕</button>
            </div>
            <div class="ncr-body" id="ncr-body">
                <div class="ncr-cargando"><span class="spinner-mini"></span> Analizando notas de crédito…</div>
            </div>
        </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) cerrarRevisionNC(); });
    document.body.appendChild(ov);

    try {
        const res = await llamarAPI({ accion: 'obtenerRevisionNotasCredito', payload: ncForzada ? { nc: ncForzada } : {} }, 90000);
        if (!res || !res.ok) throw new Error((res && res.error) || 'No se pudo analizar.');
        window._ncrItems = res.items || [];
        _ncrRender();
    } catch (e) {
        const b = document.getElementById('ncr-body');
        if (b) b.innerHTML = `<div class="ncr-vacio">❌ ${_ncrEsc(e.message)}</div>`;
    }
}

function _ncrRender() {
    const items = window._ncrItems || [];
    const sub = document.getElementById('ncr-sub');
    const body = document.getElementById('ncr-body');
    if (!body) return;
    const pend = items.filter(i => !i._hecho).length;
    if (sub) sub.textContent = items.length
        ? (pend ? `${pend} pendiente${pend > 1 ? 's' : ''} · elegí qué factura anula cada nota` : '✅ Todo resuelto')
        : 'Nada para revisar';

    if (!items.length) {
        body.innerHTML = `<div class="ncr-vacio">✅ No hay notas de crédito dudosas.<br><span>Todas las notas de ARCA están vinculadas a una factura.</span></div>`;
        return;
    }

    const textoMotivo = {
        ambigua:          'Hay una factura igual del <b>mismo día (o hasta 5 días después)</b> y otra anterior. Si se anuló y se volvió a emitir igual, elegí cuál es la que se anula.',
        sin_factura:      'Ninguna factura de este CUIT tiene el <b>mismo importe</b> (¿nota de crédito parcial?). Elegí la factura que corresponde:',
        revisar_asignada: 'Se vinculó automáticamente, pero hay otra posibilidad. Confirmá cuál es la correcta.',
        corregir:         'Elegí la factura que realmente anula esta nota de crédito.'
    };
    const relTxt = c => c.relacion === 'mismo_dia' ? 'mismo día de la nota'
                     : c.relacion === 'posterior' ? `${c.difDias} día${c.difDias > 1 ? 's' : ''} después de la nota`
                     : `${Math.abs(c.difDias)} día${Math.abs(c.difDias) === 1 ? '' : 's'} antes de la nota`;

    body.innerHTML = items.map((it, i) => {
        if (it._hecho) return `<div class="ncr-card ncr-hecho"><b>✅ ${_ncrEsc(it.nc)}</b> — ${_ncrEsc(it._hecho)}</div>`;
        const cands = (it.candidatas || []).map(c => `
            <label class="ncr-cand">
                <input type="radio" name="ncr-${i}" value="${_ncrEsc(c.nro)}" onchange="document.getElementById('ncr-ok-${i}').disabled=false">
                <div class="ncr-cand-txt">
                    <div><b>Factura ${_ncrEsc(c.nro)}</b>
                        ${c.nro === it.asignada ? '<span class="ncr-tag actual">vinculada ahora</span>' : ''}
                        ${c.nro === it.sugerida && c.nro !== it.asignada ? '<span class="ncr-tag sug">anterior más cercana</span>' : ''}
                        ${c.relacion !== 'anterior' ? '<span class="ncr-tag cerca">' + (c.relacion === 'mismo_dia' ? 'mismo día' : 'posterior') + '</span>' : ''}
                        ${!c.mismoImporte ? '<span class="ncr-tag dif">importe distinto</span>' : ''}
                        ${!c.existe ? '<span class="ncr-tag nueva">se agrega a la lista</span>' : ''}
                    </div>
                    <div class="ncr-cand-meta">${_ncrEsc(c.fecha)} (${relTxt(c)}) · <b>${_ncrMoneda(c.importe)}</b>${c.cliente ? ' · ' + _ncrEsc(c.cliente) : ''}</div>
                </div>
            </label>`).join('') || `<div class="ncr-vacio" style="padding:10px;">No se encontraron facturas de este CUIT en Base ARCA.</div>`;

        return `
        <div class="ncr-card" id="ncr-card-${i}">
            <div class="ncr-nc">🔄 <b>${_ncrEsc(it.nc)}</b> · ${_ncrEsc(it.fecha)} · <b>${_ncrMoneda(it.importe)}</b></div>
            <div class="ncr-sub">${it.cliente ? _ncrEsc(it.cliente) + ' · ' : ''}CUIT ${_ncrEsc(it.cuit)}</div>
            <div class="ncr-motivo">${textoMotivo[it.motivo] || ''}</div>
            <div class="ncr-cands">${cands}</div>
            <div class="ncr-err" id="ncr-err-${i}"></div>
            <div class="ncr-actions">
                <button class="ncr-ok" id="ncr-ok-${i}" disabled onclick="_ncrAplicar(${i})">✔ Anula la seleccionada</button>
                <button class="ncr-no" onclick="_ncrIgnorar(${i})" title="Esta nota de crédito no anula ninguna factura (ej. nota parcial). No se vuelve a preguntar.">No anula ninguna</button>
            </div>
        </div>`;
    }).join('');
}

async function _ncrAplicar(i) {
    const it = (window._ncrItems || [])[i];
    const sel = document.querySelector(`input[name="ncr-${i}"]:checked`);
    if (!it || !sel) return;
    const btn = document.getElementById('ncr-ok-' + i);
    const err = document.getElementById('ncr-err-' + i);
    if (err) err.textContent = '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-mini"></span> Guardando…'; }
    try {
        const r = await llamarAPI({ accion: 'aplicarNotaCredito', payload: { nc: it.nc, factura: sel.value } }, 60000);
        if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo guardar.');
        it._hecho = r.mensaje || ('anula ' + sel.value);
        window._ncrCambios = true;
        _ncrRender();
    } catch (e) {
        if (err) err.textContent = '❌ ' + e.message;
        if (btn) { btn.disabled = false; btn.textContent = '✔ Anula la seleccionada'; }
    }
}

async function _ncrIgnorar(i) {
    const it = (window._ncrItems || [])[i];
    if (!it) return;
    const ok = await modalConfirmar({
        titulo: '¿No anula ninguna factura?',
        mensaje: `${it.nc} quedará sin vincular y no se volverá a preguntar.` + (it.asignada ? `\nLa factura ${it.asignada} seguirá anulada hasta que la reasignes.` : ''),
        icono: '🔄', color: '#d93025', btnOk: 'Confirmar', btnCancel: 'Volver'
    });
    if (!ok) return;
    try {
        const r = await llamarAPI({ accion: 'aplicarNotaCredito', payload: { nc: it.nc, ignorar: true } }, 60000);
        if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo guardar.');
        it._hecho = 'no anula ninguna factura';
        _ncrRender();
    } catch (e) {
        const err = document.getElementById('ncr-err-' + i);
        if (err) err.textContent = '❌ ' + e.message;
    }
}