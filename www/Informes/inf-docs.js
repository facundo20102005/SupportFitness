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
async function obtenerYRenderizarCreados() {
    const contenedor = document.getElementById('contenedor-informes-creados');
    if (!contenedor) return;

    // Skeleton loader con CSS (más limpio, sin inline styles)
    contenedor.innerHTML = `
        <div style="padding:12px 0;">
            ${[1,2,3].map(() => `
            <div style="background:var(--inf-card,rgba(255,255,255,0.03)); border-radius:14px; padding:16px; margin-bottom:10px; border:1px solid var(--inf-border,rgba(255,255,255,0.06));">
                <div class="inf-skeleton inf-skeleton-line inf-skeleton-line--medium" style="margin-bottom:10px;"></div>
                <div class="inf-skeleton inf-skeleton-line inf-skeleton-line--short"></div>
            </div>`).join('')}
        </div>`;

    const hojaReq = modoApp === 'ofertas' ? HOJA_OFERTAS : HOJA_PRESUPUESTOS;

    try {
        documentosGuardados = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: hojaReq } });
        renderizarTarjetas();
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
                <button onclick="obtenerYRenderizarCreados()"
                        style="background:#1a73e8; color:white; border:none; padding:12px 24px;
                               border-radius:10px; font-weight:900; font-size:14px; cursor:pointer;">
                    🔄 Reintentar
                </button>
            </div>`;
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

// ── Debounce para el buscador (evita renderizar en cada tecla) ───
let _searchTimer = null;
function _debounceSearch(val) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        window._paginaDocsActual = 0;  // reset a página 1 en nueva búsqueda
        renderizarTarjetas();
    }, 280);  // 280ms — suficiente para no percibir el delay
}

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

    // 6. PAGINACIÓN — máximo 15 docs por página para no crear 1600+ nodos DOM
    const DOCS_POR_PAG = 15;
    if (typeof _paginaDocsActual === 'undefined') window._paginaDocsActual = 0;

    // Reset a página 0 si cambió el filtro/búsqueda
    const _keyFiltro = textoBuscado + filtroPagoActual + filtroMesActual;
    if (window._keyFiltroAnterior !== _keyFiltro) {
        window._paginaDocsActual  = 0;
        window._keyFiltroAnterior = _keyFiltro;
    }

    const totalPags  = Math.ceil(finales.length / DOCS_POR_PAG);
    const paginados  = finales.slice(
        window._paginaDocsActual * DOCS_POR_PAG,
        (window._paginaDocsActual + 1) * DOCS_POR_PAG
    );

    // 7. TARJETAS CON NUEVO DISEÑO
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
                <div class="inf-flex-1">
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
                    ${doc.cliente ? `<button class="btn-doc-edit" style="background:#4a1d96; color:white; border:none;"
                        onclick="verFotosEnDrive('${(doc.cliente||'').replace(/'/g,'')}', '${doc.fechaLimpia||''}')"
                        title="Ver fotos de la visita en Google Drive">
                        🖼️ Ver Fotos
                    </button>` : ''}
                </div>
                <!-- Acciones rápidas: PDF y Mail -->
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button onclick="abrirVistaPresupuesto(${doc.id}, this)"
                            style="flex:1; padding:11px; background:linear-gradient(135deg,#1a73e8,#1155cc);
                                   color:white; border:none; border-radius:10px; font-weight:900;
                                   font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(26,115,232,0.35);
                                   display:flex; align-items:center; justify-content:center; gap:6px;
                                   transition:all 0.2s; min-height:44px;">
                        📄 Ver y Exportar PDF
                    </button>
                    <button onclick="prepararMail(${doc.id})"
                            style="flex:1; padding:11px; background:linear-gradient(135deg,#0f9d58,#0b7a42);
                                   color:white; border:none; border-radius:10px; font-weight:900;
                                   font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(15,157,88,0.35);
                                   display:flex; align-items:center; justify-content:center; gap:6px;
                                   transition:all 0.2s; min-height:44px;">
                        📧 Preparar Mail
                    </button>
                </div>
            </div>
        `;
        contenedor.appendChild(div);
    });

    // ── Controles de paginación ───────────────────────────────────
    if (totalPags > 1) {
        const navEl = document.createElement('div');
        navEl.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:10px; padding:18px 0 8px; flex-wrap:wrap;';

        const btnAnterior = document.createElement('button');
        btnAnterior.textContent = '← Anterior';
        btnAnterior.disabled = window._paginaDocsActual === 0;
        btnAnterior.className = 'inf-btn inf-btn--gris inf-btn--sm';
        btnAnterior.onclick = () => { window._paginaDocsActual--; renderizarTarjetas(); contenedor.scrollIntoView({ behavior:'smooth', block:'start' }); };

        const info = document.createElement('span');
        info.style.cssText = 'font-size:13px; font-weight:700; color:var(--inf-sub,#94a3b8);';
        info.textContent = `Página ${window._paginaDocsActual + 1} de ${totalPags}  (${finales.length} docs)`;

        const btnSiguiente = document.createElement('button');
        btnSiguiente.textContent = 'Siguiente →';
        btnSiguiente.disabled = window._paginaDocsActual >= totalPags - 1;
        btnSiguiente.className = 'inf-btn inf-btn--gris inf-btn--sm';
        btnSiguiente.onclick = () => { window._paginaDocsActual++; renderizarTarjetas(); contenedor.scrollIntoView({ behavior:'smooth', block:'start' }); };

        navEl.appendChild(btnAnterior);
        navEl.appendChild(info);
        navEl.appendChild(btnSiguiente);
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