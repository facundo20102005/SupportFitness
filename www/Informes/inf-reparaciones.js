// ════════════════════════════════════════════════════════════════
//  inf-reparaciones.js v5 — Asesor de Reparaciones LIMPIO
//  Todos los cambios de estado usan modal overlay (sin dropdown)
//  Sin <script> tags ni position:absolute que rompen el layout
// ════════════════════════════════════════════════════════════════

const _COL = {
    bg:'#111827', card:'#1e293b', border:'rgba(255,255,255,0.08)',
    text:'#f1f5f9', muted:'#94a3b8', accent:'#60a5fa',
    green:'#4ade80', greenBg:'#0d4f2e', red:'#f87171', redBg:'#4a0e0e',
    orange:'#fb923c', orangeBg:'#3d2500', blue:'#60a5fa', blueBg:'#1e3a5f',
    surface:'#151f33',
};
const _MESES_R = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let _calcItems    = [];
let _repVisitas   = [];
let _repGymActivo = null;
let _repBusqueda  = '';
let _repMesFiltro = '';
let _repTabActivo = 'pendiente';
let _repUID       = 0;   // Contador global para IDs únicos

// ── Keywords → precios ───────────────────────────────────────────
let _kwMap = null;
function _getKwMap() {
    if (_kwMap) return _kwMap;
    _kwMap = {
        'cable fino':        ['Cable Acero Imp. Fino c/ terminales','Cable Acero Nac. Fino c/ terminales'],
        'cable grueso':      ['Cable Acero Imp. Grueso c/ terminales','Cable Acero Nac. Grueso c/ terminales'],
        'cable acero':       ['Cable Acero Imp. Fino c/ terminales','Cable Acero Imp. Grueso c/ terminales'],
        'cable':             ['Cable Acero Imp. Fino c/ terminales','Cable Acero Imp. Grueso c/ terminales',
                              'Cable Acero Nac. Fino c/ terminales','Cable Acero Nac. Grueso c/ terminales'],
        'banda cinta':       ['Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)'],
        'banda':             ['Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)',
                              'Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)'],
        'tabla cinta':       ['Tabla de Cinta'], 'tabla': ['Tabla de Cinta'],
        'cinta':             ['Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)','Tabla de Cinta'],
        'rodillo delantero': ['Reparación Rodillos Delantero'],
        'rodillo trasero':   ['Reparación Rodillos Trasero'],
        'rodillo':           ['Reparación Rodillos Delantero','Reparación Rodillos Trasero','Rodillos de apoya piernas/brazos'],
        'tapizado chico':    ['Tapizado Chico (asiento/apoyo pequeño)'],
        'tapizado mediano':  ['Tapizado Mediano (asiento/respaldo mediano)'],
        'tapizado grande':   ['Tapizado Grande (respaldo grande)'],
        'tapizado':          ['Tapizado Chico (asiento/apoyo pequeño)','Tapizado Mediano (asiento/respaldo mediano)','Tapizado Grande (respaldo grande)'],
        'asiento':           ['Tapizado Chico (asiento/apoyo pequeño)','Tapizado Mediano (asiento/respaldo mediano)'],
        'respaldo':          ['Tapizado Mediano (asiento/respaldo mediano)','Tapizado Grande (respaldo grande)'],
        'apoyo':             ['Tapizado Chico (asiento/apoyo pequeño)','Rodillos de apoya piernas/brazos'],
        'apoya':             ['Rodillos de apoya piernas/brazos'],
        'correa motor life': ['Correa Motor Life Fitness'],
        'correa bici':       ['Correas Bici'], 'correa eliptico': ['Correas Elíptico'],
        'correa':            ['Correas de Motor','Correas Bici','Correas Elíptico','Correa Motor Life Fitness'],
        'cadena spinner':    ['Cadenas Spinner 112L pro (Bicicleta)'],
        'cadena':            ['Cadenas Spinner 112L pro (Bicicleta)'],
        'placa':             ['Reparación Placas MCB'], 'mcb': ['Reparación Placas MCB'],
        'generador':         ['Reparación Generador (Bici/Elíptico)'],
        'bateria':           ['Bateria Interna 6v 4Ah'], 'batería': ['Bateria Interna 6v 4Ah'],
        'lubricante':        ['Litro de Lubricante'],
        'mosqueton':         ['Mosquetones'], 'mosquetón': ['Mosquetones'],
        'registro':          ['Registro de doble acción'],
        'instalacion':       ['Visita técnica para instalación + Mano de Obra'],
        'instalación':       ['Visita técnica para instalación + Mano de Obra'],
        'mano de obra':      ['Visita técnica para instalación + Mano de Obra'],
    };
    return _kwMap;
}

function _precioDeItem(nombre) {
    if (typeof PRECIOS_POR_CATEGORIA === 'undefined') return null;
    for (const [, items] of Object.entries(PRECIOS_POR_CATEGORIA)) {
        if (items[nombre]) {
            const info = items[nombre];
            const p = info.moneda === 'USD'
                ? Math.round(info.precio * (valorDolarOficial || 1000))
                : Math.round(info.precio);
            return { nombre, precioARS: p, info };
        }
    }
    return null;
}

function _sugerirItems(desc) {
    const d = (desc || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    const kws = Object.keys(_getKwMap()).sort((a, b) => b.length - a.length);
    const visto = new Set(), out = [];
    for (const kw of kws) {
        if (!d.includes(kw)) continue;
        for (const n of _getKwMap()[kw]) {
            if (visto.has(n)) continue;
            visto.add(n);
            const p = _precioDeItem(n);
            if (p) out.push(p);
        }
    }
    return out;
}

function _extraerCant(desc) {
    const c = {}, d = desc || '';
    const mM = d.match(/[x×*]\s*(\d+(?:[.,]\d+)?)\s*m(?:trs?|etros?)?/i) ||
               d.match(/(\d+(?:[.,]\d+)?)\s*m(?:etros?|trs?)\b/i);
    if (mM) c.metros = parseFloat(mM[1].replace(',', '.'));
    const rM = d.match(/(\d+)\s*rodillos?/i); if (rM) c.rodillos = parseInt(rM[1]);
    const cM = d.match(/[x×]?\s*(\d+)\s*cables?/i); if (cM) c.cables = parseInt(cM[1]);
    const tM = d.match(/(\d+)\s*terminales?/i); if (tM) c.terminales = parseInt(tM[1]);
    if (/tapizado\s+chico/i.test(d))   c.tapTipo = 'Chico';
    if (/tapizado\s+mediano/i.test(d)) c.tapTipo = 'Mediano';
    if (/tapizado\s+grande/i.test(d))  c.tapTipo = 'Grande';
    return c;
}

function _fmtARS(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }

// ════════════════════════════════════════════════════════════════
//  CALCULADORA
// ════════════════════════════════════════════════════════════════
// ── Agregar item a la calculadora ───────────────────────────────
// precioARS = precio POR METRO en ARS (para cables) o precio total (para otros)
// precioBaseUSD = precio original en USD por metro (0 si es ARS)
function _calcAgregar(nombre, precioARS, cant, metros, terminales, precioBaseUSD) {
    cant = parseInt(cant) || 1;
    const esCable = nombre.toLowerCase().includes('cable');
    const idx = _calcItems.findIndex(i => i.nombre === nombre);
    if (idx >= 0) {
        _calcItems[idx].cant += cant;
        if (metros)     _calcItems[idx].metros    = (_calcItems[idx].metros || 0) + metros;
        if (terminales !== null && terminales !== undefined) _calcItems[idx].terminales = terminales;
    } else {
        _calcItems.push({ nombre, precioARS, cant, metros: metros || null,
                          terminales: terminales !== null && terminales !== undefined ? terminales : (esCable ? 2 : null),
                          precioBaseUSD: precioBaseUSD || 0 });
    }
    _renderCalc();
    document.getElementById('_rep-calc')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _calcQuitarItem(idx) { _calcItems.splice(idx, 1); _renderCalc(); }
function _calcLimpiar()       { _calcItems = []; _repGymActivo = null; _renderCalc(); }
function _calcEditarCant(idx, v)  { const n = parseInt(v);         if (n > 0)  { _calcItems[idx].cant        = n; _renderCalc(); } }
function _calcEditarPrecio(idx,v) { const n = parseInt(String(v).replace(/[^0-9]/g,'')); if (n > 0) { _calcItems[idx].precioARS = n; _renderCalc(); } }
function _calcEditarMetros(idx,v) { const n = parseFloat(v);       if (n > 0)  { _calcItems[idx].metros      = n; _renderCalc(); } }
function _calcEditarTerm(idx, v)  { const n = parseInt(v);         if (n >= 0) { _calcItems[idx].terminales  = n; _renderCalc(); } }

function _renderCalc() {
    const cuerpo = document.getElementById('_rep-calc-cuerpo');
    const total  = document.getElementById('_rep-calc-total');
    const gymLbl = document.getElementById('_rep-calc-gym');
    if (!cuerpo) return;
    if (gymLbl) gymLbl.textContent = _repGymActivo ? '🏋️ ' + _repGymActivo : '';
    if (!_calcItems.length) {
        cuerpo.innerHTML = '<p style="color:' + _COL.muted + ';font-size:13px;text-align:center;padding:10px 0;">Tocá [+ Agregar] en una tarjeta o usá la Lista de Precios.</p>';
        if (total) total.innerHTML = '';
        return;
    }
    // ── Fórmula EXACTA igual a inf-ui.js → actualizarPrecioItem ──────────
    // totalUSD = metros × precioMetroUSD + terminales × 10USD
    // totalARS = totalUSD × dólar × cant
    const PRECIO_TERMINAL_USD = (typeof SF_PRECIO_TERMINAL_USD !== "undefined") ? SF_PRECIO_TERMINAL_USD : 10;
    const dolarActual = (typeof valorDolarOficial !== 'undefined' && valorDolarOficial > 100) ? valorDolarOficial : 1000;
    const dolarEl = document.getElementById('_rep-calc-dolar');
    if (dolarEl) {
        dolarEl.textContent = '\u{1F4B1} USD = $' + Math.round(dolarActual).toLocaleString('es-AR')
            + (dolarActual === 1000 ? ' (estimado)' : ' (oficial)');
        dolarEl.style.color = dolarActual === 1000 ? _COL.orange : _COL.green;
    }
    let subtotal = 0;
    const rows = _calcItems.map(function(item, idx) {
        const esCable = item.nombre.toLowerCase().includes('cable');
        const metros  = (esCable && item.metros) ? item.metros : 1;
        const terms   = (esCable && item.terminales !== null && item.terminales !== undefined) ? item.terminales : 0;
        let tot;
        if (esCable && item.precioBaseUSD > 0) {
            const totalUSD = (metros * item.precioBaseUSD) + (terms * PRECIO_TERMINAL_USD);
            tot = Math.round(totalUSD * dolarActual) * item.cant;
        } else if (esCable) {
            tot = Math.round((item.precioARS * metros + PRECIO_TERMINAL_USD * dolarActual * terms) * item.cant);
        } else {
            tot = item.precioARS * item.cant;
        }
        subtotal += tot;
        const termVal   = esCable ? (item.terminales !== null && item.terminales !== undefined ? item.terminales : 2) : 0;
        const precioUnit = esCable ? 0 : item.precioARS;  // cable usa fórmula distinta
        const ivaUnit    = !esCable && item.cant > 1 ? Math.round(precioUnit * 0.21) : 0;
        const totConIVA  = tot + Math.round(tot * 0.21);

        return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">'
            + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<button onclick="_calcQuitarItem(' + idx + ')" style="background:none;border:none;color:' + _COL.red + ';cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0;">✖</button>'
            + '<div style="flex:1;font-size:12px;font-weight:700;color:' + _COL.text + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.nombre + '</div>'
            + '<div style="text-align:right;flex-shrink:0;">'
            + '<div style="font-size:13px;font-weight:900;color:#34d399;">' + _fmtARS(tot) + '</div>'
            + (item.cant > 1 && !esCable ? '<div style="font-size:9px;color:' + _COL.muted + ';">c/u: ' + _fmtARS(precioUnit) + '</div>' : '')
            + '</div>'
            + '</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:5px;padding-left:20px;">'
            + '<span style="font-size:10px;color:' + _COL.muted + ';">Cant:</span>'
            + '<input type="number" min="1" value="' + item.cant + '" oninput="_calcEditarCant(' + idx + ',this.value)" style="width:46px;padding:3px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:' + _COL.text + ';font-size:12px;text-align:center;">'
            // Precio editable (solo para no-cables):
            + (!esCable ? '<span style="font-size:10px;color:' + _COL.muted + ';">$:</span>'
                + '<input type="number" min="0" step="1000" value="' + precioUnit + '" oninput="_calcEditarPrecio(' + idx + ',this.value)" style="width:80px;padding:3px;border-radius:6px;border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);color:#fbbf24;font-size:12px;text-align:right;" title="Precio editable">' : '')
            + (esCable ? '<span style="font-size:10px;color:' + _COL.accent + ';">📏m:</span>'
                       + '<input type="number" min="0.5" step="0.5" value="' + metros + '" oninput="_calcEditarMetros(' + idx + ',this.value)" style="width:50px;padding:3px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.07);color:' + _COL.accent + ';font-size:12px;text-align:center;">'
                       + '<span style="font-size:10px;color:' + _COL.accent + ';">🔩t:</span>'
                       + '<input type="number" min="0" value="' + termVal + '" oninput="_calcEditarTerm(' + idx + ',this.value)" style="width:46px;padding:3px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.07);color:' + _COL.accent + ';font-size:12px;text-align:center;">'
                : '')
            + '</div>'
            + (esCable ? '<div style="font-size:10px;color:' + _COL.accent + ';margin-top:2px;padding-left:20px;">📏 ' + metros + 'm'
                + (item.precioBaseUSD > 0 ? ' × U$D' + item.precioBaseUSD + '/m' : ' × ' + _fmtARS(item.precioARS) + '/m')
                + (termVal > 0 ? ' · 🔩 ' + termVal + ' term. × U$D' + PRECIO_TERMINAL_USD : '')
                + '</div>' : '')
            + (item.cant > 1 && !esCable ? '<div style="font-size:10px;color:rgba(52,211,153,0.7);margin-top:2px;padding-left:20px;">'
                + item.cant + ' u. × ' + _fmtARS(precioUnit) + ' = ' + _fmtARS(tot) + ' s/IVA · ' + _fmtARS(totConIVA) + ' c/IVA'
                + '</div>' : '')
            + '</div>';
    }).join('');
    cuerpo.innerHTML = rows;
    const iva    = Math.round(subtotal * 0.21);
    const conIVA = subtotal + iva;
    if (total) total.innerHTML = ''
        + '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:' + _COL.muted + ';"><span>Subtotal s/IVA:</span><span>' + _fmtARS(subtotal) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:' + _COL.muted + ';"><span>IVA 21%:</span><span>' + _fmtARS(iva) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;padding:9px 0 4px;font-size:16px;font-weight:900;color:#34d399;border-top:1px solid rgba(255,255,255,0.1);margin-top:4px;"><span>TOTAL c/IVA:</span><span>' + _fmtARS(conIVA) + '</span></div>'
        + '<button onclick="_usarEnFormulario()" style="width:100%;margin-top:8px;padding:9px;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:white;border:none;border-radius:10px;font-weight:900;font-size:13px;cursor:pointer;">📋 Usar como base en Informes</button>';
}

// ── Lista de Precios propia (no depende de burbuja-precios oculta) ─
function _toggleListaRep() {
    const burb = document.getElementById('_rep-burbuja-precios');
    if (!burb) return;
    const abierta = burb.style.display !== 'none';
    burb.style.display = abierta ? 'none' : 'block';
    const btn = document.getElementById('_rep-btn-lista');
    if (btn) btn.textContent = abierta ? '📋 Lista de Precios' : '✖ Cerrar Lista';
    if (!abierta) _renderListaRep();
}

function _renderListaRep() {
    const cont = document.getElementById('_rep-lista-cont');
    if (!cont) return;
    if (typeof PRECIOS_POR_CATEGORIA === 'undefined') {
        cont.innerHTML = '<p style="color:' + _COL.muted + ';padding:10px;font-size:12px;">Lista no disponible.</p>';
        return;
    }
    const tasa = valorDolarOficial || 1000;
    let html = '<input type="text" placeholder="🔍 Buscar..." oninput="_filtrarListaInterna(this.value)"'
        + ' style="width:100%;padding:9px 12px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.12);'
        + 'background:rgba(255,255,255,0.06);color:' + _COL.text + ';font-size:13px;outline:none;'
        + 'box-sizing:border-box;margin-bottom:8px;" autocomplete="off">'
        + '<div id="_rep-lista-items">';
    Object.entries(PRECIOS_POR_CATEGORIA).forEach(function([cat, items]) {
        html += '<div><div style="font-size:10px;font-weight:900;color:' + _COL.accent + ';text-transform:uppercase;'
            + 'letter-spacing:0.5px;padding:6px 0 4px;border-top:1px solid rgba(255,255,255,0.06);">' + cat + '</div>';
        Object.entries(items).forEach(function([nombre, info]) {
            const esUSD = info.moneda === 'USD';
            const p     = esUSD ? Math.round(info.precio * tasa) : Math.round(info.precio);
            const lbl   = esUSD ? 'U$D ' + info.precio + ' → ' + _fmtARS(p) : _fmtARS(p);
            html += '<div class="_rep-li-item" data-nombre="' + nombre.toLowerCase().replace(/"/g,'') + '"'
                + ' onclick="_agregarDesdeListaRep(\'' + nombre.replace(/'/g, "\\'").replace(/"/g,'') + '\',' + p + ',' + (esUSD ? info.precio : 0) + ')"'
                + ' style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;'
                + 'border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;">'
                + '<span style="font-size:11.5px;color:' + _COL.text + ';flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nombre + '</span>'
                + '<span style="font-size:10px;color:' + _COL.muted + ';margin:0 6px;white-space:nowrap;">' + lbl + '</span>'
                + '<span style="font-size:10px;color:#34d399;white-space:nowrap;">+IVA: ' + _fmtARS(Math.round(p * 1.21)) + '</span>'
                + '</div>';
        });
        html += '</div>';
    });
    html += '</div>';
    cont.innerHTML = html;
}

function _filtrarListaInterna(texto) {
    const q = (texto || '').toLowerCase();
    document.querySelectorAll('#_rep-lista-items ._rep-li-item').forEach(function(el) {
        el.style.display = (!q || el.dataset.nombre.includes(q)) ? '' : 'none';
    });
}

function _agregarDesdeListaRep(nombre, precioARS, precioBaseUSD) { _calcAgregar(nombre, precioARS, 1, null, null, precioBaseUSD || 0); }

function _usarEnFormulario() {
    if (!_calcItems.length) return;
    if (typeof setModoApp === 'function') setModoApp('ofertas');
    setTimeout(function() {
        const gi = document.getElementById('input-gym');
        if (gi && _repGymActivo) { gi.value = _repGymActivo; if (typeof mostrarBurbujasFecha === 'function') mostrarBurbujasFecha(_repGymActivo); }
        const lista = document.getElementById('lista-maquinas-dom');
        if (lista) lista.innerHTML = '';
        _calcItems.forEach(function(item) { if (typeof agregarItem === 'function') agregarItem(item.nombre, item.precioARS, item.cant); });
        document.getElementById('area-trabajo')?.scrollIntoView({ behavior: 'smooth' });
    }, 350);
}

// ════════════════════════════════════════════════════════════════
//  MODAL FACTURA (también usado para editar una ya existente)
// ════════════════════════════════════════════════════════════════
function _abrirModalFactura(visita, prefillTipo, prefillNum) {
    document.getElementById('_rep-modal-factura')?.remove();
    const gym = visita.gym || '', remito = visita.remito || '';
    const esEdicion = !!prefillNum;

    // ── Auto-fill CUIT: buscar en múltiples fuentes ─────────────────────
    // 1. CUIT directo en el registro de la visita (si el backend lo devuelve)
    // 2. listaAbonosBase (clientes con abono activo)
    // 3. cuitGlobalDic en localStorage (diccionario acumulado por inf-api.js)
    // 4. Historial de visitas en memoria (_repVisitas) que ya tengan CUIT
    let cuit = visita.cuit || '';

    const gymNorm = gym.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    const _normCuit = function(c) { return String(c || '').replace(/\D/g, ''); };
    const _matchGym = function(g) {
        const gn = (g || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
        if (gn === gymNorm || gn.includes(gymNorm) || gymNorm.includes(gn)) return true;
        const wG = gymNorm.split(/\s+/).filter(function(w) { return w.length > 3; });
        const wD = gn.split(/\s+/).filter(function(w) { return w.length > 3; });
        if (!wG.length || !wD.length) return false;
        return wG.filter(function(w) { return wD.some(function(d) { return d === w || d.startsWith(w) || w.startsWith(d); }); }).length >= 2;
    };

    if (!cuit && window.listaAbonosBase) {
        const f = window.listaAbonosBase.find(function(a) { return _matchGym(a.gym); });
        if (f && f.cuit) cuit = f.cuit;
    }
    if (!cuit) {
        try {
            const dic = JSON.parse(localStorage.getItem('cuitGlobalDic') || '{}');
            for (const [c, g] of Object.entries(dic)) {
                if (_matchGym(g)) { cuit = c; break; }
            }
            // También buscar por CUIT normalizado si la visita lo trae
            if (!cuit && visita.cuit) {
                const vn = _normCuit(visita.cuit);
                for (const c of Object.keys(dic)) {
                    if (_normCuit(c) === vn) { cuit = c; break; }
                }
            }
        } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
    }
    if (!cuit && _repVisitas && _repVisitas.length) {
        const match = _repVisitas.find(function(v) { return _matchGym(v.gym) && v.cuit; });
        if (match) cuit = match.cuit;
    }
    // Fuente extra: buscar en Presupuestos_Emitidos (ARCA) por nombre del gym
    if (!cuit) {
        try {
            const arca = JSON.parse(sessionStorage.getItem('_arca_cuit_cache') || '{}');
            const gymKey = gymNorm.slice(0, 15);
            if (arca[gymKey]) cuit = arca[gymKey];
        } catch(e) {}
        // Lanzar búsqueda async para enriquecer el cache para la próxima vez
        (async function() {
            try {
                const docs = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: "Presupuestos_Emitidos" } }, 8000);
                if (!Array.isArray(docs)) return;
                const cache = {};
                docs.forEach(function(d) {
                    const rawGym = d.gimnasio || d.gym || d.cliente || '';
                    const dn = rawGym.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
                    const dc = String(d.cuit || d.CUIT || '').replace(/\D/g, '');
                    if (dn && dc) cache[dn.slice(0, 15)] = dc;
                });
                sessionStorage.setItem('_arca_cuit_cache', JSON.stringify(cache));
                // Si encontramos el CUIT ahora, actualizar el input
                const gymKey2 = gymNorm.slice(0, 15);
                if (cache[gymKey2]) {
                    const fCuit = document.getElementById('_fCuit');
                    if (fCuit && !fCuit.value) {
                        fCuit.value = cache[gymKey2];
                        fCuit.style.borderColor = 'rgba(110,231,183,0.3)';
                        fCuit.style.background  = 'rgba(110,231,183,0.06)';
                        const lbl = fCuit.previousElementSibling;
                        if (lbl) { lbl.textContent = '✅ CUIT — encontrado en ARCA'; lbl.style.color = '#6ee7b7'; }
                    }
                }
            } catch(e) {}
        })();
    }

    const tipoInicial = prefillTipo || 'B';
    const cuitLabel   = cuit ? '✅ CUIT encontrado automáticamente' : 'Ingresá el CUIT si no se completó';
    const modal = document.createElement('div');
    modal.id = '_rep-modal-factura';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = ''
        + '<div style="background:' + _COL.card + ';border-radius:18px;width:100%;max-width:420px;border:1px solid rgba(255,255,255,0.1);padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">'
        + '<div style="font-size:17px;font-weight:900;color:' + _COL.text + ';margin-bottom:4px;">' + (esEdicion ? '✏️ Editar Factura' : '✅ Registrar como Facturado') + '</div>'
        + '<div style="font-size:12px;color:' + _COL.muted + ';margin-bottom:18px;">' + gym + (remito ? ' · ' + remito : '') + '</div>'
        + '<label style="font-size:11px;color:' + _COL.muted + ';font-weight:700;display:block;margin-bottom:6px;">TIPO DE FACTURA</label>'
        + '<div style="display:flex;gap:10px;margin-bottom:16px;">'
        + '<button id="_fA" onclick="_selTF(\'A\')" style="flex:1;padding:11px;border-radius:10px;border:2px solid ' + (tipoInicial==='A'?'#3b82f6':'rgba(255,255,255,0.1)') + ';background:' + (tipoInicial==='A'?_COL.blueBg:'rgba(255,255,255,0.04)') + ';color:' + (tipoInicial==='A'?_COL.blue:_COL.muted) + ';font-weight:900;font-size:15px;cursor:pointer;">Factura A</button>'
        + '<button id="_fB" onclick="_selTF(\'B\')" style="flex:1;padding:11px;border-radius:10px;border:2px solid ' + (tipoInicial==='B'?'#3b82f6':'rgba(255,255,255,0.1)') + ';background:' + (tipoInicial==='B'?_COL.blueBg:'rgba(255,255,255,0.04)') + ';color:' + (tipoInicial==='B'?_COL.blue:_COL.muted) + ';font-weight:900;font-size:15px;cursor:pointer;">Factura B</button>'
        + '</div>'
        + '<label style="font-size:11px;color:' + _COL.muted + ';font-weight:700;display:block;margin-bottom:6px;">NÚMERO DE FACTURA</label>'
        + '<input id="_fNum" type="text" value="' + (prefillNum || '') + '" placeholder="Ej: 0002-00001234" style="width:100%;padding:11px;border-radius:10px;border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:' + _COL.text + ';font-size:14px;box-sizing:border-box;margin-bottom:8px;outline:none;">'
        + '<label style="font-size:11px;color:' + (cuit ? '#6ee7b7' : _COL.muted) + ';font-weight:700;display:block;margin-bottom:6px;">' + (cuit ? '✅ CUIT — completado automáticamente' : 'CUIT DEL CLIENTE') + '</label>'
        + '<input id="_fCuit" type="text" value="' + cuit + '" placeholder="30-XXXXXXXX-X" style="width:100%;padding:11px;border-radius:10px;border:1.5px solid ' + (cuit ? 'rgba(110,231,183,0.3)' : 'rgba(255,255,255,0.12)') + ';background:' + (cuit ? 'rgba(110,231,183,0.06)' : 'rgba(255,255,255,0.05)') + ';color:' + _COL.text + ';font-size:14px;box-sizing:border-box;margin-bottom:4px;outline:none;">'
        + '<div id="_fArca" style="font-size:10px;color:' + _COL.muted + ';margin-bottom:16px;min-height:14px;"></div>'
        + '<div style="display:flex;gap:10px;">'
        + '<button onclick="document.getElementById(\'_rep-modal-factura\').remove()" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:' + _COL.muted + ';font-weight:700;cursor:pointer;">Cancelar</button>'
        + '<button onclick="_confirmarFactura(\'' + remito.replace(/'/g, "\\'") + '\',\'' + gym.replace(/'/g, "\\'") + '\',\'' + (visita.fechaStr || '').replace(/'/g, "\\'") + '\')" style="flex:1;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#059669,#064e3b);color:white;font-weight:900;cursor:pointer;">' + (esEdicion ? '💾 Guardar cambios' : '✅ Confirmar') + '</button>'
        + '</div></div>';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    window._factTipo = tipoInicial;
    document.getElementById('_fNum')?.focus();
    _buscarMatchARCA(gym);
}

function _selTF(tipo) {
    window._factTipo = tipo;
    ['A', 'B'].forEach(function(t) {
        const b = document.getElementById('_f' + t);
        if (!b) return;
        b.style.border     = t === tipo ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)';
        b.style.background = t === tipo ? _COL.blueBg : 'rgba(255,255,255,0.04)';
        b.style.color      = t === tipo ? _COL.blue   : _COL.muted;
    });
}

// ── Busca en los presupuestos emitidos (ARCA) si hay un match por gym ──────
async function _buscarMatchARCA(gym) {
    const badge = document.getElementById('_fArca');
    if (!badge) return;
    badge.textContent = '🔍 Buscando en ARCA...';
    try {
        const docs = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: "Presupuestos_Emitidos" } }, SF_TIMEOUT?.API_DOLAR || 10000);
        if (!Array.isArray(docs)) { badge.textContent = ''; return; }
        const gymN = gym.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
        function _matchARCA(dn) {
            if (!dn || dn.length < 3) return false;
            if (dn === gymN || dn.includes(gymN) || gymN.includes(dn)) return true;
            const wG = gymN.split(/\s+/).filter(function(w) { return w.length > 3; });
            const wD = dn.split(/\s+/).filter(function(w) { return w.length > 3; });
            if (!wG.length || !wD.length) return false;
            return wG.filter(function(w) { return wD.some(function(d) { return d === w || d.startsWith(w) || w.startsWith(d); }); }).length >= 2;
        }
        const matches = docs.filter(function(d) {
            // Presupuestos_Emitidos usa "gimnasio" como header — también chequear "gym" y "cliente"
            const raw = d.gimnasio || d.gym || d.cliente || d.Gimnasio || '';
            const dn  = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
            return _matchARCA(dn);
        }).sort(function(a, b) {
            const fa = (a.fecha || a.periodo || '').replace(/\//g, '-');
            const fb = (b.fecha || b.periodo || '').replace(/\//g, '-');
            return fb.localeCompare(fa);
        }).slice(0, 3);
        if (!matches.length) {
            // FIX: si el CUIT ya está completo, el cliente está reconocido — no mostrar falsa alarma
            const cuitActual = (document.getElementById('_fCuit')?.value || '').replace(/\D/g, '');
            if (cuitActual && cuitActual.length >= 10) {
                badge.innerHTML = '<span style="color:#6ee7b7;">✅ CUIT verificado — sin facturas previas en ARCA</span>';
            } else {
                badge.innerHTML = '<span style="color:#fb923c;">⚠️ Sin historial en ARCA — ingresá el CUIT manualmente si falta.</span>';
            }
        } else {
            const last = matches[0];
            const gymShow = last.gimnasio || last.gym || last.cliente || gym;
            const factShow = last.factura || '';
            badge.innerHTML = '<span style="color:#6ee7b7;">✅ ARCA: ' + gymShow
                + (factShow ? ' · ' + factShow : '')
                + ((last.fecha || last.periodo) ? ' · ' + (last.fecha || last.periodo) : '')
                + '</span>';
        }
    } catch(e) { badge.textContent = ''; }
}

async function _confirmarFactura(remito, gym, fechaStr) {
    const tipo = window._factTipo || 'B';
    const num  = (document.getElementById('_fNum')?.value  || '').trim();
    const cuit = (document.getElementById('_fCuit')?.value || '').trim();
    if (!num) { document.getElementById('_fNum').style.borderColor = _COL.red; return; }
    const nroFact = 'Factura ' + tipo + ' N°' + num;

    // Guardar CUIT en el diccionario local para auto-completar futuros formularios
    if (cuit && gym) {
        try {
            const dic = JSON.parse(localStorage.getItem('cuitGlobalDic') || '{}');
            const cuitLimpio = cuit.replace(/\D/g, '');
            if (cuitLimpio) dic[cuitLimpio] = gym;
            localStorage.setItem('cuitGlobalDic', JSON.stringify(dic));
        } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
    }

    // Actualizar estado local inmediatamente (UX instantánea)
    const visita = _repVisitas.find(function(v) { return v.remito === remito && v.gym === gym; });
    if (visita) visita.facturado = nroFact;
    document.getElementById('_rep-modal-factura')?.remove();
    _setTabRep('facturado');

    // Persistir número de factura en localStorage por remito (sobrevive recargas)
    if (remito) {
        try {
            const fc = JSON.parse(localStorage.getItem('_rep_fact_cache') || '{}');
            fc[remito] = nroFact;
            localStorage.setItem('_rep_fact_cache', JSON.stringify(fc));
        } catch(ex) { console.warn("[inf-rep] fact_cache:", ex?.message); }
    }

    // Guardar en servidor
    try { await llamarAPI({ accion: "guardarPresupuestoEmitido", payload: { cliente: gym, factura: nroFact, cuit, periodo: fechaStr, total: 0, correo: '', remito } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
    try { await llamarAPI({ accion: "sincronizarFacturacionForm4", payload: { gym, fecha: fechaStr, estado: nroFact, remito } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
}

// ════════════════════════════════════════════════════════════════
//  MODAL CAMBIO DE ESTADO (sin dropdown, sin absolute)
// ════════════════════════════════════════════════════════════════
function _abrirMenuEstado(repIdx) {
    document.getElementById('_rep-overlay-estado')?.remove();
    const visita = _repVisitas[parseInt(repIdx)];
    if (!visita) return;
    const estadoActual = _clasEstado(visita.facturado);
    const conf         = _confEstado(estadoActual);

    const overlay = document.createElement('div');
    overlay.id = '_rep-overlay-estado';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;';

    const estados = ['pendiente', 'presupuestado', 'enviado', 'facturado', 'pagado', 'no'];
    const items = estados.map(function(e) {
        const c = _confEstado(e);
        const isAct = e === estadoActual;
        return '<button data-estado="' + e + '" data-idx="' + repIdx + '"'
            + ' style="display:block;width:100%;text-align:left;padding:13px 18px;'
            + 'background:' + (isAct ? c.bg : 'transparent') + ';color:' + c.color + ';border:none;cursor:pointer;'
            + 'font-size:13px;font-weight:' + (isAct ? 900 : 600) + ';border-bottom:1px solid rgba(255,255,255,0.05);">'
            + c.label + (isAct ? ' ✓' : '') + '</button>';
    }).join('');

    overlay.innerHTML = '<div style="background:#1e293b;border-radius:16px;overflow:hidden;width:100%;max-width:300px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 20px 60px rgba(0,0,0,0.6);">'
        + '<div style="padding:12px 16px;background:' + conf.bg + ';border-bottom:1px solid rgba(255,255,255,0.08);">'
        + '<div style="font-size:12px;font-weight:900;color:' + conf.color + ';">CAMBIAR ESTADO</div>'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + visita.gym + '</div>'
        + '</div>'
        + items
        + '<button data-cancel="1" style="width:100%;padding:11px;background:rgba(255,255,255,0.04);color:#64748b;border:none;cursor:pointer;font-size:12px;font-weight:700;">Cancelar</button>'
        + '</div>';

    // Event delegation — sin closures problemáticas
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.dataset.cancel) { overlay.remove(); return; }
        const estado = e.target.closest('[data-estado]')?.dataset.estado;
        const idx    = e.target.closest('[data-idx]')?.dataset.idx;
        if (estado !== undefined && idx !== undefined) {
            overlay.remove();
            _cambiarEstadoRep(parseInt(idx), estado);
        }
    });
    document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════════════════
//  ESTADOS
// ════════════════════════════════════════════════════════════════
// FIX: clasEstado ahora recibe la visita completa (o un string por retrocompat.)
// Prioriza el campo pago (col H) sobre facturado (col G).
function _clasEstado(rawOrVisita) {
    let pago      = '';
    let facturado = '';
    if (rawOrVisita && typeof rawOrVisita === 'object') {
        pago      = String(rawOrVisita.pago      || '').toLowerCase().trim();
        facturado = String(rawOrVisita.facturado || '').toLowerCase().trim();
    } else {
        facturado = String(rawOrVisita || '').toLowerCase().trim();
    }
    if (pago === 'pagado' || pago === 'pago')                        return 'pagado';
    if (facturado === 'pagado' || facturado.startsWith('pagado'))    return 'pagado';
    if (facturado === 'facturado' || facturado === 'si'
        || facturado.startsWith('factura '))                         return 'facturado';
    if (facturado === 'presupuestado')                               return 'presupuestado';
    if (facturado === 'enviado')                                     return 'enviado';
    if (facturado === 'no')                                          return 'no';
    return 'pendiente';
}
function _confEstado(e) {
    return ({
        pagado:       { label: '💰 Pagado',        bg: '#1a3300', color: '#86efac', border: '#22c55e' },
        facturado:    { label: '✅ Facturado',     bg: '#064e3b', color: '#6ee7b7', border: '#059669' },
        presupuestado:{ label: '📋 Presupuestado', bg: _COL.blueBg, color: _COL.blue, border: '#3b82f6' },
        enviado:      { label: '📤 Enviado',       bg: _COL.greenBg, color: _COL.green, border: '#16a34a' },
        pendiente:    { label: '⏳ Pendiente',     bg: '#292524', color: '#d6d3d1', border: 'rgba(255,255,255,0.1)' },
        no:           { label: '🚫 Sin acción',    bg: '#1c1917', color: '#78716c', border: 'rgba(255,255,255,0.06)' },
    })[e] || { label: '—', bg: _COL.card, color: _COL.muted, border: _COL.border };
}

const _TABS_REP = [
    { id: 'pendiente',     label: '⏳ Pendientes',     colorActivo: '#d93025', bgActivo: 'rgba(217,48,37,0.18)' },
    { id: 'presupuestado', label: '📋 Presupuestados', colorActivo: _COL.blue, bgActivo: _COL.blueBg },
    { id: 'enviado',       label: '📤 Enviados',       colorActivo: _COL.green, bgActivo: _COL.greenBg },
    { id: 'facturado',     label: '✅ Facturados',     colorActivo: '#6ee7b7', bgActivo: '#064e3b' },
    // Pagados se muestra dentro de Facturados con badge "💰 Cobrado" — sin tab propio
];

function _setTabRep(tab) {
    _repTabActivo = tab;
    _TABS_REP.forEach(function(t) {
        const btn = document.getElementById('_rtab-' + t.id);
        if (!btn) return;
        const isAct = t.id === tab;
        btn.style.background   = isAct ? t.bgActivo : 'rgba(255,255,255,0.04)';
        btn.style.color        = isAct ? t.colorActivo : _COL.muted;
        btn.style.borderBottom = isAct ? '2px solid ' + t.colorActivo : '2px solid transparent';
        btn.style.fontWeight   = isAct ? '900' : '600';
    });
    _renderTarjetas();
}

// ════════════════════════════════════════════════════════════════
//  TARJETA — SIN <script> tags, sin position:absolute en menú
// ════════════════════════════════════════════════════════════════
// ── _buildCard: genera el HTML de una tarjeta de reparación ─────────────
// Usa template literals para evitar concatenaciones ilegibles.
// Cada sección se extrae a una función helper que devuelve string.
function _buildCard(visita, repIdx) {
    const uid    = ++_repUID;
    const estado = _clasEstado(visita);   // FIX: pasa la visita completa para leer pago + facturado
    const conf   = _confEstado(estado);
    const sugs   = _sugerirItems(visita.motivo);
    const cants  = _extraerCant(visita.motivo);

    // ── Motivo: cada parte del '+' en su propia línea ──────────────────────
    const partes  = (visita.motivo || '').split(/\s*\+\s*/).map(p => p.trim()).filter(Boolean);
    const motivoH = partes.map((p, i) => `
        <div style="padding:1px 0;font-size:12.5px;color:${i === 0 ? _COL.text : '#cbd5e1'};line-height:1.4;">
            ${i > 0 ? `<span style="color:${_COL.muted};margin-right:4px;">+</span>` : ''}${p}
        </div>`).join('');

    // ── Tags de cantidades detectadas automáticamente ──────────────────────
    const _tag = (bg, color, txt) =>
        `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-right:4px;">${txt}</span>`;
    const cantH = [
        cants.metros     && _tag(_COL.blueBg,   _COL.blue,   `📏 ${cants.metros}m cable`),
        cants.terminales && _tag(_COL.blueBg,   _COL.blue,   `🔩 ${cants.terminales} term.`),
        cants.rodillos   && _tag(_COL.greenBg,  _COL.green,  `🔩 ${cants.rodillos} rod.`),
        cants.tapTipo    && _tag(_COL.orangeBg, _COL.orange, `🪡 Tap. ${cants.tapTipo}`),
    ].filter(Boolean).join('');

    // ── Sugerencias de ítems basadas en el motivo de la visita ────────────
    // Función _buildSugerencia para un solo ítem (extrae lógica del .map)
    function _buildSugerencia(s) {
        const esCable = s.nombre.toLowerCase().includes('cable');
        const idC = `_rc_${uid}_${s.nombre.replace(/\W/g, '').slice(0, 10)}`;
        const idM = `_rm_${uid}_${s.nombre.replace(/\W/g, '').slice(0, 10)}`;
        const idT = `_rt_${uid}_${s.nombre.replace(/\W/g, '').slice(0, 10)}`;
        const cantSug = esCable && cants.cables ? cants.cables
            : s.nombre.toLowerCase().includes('rodillo') && cants.rodillos ? cants.rodillos : 1;
        const lbl = s.info.moneda === 'USD'
            ? `U$D ${s.info.precio} → ${_fmtARS(s.precioARS)}`
            : _fmtARS(s.precioARS);
        // Onclick sin concatenación — usa data-* y un listener centralizado
        const onclickFn = `_agregarSugerencia('${idC}','${esCable ? idM : ''}','${esCable ? idT : ''}','${s.nombre.replace(/'/g,"\\'")}',${s.precioARS},'${visita.gym.replace(/'/g,"\\'")}',${s.info.precio || 0})`;
        const inputCable = esCable ? `
            <span style="font-size:10px;color:${_COL.accent};">📏m:</span>
            <input type="number" min="0.5" step="0.5" value="${cants.metros || 1}" id="${idM}"
                style="width:50px;padding:3px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.07);color:${_COL.accent};font-size:12px;text-align:center;">
            <span style="font-size:10px;color:${_COL.accent};">🔩t:</span>
            <input type="number" min="0" value="${cants.terminales || 2}" id="${idT}"
                style="width:44px;padding:3px;border-radius:6px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.07);color:${_COL.accent};font-size:12px;text-align:center;">` : '';
        return `
            <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="font-size:11.5px;font-weight:700;color:${_COL.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px;">${s.nombre}</div>
                <div style="font-size:10px;color:${_COL.muted};margin-bottom:5px;">${lbl} · c/IVA: ${_fmtARS(Math.round(s.precioARS * 1.21))}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                    <span style="font-size:10px;color:${_COL.muted};">Cant:</span>
                    <input type="number" min="1" value="${cantSug}" id="${idC}"
                        style="width:44px;padding:3px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);color:${_COL.text};font-size:12px;text-align:center;">
                    ${inputCable}
                    <button onclick="${onclickFn}"
                        style="background:#1a73e8;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;">
                        + Agregar
                    </button>
                </div>
            </div>`;
    }

    const sugsH = sugs.length === 0
        ? `<p style="font-size:11px;color:${_COL.muted};padding:6px 0;margin:0;">No se detectaron ítems. Usá la Lista de Precios ↑</p>`
        : sugs.map(_buildSugerencia).join('');

    // ── Badge de estado ────────────────────────────────────────────────────
    const esFacturado = estado === 'facturado';
    const esPagado    = estado === 'pagado';
    const _estadosSimples = ['facturado','pagado','pendiente','presupuestado','enviado','no','si',''];
    const factNum = (esFacturado || esPagado) && visita.facturado
        && !_estadosSimples.includes(visita.facturado.toLowerCase().trim())
        ? visita.facturado : '';
    const colorFact = esPagado ? '#86efac' : '#6ee7b7';

    const estadoBadge = `
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <button onclick="_abrirMenuEstado(${repIdx})"
                style="background:${conf.bg};color:${conf.color};border:1px solid ${conf.border};
                       border-radius:8px;padding:4px 10px;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap;">
                ${conf.label} ▾
            </button>
            ${esFacturado ? `
            <button onclick="_marcarPagado(${repIdx})"
                style="background:#1a3300;color:#86efac;border:1px solid #22c55e;
                       border-radius:6px;padding:4px 10px;font-size:10px;font-weight:900;cursor:pointer;white-space:nowrap;">
                💰 Marcar Pagado
            </button>
            <button onclick="_editarFactura(${repIdx})"
                style="background:rgba(110,231,183,0.08);color:#6ee7b7;border:1px solid rgba(110,231,183,0.2);
                       border-radius:6px;padding:3px 8px;font-size:9px;font-weight:800;cursor:pointer;">
                ✏️ ${factNum ? 'Editar' : 'Agregar'} factura
            </button>` : ''}
            ${esPagado ? `
            <span style="background:#1a3300;color:#86efac;border:1px solid #22c55e;
                         border-radius:6px;padding:4px 10px;font-size:10px;font-weight:900;white-space:nowrap;">
                💰 Cobrado
            </span>
            <button onclick="_editarFactura(${repIdx})"
                style="background:rgba(134,239,172,0.08);color:#86efac;border:1px solid rgba(134,239,172,0.2);
                       border-radius:6px;padding:3px 8px;font-size:9px;font-weight:800;cursor:pointer;">
                ✏️ Editar factura
            </button>` : ''}
            ${factNum ? `<div style="font-size:9px;color:${colorFact};font-weight:700;text-align:right;
                max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${factNum}">
                💰 ${factNum}
            </div>` : ''}
            ${visita.totalARCA > 0 ? `<div style="font-size:10px;color:#34d399;font-weight:900;text-align:right;">
                💵 $${Math.round(visita.totalARCA).toLocaleString('es-AR')}
            </div>` : ''}
        </div>`;

    // ── Card completa ──────────────────────────────────────────────────────
    return `
        <div style="background:${_COL.card};border:1px solid ${conf.border};border-radius:14px;overflow:visible;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);border-radius:14px 14px 0 0;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:900;color:${_COL.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${visita.necesitaRep ? '🔧 ' : ''}${visita.gym}
                    </div>
                    <div style="font-size:10.5px;color:${_COL.muted};margin-top:2px;">
                        📅 ${visita.fechaStr}${visita.tecnico ? ` · 👤 ${visita.tecnico}` : ''}${visita.remito ? ` · ${visita.remito}` : ''}
                    </div>
                </div>
                ${estadoBadge}
            </div>
            <div style="padding:10px 14px 5px;">${motivoH}</div>
            ${cantH ? `<div style="padding:3px 14px 8px;display:flex;flex-wrap:wrap;gap:4px;">${cantH}</div>` : ''}
            ${(function(foto) {
                if (!foto) return '';
                // Extraer ID de Drive si el valor es un link
                const idMatch = foto.match(/(?:\/d\/|id=)([-\w]{25,})/);
                const previewSrc = idMatch ? 'https://drive.google.com/file/d/' + idMatch[1] + '/preview' : null;
                const driveLink  = idMatch ? 'https://drive.google.com/file/d/' + idMatch[1] + '/view' : null;
                // Si no hay ID de Drive, mostrar solo el link si empieza con http
                if (!previewSrc) {
                    if (!foto.startsWith('http')) return '';
                    return `<details style="padding:0 14px 8px;">
                <summary style="cursor:pointer;font-size:11px;font-weight:800;color:#60a5fa;padding:5px 0;user-select:none;list-style:none;">
                    ▶ 📷 Foto del remito
                </summary>
                <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex;gap:8px;">
                        <a href="${foto}" target="_blank" rel="noopener"
                           style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;
                                  border-radius:10px;border:1px solid rgba(96,165,250,0.3);
                                  background:rgba(96,165,250,0.07);color:#60a5fa;font-size:12px;font-weight:800;text-decoration:none;"
                           onmouseover="this.style.background='rgba(96,165,250,0.15)'"
                           onmouseout="this.style.background='rgba(96,165,250,0.07)'">
                            🖼️ Ver foto en Drive
                        </a>
                        ${visita.linkCarpeta ? `<a href="${visita.linkCarpeta}" target="_blank" rel="noopener"
                           style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;
                                  border-radius:10px;border:1px solid rgba(167,139,250,0.3);
                                  background:rgba(167,139,250,0.07);color:#a78bfa;font-size:12px;font-weight:800;text-decoration:none;"
                           onmouseover="this.style.background='rgba(167,139,250,0.15)'"
                           onmouseout="this.style.background='rgba(167,139,250,0.07)'">
                            📁 Ver todas las fotos
                        </a>` : ''}
                    </div>
                </div>
            </details>`;
                }
                return `<details style="padding:0 14px 8px;">
                <summary style="cursor:pointer;font-size:11px;font-weight:800;color:#60a5fa;padding:5px 0;user-select:none;list-style:none;">
                    ▶ 📷 Vista previa del remito — clic para ver
                </summary>
                <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);">
                    <div style="position:relative;width:100%;height:260px;border-radius:10px;overflow:hidden;background:#0d1117;border:1px solid rgba(96,165,250,0.15);">
                        <iframe src="${previewSrc}"
                            style="width:100%;height:100%;border:none;"
                            allow="autoplay" loading="lazy">
                        </iframe>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <a href="${driveLink}" target="_blank" rel="noopener"
                           style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
                                  padding:9px 14px;border-radius:10px;border:1px solid rgba(96,165,250,0.3);
                                  background:rgba(96,165,250,0.07);color:#60a5fa;font-size:12px;font-weight:800;
                                  text-decoration:none;"
                           onmouseover="this.style.background='rgba(96,165,250,0.15)'"
                           onmouseout="this.style.background='rgba(96,165,250,0.07)'">
                            🖼️ Ver foto completa
                        </a>
                        ${visita.linkCarpeta ? `<a href="${visita.linkCarpeta}" target="_blank" rel="noopener"
                           style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
                                  padding:9px 14px;border-radius:10px;border:1px solid rgba(167,139,250,0.3);
                                  background:rgba(167,139,250,0.07);color:#a78bfa;font-size:12px;font-weight:800;
                                  text-decoration:none;"
                           onmouseover="this.style.background='rgba(167,139,250,0.15)'"
                           onmouseout="this.style.background='rgba(167,139,250,0.07)'">
                            📁 Ver todas las fotos
                        </a>` : ''}
                    </div>
                </div>
            </details>`;
            })(visita.foto)}
            <details style="padding:0 14px 10px;">
                <summary style="cursor:pointer;font-size:11px;font-weight:800;color:${_COL.accent};padding:6px 0;user-select:none;list-style:none;">
                    ▶ 💡 Sugerencias (${sugs.length} ítems) — clic para ver
                </summary>
                <div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.04);">
                    ${sugsH}
                </div>
            </details>
        </div>`;
}

// ── _agregarSugerencia: helper centralizado llamado desde los botones ──────
// Evita el onclick con código JS inline que era ilegible y propenso a errores.
function _agregarSugerencia(idC, idM, idT, nombre, precioARS, gym, precioBaseUSD) {
    const cant = parseInt(document.getElementById(idC)?.value) || 1;
    const metros = idM ? (parseFloat(document.getElementById(idM)?.value) || null) : null;
    const terms  = idT ? (parseInt(document.getElementById(idT)?.value) || null) : null;
    _repGymActivo = gym;
    _calcAgregar(nombre, precioARS, cant, metros, terms, precioBaseUSD || 0);
}

// ── Abrir modal de factura para EDITAR un ya-facturado ──────────
function _editarFactura(idx) {
    const visita = _repVisitas[parseInt(idx)];
    if (!visita) return;
    // Extraer tipo y número actuales del campo facturado
    const rawFact = visita.facturado || '';
    const tipoM   = rawFact.match(/factura\s+([AB])/i);
    const numM    = rawFact.match(/N°(.+)/i);
    _abrirModalFactura(visita, tipoM ? tipoM[1].toUpperCase() : 'B', numM ? numM[1].trim() : '');
}

async function _cambiarEstadoRep(idx, nuevoEstado) {
    const visita = _repVisitas[parseInt(idx)];
    if (!visita) return;
    if (nuevoEstado === 'facturado') { _abrirModalFactura(visita); return; }
    // Pagado: conservar el número de factura en el campo, agregar prefijo
    if (nuevoEstado === 'pagado') {
        // FIX: "Pagado" actualiza un campo separado — NO sobreescribe visita.facturado
        // (que es col G). El pago va a col H. Localmente reflejamos esto igual.
        visita.pago = 'Pagado';
        _setTabRep('pagado');
        try { await llamarAPI({ accion: "sincronizarFacturacionForm4", payload: { gym: visita.gym, fecha: visita.fechaStr, estado: 'Pagado', remito: visita.remito || '' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
        try { await llamarAPI({ accion: "actualizarPagoReparacion", payload: { gym: visita.gym, remito: visita.remito, pago: 'Pagado' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
        return;
    }
    visita.facturado = nuevoEstado;
    try { await llamarAPI({ accion: "sincronizarFacturacionForm4", payload: { gym: visita.gym, fecha: visita.fechaStr, estado: nuevoEstado, remito: visita.remito || '' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
    if (nuevoEstado === 'presupuestado' || nuevoEstado === 'enviado') {
        try { await llamarAPI({ accion: "guardarPresupuestoEmitido", payload: { cliente: visita.gym, factura: '', periodo: visita.fechaStr, total: 0, correo: '', remito: visita.remito || '' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] Error:", e?.message || e); }
    }
    _setTabRep(nuevoEstado);
}

// ════════════════════════════════════════════════════════════════
//  RENDERIZADO
// ════════════════════════════════════════════════════════════════
function _filtrarRep(texto) { _repBusqueda = texto.toLowerCase(); _renderTarjetas(); }
function _setMesFiltroRep(mes) {
    _repMesFiltro = mes;
    document.querySelectorAll('._rep-mes-btn').forEach(function(b) {
        const act = b.dataset.mes === mes;
        b.style.background = act ? '#1a73e8' : 'rgba(255,255,255,0.06)';
        b.style.color      = act ? 'white'   : _COL.muted;
    });
    _renderTarjetas();
    _actualizarKPIRep(); // FIX: actualizar KPI con el mes seleccionado
}

// ── Marcar como Pagado directo desde la tarjeta Facturado ────────
async function _marcarPagado(idx) {
    const visita = _repVisitas[parseInt(idx)];
    if (!visita) return;
    visita.pago = 'Pagado';
    _renderTarjetas();
    try { await llamarAPI({ accion: "sincronizarFacturacionForm4", payload: { gym: visita.gym, fecha: visita.fechaStr, estado: 'Pagado', remito: visita.remito || '' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] _marcarPagado:", e?.message); }
    try { await llamarAPI({ accion: "actualizarPagoReparacion", payload: { gym: visita.gym, remito: visita.remito, pago: 'Pagado' } }, SF_TIMEOUT?.NORMAL || 15000); } catch(e) { console.warn("[inf-rep] _marcarPagado:", e?.message); }
}

// ── Vincular ARCA — trae total real de factura y actualiza descripción ──
async function _vincularConARCA() {
    const btn = document.querySelector('[onclick*="_vincularConARCA"]');
    if (btn) { btn.textContent = '⏳ Vinculando...'; btn.disabled = true; }
    try {
        const docs = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: "Presupuestos_Emitidos" } }, SF_TIMEOUT?.NORMAL || 15000);
        if (!Array.isArray(docs)) throw new Error("Sin datos");
        function _nf(f) { return String(f || '').toLowerCase().replace(/factura\s+/gi,'').replace(/n[°o]\s*/gi,'').replace(/[\s\-.]/g,''); }
        const arcaByFact = {}, arcaByRemito = {};
        docs.forEach(function(d) {
            const fn = _nf(d.factura || d.numFactura || '');
            if (fn) arcaByFact[fn] = d;
            const rn = String(d.remito || d.Remito || '').trim();
            if (rn) arcaByRemito[rn] = d;
        });
        let vinculados = 0;
        const promises = [];
        _repVisitas.forEach(function(v) {
            const e = _clasEstado(v);
            if (e !== 'facturado' && e !== 'pagado') return;
            const match = (v.remito && arcaByRemito[v.remito]) || arcaByFact[_nf(v.facturado)] || null;
            if (!match) return;
            v.totalARCA = Number(match.importe || match.total || 0);
            if (!v.facturado || _estadosSimples.includes(v.facturado.toLowerCase().trim())) {
                const nroArc = match.factura || match.Factura || '';
                if (nroArc) v.facturado = nroArc;
            }
            vinculados++;
            if (v.motivo && v.motivo.trim().length > 5) {
                promises.push(llamarAPI({ accion: 'actualizarDescripcionEmitido', payload: { remito: v.remito || '', factura: v.facturado || '', descripcion: v.motivo, total: v.totalARCA } }, SF_TIMEOUT?.NORMAL || 15000).catch(function(){}));
            }
        });
        await Promise.allSettled(promises);
        _renderTarjetas();
        const kpiEl = document.getElementById('_rep-kpi-bar');
        if (kpiEl) {
            const msg = document.createElement('div');
            msg.style.cssText = 'font-size:11px;color:#86efac;font-weight:800;padding:6px 14px;text-align:center;';
            msg.textContent = '\u2705 Vinculados ' + vinculados + ' registro(s) con ARCA';
            kpiEl.parentNode.insertBefore(msg, kpiEl.nextSibling);
            setTimeout(function() { msg.remove(); }, 4000);
        }
    } catch(e) { console.warn("[inf-rep] _vincularConARCA:", e?.message); }
    finally { if (btn) { btn.textContent = '\uD83D\uDD17 Vincular ARCA'; btn.disabled = false; } }
}

const _estadosSimples = ['facturado','pagado','pendiente','presupuestado','enviado','no','si',''];

function _renderTarjetas() {
    const cont = document.getElementById('_rep-contenedor');
    if (!cont) return;
    _repUID = 0; // Reset counter for each render

    let visitas = _repVisitas;
    if (_repBusqueda) visitas = visitas.filter(function(v) {
        return (v.gym || '').toLowerCase().includes(_repBusqueda)
            || (v.motivo || '').toLowerCase().includes(_repBusqueda)
            || (v.remito || '').toLowerCase().includes(_repBusqueda);
    });
    if (_repMesFiltro) visitas = visitas.filter(function(v) {
        const p = (v.fechaStr || '').split('/');
        return p.length === 3 && (p[2] + '-' + p[1]) === _repMesFiltro;
    });

    // Facturados muestra también los Pagados (identificados con badge "💰 Cobrado")
    const visiblesTab = visitas.filter(function(v) {
        const e = _clasEstado(v);
        if (_repTabActivo === 'facturado') return e === 'facturado' || e === 'pagado';
        return e === _repTabActivo;
    });

    // Actualizar contadores de tabs
    const grupos = { pendiente: 0, presupuestado: 0, enviado: 0, facturado: 0 };
    visitas.forEach(function(v) {
        const e = _clasEstado(v);
        if (e === 'pagado') grupos.facturado++;          // pagados suman al contador de Facturados
        else if (grupos[e] !== undefined) grupos[e]++;
    });
    _TABS_REP.forEach(function(t) {
        const el = document.getElementById('_rtab-lbl-' + t.id);
        const baseLabel = t.label.split(' ').slice(1).join(' ');
        if (el) el.textContent = baseLabel + (grupos[t.id] ? ' (' + grupos[t.id] + ')' : '');
    });

    if (!visiblesTab.length) {
        cont.innerHTML = '<div style="text-align:center;padding:32px;color:' + _COL.muted + ';">'
            + '<div style="font-size:32px;margin-bottom:10px;">📂</div>'
            + '<div style="font-size:14px;font-weight:700;">No hay visitas en este estado.</div></div>';
        return;
    }

    const idxMap = new Map();
    _repVisitas.forEach(function(v, i) { idxMap.set(v, i); });

    const porMes = {};
    visiblesTab.forEach(function(v) {
        const p = (v.fechaStr || '').split('/');
        const key = p.length === 3 ? p[2] + '-' + p[1] : '0000-00';
        if (!porMes[key]) porMes[key] = [];
        porMes[key].push(v);
    });

    let html = '';
    Object.keys(porMes).sort().reverse().forEach(function(key) {
        const [año, mm] = key.split('-');
        const mesNom = (_MESES_R[parseInt(mm) - 1] || 'Sin fecha') + ' ' + año;
        html += '<div style="font-size:10px;font-weight:900;color:' + _COL.muted + ';text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">📅 ' + mesNom + '</div>';
        porMes[key].forEach(function(v) { html += _buildCard(v, idxMap.get(v)); });
    });
    cont.innerHTML = html;
}

async function renderizarVistaReparaciones() {
    const cont = document.getElementById('_rep-contenedor');
    if (!cont) return;
    cont.innerHTML = '<div style="text-align:center;padding:24px;color:' + _COL.muted + ';">⏳ Cargando...</div>';
    let visitas = [];
    try {
        visitas = await llamarAPI({ accion: "obtenerReparacionesPendientes", payload: { dias: 90 } }, SF_TIMEOUT?.REPARACIONES || 20000);
    } catch(e) {
        // FIX: fallback mejorado — usar historialGlobal si está disponible (compartido entre módulos)
        const hist = window.historialGlobal || [];
        if (hist.length > 0) {
            const corte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            visitas = hist.filter(function(v) {
                const motivo = (v.motivo || '').toLowerCase();
                const tieneRep = motivo.includes('reparaci') || (v.motivo || '').includes('+');
                if (!tieneRep) return false;
                if (v.fechaStr) {
                    const p = v.fechaStr.split('/');
                    if (p.length === 3) {
                        const f = new Date(p[2], p[1]-1, p[0]);
                        return f >= corte;
                    }
                }
                return (v.año && v.mes !== undefined && (new Date(v.año, v.mes, v.dia || 1)) >= corte);
            }).map(function(v) {
                return { fechaStr: v.fechaStr || '', gym: (v.gym || '').toUpperCase(),
                         tecnico: v.tecnico || '', motivo: v.motivo || '',
                         remito: v.remito || '', necesitaRep: false, facturado: v.facturado || '' };
            }).slice(0, 90);
        } else {
            cont.innerHTML = '<div style="text-align:center;padding:32px;color:' + _COL.muted + ';">'
                + '<div style="font-size:28px;margin-bottom:10px;">🔌</div>'
                + '<div style="font-size:13px;font-weight:700;">Sin conexión al servidor.</div>'
                + '<div style="font-size:11px;margin-top:6px;">Verificá tu internet y tocá Actualizar.</div></div>';
            return;
        }
    }
    visitas.sort(function(a, b) {
        const pa = (a.fechaStr || '').split('/').reverse().join('');
        const pb = (b.fechaStr || '').split('/').reverse().join('');
        return pb.localeCompare(pa);
    });
    _repVisitas = visitas;

    // Enriquecer con números de factura guardados localmente (sobreviven recargas)
    // El backend devuelve "facturado" en col G; el número real se guarda en localStorage al confirmar
    try {
        const fc = JSON.parse(localStorage.getItem('_rep_fact_cache') || '{}');
        _repVisitas.forEach(function(v) {
            if (v.remito && fc[v.remito] && (!v.facturado || v.facturado.toLowerCase() === 'facturado')) {
                v.facturado = fc[v.remito];
            }
        });
    } catch(ex) { console.warn("[inf-rep] fact_cache read:", ex?.message); }
    if (!visitas.length) {
        cont.innerHTML = '<div style="text-align:center;padding:32px;color:' + _COL.muted + ';">✅ No hay reparaciones en los últimos 90 días.</div>';
        return;
    }
    const mesesSet = new Set();
    visitas.forEach(function(v) { const p = (v.fechaStr || '').split('/'); if (p.length === 3) mesesSet.add(p[2] + '-' + p[1]); });
    const mesesArr = Array.from(mesesSet).sort().reverse();
    let mesesH = '<button class="_rep-mes-btn" data-mes="" onclick="_setMesFiltroRep(\'\')" style="padding:4px 10px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:800;background:#1a73e8;color:white;margin:2px;">Ver todos</button>';
    mesesArr.forEach(function(key) {
        const [año, mm] = key.split('-');
        const nom = (_MESES_R[parseInt(mm) - 1] || mm) + ' ' + año;
        mesesH += '<button class="_rep-mes-btn" data-mes="' + key + '" onclick="_setMesFiltroRep(\'' + key + '\')" style="padding:4px 10px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:700;background:rgba(255,255,255,0.06);color:' + _COL.muted + ';margin:2px;">' + nom + '</button>';
    });
    const fEl = document.getElementById('_rep-filtros-mes');
    if (fEl) fEl.innerHTML = mesesH;
    _repBusqueda = ''; _repMesFiltro = '';
    const sEl = document.getElementById('_rep-search');
    if (sEl) sEl.value = '';
    _setTabRep(_repTabActivo || 'pendiente');
    _actualizarKPIRep(); // KPI bar
    _renderCalc();
}

// ════════════════════════════════════════════════════════════════
//  LAYOUT
// ════════════════════════════════════════════════════════════════
function _inyectarVistaReparaciones() {
    // FIX PERMANENTE: crear el div si no existe en el DOM.
    // Antes dependíamos de un <div id="_rep-root"> estático en el HTML que se perdía
    // cada vez que se actualizaba Informes-index.html. Ahora el JS lo crea y lo inserta
    // en el lugar correcto (dentro de area-trabajo, después de seccion-creados).
    let root = document.getElementById('_rep-root');
    if (!root) {
        root = document.createElement('div');
        root.id = '_rep-root';
        root.style.display = 'none';
        // Insertar dentro de area-trabajo, después del último elemento visible
        const areaTrabajo = document.getElementById('area-trabajo');
        if (areaTrabajo) {
            areaTrabajo.appendChild(root);
        } else {
            // Fallback: insertar antes del status-informe
            const status = document.getElementById('status-informe');
            if (status) status.parentNode.insertBefore(root, status);
            else document.body.appendChild(root);
        }
    }
    if (root.dataset.injected) return; // ya fue poblado antes
    root.dataset.injected = '1';

    const tabsHTML = _TABS_REP.map(function(t) {
        return '<button id="_rtab-' + t.id + '" onclick="_setTabRep(\'' + t.id + '\')"'
            + ' style="flex:1;padding:10px 8px;border:none;border-bottom:2px solid transparent;'
            + 'background:rgba(255,255,255,0.04);color:' + _COL.muted + ';font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;min-width:0;">'
            + '<span id="_rtab-lbl-' + t.id + '">' + t.label.split(' ').slice(1).join(' ') + '</span>'
            + '</button>';
    }).join('');

    root.innerHTML = ''
        // KPI bar — se popula al cargar datos
        + '<div id="_rep-kpi-bar"></div>'
        // Calculadora
        + '<div id="_rep-calc" style="background:' + _COL.surface + ';border:1px solid ' + _COL.border + ';border-radius:14px;padding:14px;margin-bottom:12px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        + '<div><div style="font-size:14px;font-weight:900;color:' + _COL.text + ';">🧮 Calculadora Rápida</div>'
        + '<div id="_rep-calc-gym" style="font-size:11px;color:' + _COL.accent + ';margin-top:1px;font-weight:700;"></div>'
        + '<div id="_rep-calc-dolar" style="font-size:10px;font-weight:800;margin-top:2px;"></div></div>'
        + '<div style="display:flex;gap:8px;">'
        + '<button id="_rep-btn-lista" onclick="_toggleListaRep()" style="background:' + _COL.blueBg + ';color:' + _COL.blue + ';border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:800;cursor:pointer;">📋 Lista de Precios</button>'
        + '<button onclick="_calcLimpiar()" style="background:' + _COL.redBg + ';color:' + _COL.red + ';border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:800;cursor:pointer;">🗑️ Limpiar</button>'
        + '</div></div>'
        + '<div id="_rep-burbuja-precios" style="display:none;background:' + _COL.card + ';border:1px solid ' + _COL.border + ';border-radius:10px;padding:10px;margin-bottom:10px;max-height:300px;overflow-y:auto;">'
        + '<div id="_rep-lista-cont"></div></div>'
        + '<div id="_rep-calc-cuerpo"></div>'
        + '<div id="_rep-calc-total"></div>'
        + '</div>'
        // Buscador + filtros mes
        + '<div style="background:' + _COL.card + ';border:1px solid ' + _COL.border + ';border-radius:12px;padding:10px 14px;margin-bottom:10px;">'
        + '<input id="_rep-search" type="text" placeholder="🔍 Buscar por gimnasio, motivo o remito..." oninput="_filtrarRep(this.value)"'
        + ' style="width:100%;padding:9px 12px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:' + _COL.text + ';font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;" autocomplete="off">'
        + '<div id="_rep-filtros-mes" style="display:flex;flex-wrap:wrap;gap:4px;"></div>'
        + '</div>'
        // Tabs horizontales
        + '<div style="display:flex;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);margin-bottom:14px;">' + tabsHTML + '</div>'
        // Encabezado
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        + '<div style="font-size:11px;font-weight:900;color:' + _COL.muted + ';text-transform:uppercase;letter-spacing:0.5px;">🔧 VISITAS CON TRABAJO (90 días)</div>'
        + '<div style="display:flex;gap:6px;">'
        + '<button onclick="_vincularConARCA()" style="background:linear-gradient(135deg,#7c3aed,#4c1d95);border:none;color:white;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;">🔗 Vincular ARCA</button>'
        + '<button onclick="renderizarVistaReparaciones()" style="background:none;border:1px solid rgba(255,255,255,0.1);color:' + _COL.muted + ';border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;">🔄 Actualizar</button>'
        + '</div>'
        + '</div>'
        + '<div id="_rep-contenedor"></div>';

    // CSS mínimo
    if (!document.getElementById('_rep-css')) {
        const s = document.createElement('style');
        s.id = '_rep-css';
        s.textContent = 'details summary::-webkit-details-marker{display:none}';
        document.head.appendChild(s);
    }
}

function mostrarVistaReparaciones() {
    _inyectarVistaReparaciones();
    ['seccion-crear', 'seccion-creados', 'arca-container'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const root = document.getElementById('_rep-root');
    if (root) root.style.display = 'block';
    renderizarVistaReparaciones();
    _renderCalc();
}

// ── KPI bar: reacciona al filtro de mes seleccionado ─────────────────────
function _actualizarKPIRep() {
    const kpiEl = document.getElementById('_rep-kpi-bar');
    if (!kpiEl || !_repVisitas.length) return;

    // Determinar qué mes mostrar: el filtro seleccionado o el mes actual
    let claveM, mesLabel;
    if (_repMesFiltro) {
        claveM = _repMesFiltro; // formato "YYYY-MM"
        const [yy, mm] = _repMesFiltro.split('-');
        const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        mesLabel = nombres[parseInt(mm) - 1] + ' ' + yy;
    } else {
        const hoy = new Date();
        const mm  = String(hoy.getMonth() + 1).padStart(2, '0');
        const yy  = String(hoy.getFullYear());
        claveM    = yy + '-' + mm;
        const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        mesLabel  = nombres[hoy.getMonth()] + ' ' + yy;
    }

    // Contadores generales (todos los meses)
    let countPend = 0, countPresup = 0, countEnv = 0;
    // Contadores del mes seleccionado
    let countFact = 0, countPag = 0;

    _repVisitas.forEach(function(v) {
        const e = _clasEstado(v);
        const p = (v.fechaStr || '').split('/');
        const esMes = p.length === 3 && (p[2] + '-' + p[1]) === claveM;
        if (e === 'pendiente')     countPend++;
        if (e === 'presupuestado') countPresup++;
        if (e === 'enviado')       countEnv++;
        if (esMes && (e === 'facturado')) countFact++;
        if (esMes && (e === 'pagado'))    countPag++;
    });

    kpiEl.innerHTML = ''
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;background:' + _COL.card + ';border:1px solid ' + _COL.border + ';border-radius:12px;margin-bottom:12px;">'
        + _kpiItem(countPend,   '#d6d3d1', 'Pendientes',        '90 días')
        + _kpiItem(countPresup, _COL.blue, 'Presupuestados',    '90 días')
        + _kpiItem(countEnv,    _COL.green,'Enviados',          '90 días')
        + _kpiItem(countFact,   '#6ee7b7', 'Facturados',        mesLabel)
        + _kpiItem(countPag,    '#86efac', 'Cobrados',          mesLabel)
        + '</div>';
}

function _kpiItem(n, color, label, sub) {
    return '<div style="flex:1;min-width:60px;text-align:center;padding:4px 2px;">'
        + '<div style="font-size:22px;font-weight:900;color:' + color + ';line-height:1.1;">' + n + '</div>'
        + '<div style="font-size:9px;color:' + _COL.muted + ';font-weight:800;text-transform:uppercase;margin-top:2px;">' + label + '</div>'
        + '<div style="font-size:8px;color:rgba(148,163,184,0.6);margin-top:1px;">' + sub + '</div>'
        + '</div>';
}

function ocultarVistaReparaciones() {
    const root = document.getElementById('_rep-root');
    if (root) root.style.display = 'none';
}