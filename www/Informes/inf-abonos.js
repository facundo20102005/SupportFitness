// ── inf-abonos.js — Abonos mensuales, facturación y correos ───

async function cargarAbonos() {
    try {
        listaAbonosBase = await llamarAPI({ accion: "obtenerAbonosBD" });
        renderizarAbonos();
    } catch(e) {
        mostrarMensaje('No se pudo cargar la lista de abonos. Revisá la conexión.', 'error');
    }
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
 
    const ok = await modalConfirmar({
        titulo:    'Eliminar precio',
        mensaje:   `¿Borrar el precio registrado desde ${desde}?\n\nEl precio anterior volverá a aplicarse.`,
        icono:     '🗑️',
        color:     '#d93025',
        btnOk:     'Eliminar',
        btnCancel: 'Cancelar'
    });
    if (!ok) return;
 
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
        await modalAviso({ titulo: 'Formato incorrecto', mensaje: 'El mes debe tener el formato MM/YYYY.\nEjemplo: 07/2025', icono: '⚠️', color: '#f59e0b' }); return;
        return;
    }
    if (!precio || isNaN(precio) || precio <= 0) {
        await modalAviso({ titulo: 'Precio inválido', mensaje: 'Ingresá un precio válido mayor a cero.', icono: '⚠️', color: '#f59e0b' }); return;
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
                    <div class="inf-flex-1">
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
                    <label class="inf-text-label" style="margin-bottom:4px; display:block;">📧 Correos del cliente</label>
                    <textarea id="txt-mail-${a.orden}"
                              style="width:100%; font-size:12px; padding:10px; border:2px solid #fbbc04; border-radius:10px; outline:none; font-family:monospace; resize:vertical; min-height:44px; box-sizing:border-box;"
                              rows="2">${correosFormateados}</textarea>
                    <div class="abono-actions" style="margin-top:10px;">
                        <button class="btn-copiar" onclick="copiarAlPortapapeles(document.getElementById('txt-mail-${a.orden}').value, 'Mails copiados')">📋 Copiar Mails</button>
                        <button class="btn-enviar" style="background:#7c3aed; flex:1.5;"
                                onclick="enviarCorreoAbonoAutomatico(${a.orden}, '${idMes}', '${a.gym.replace(/'/g,"\\'")}', '${periodoStr}', ${pBase}, '${fNro}')">
                            📧 Enviar Correo
                        </button>
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

// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
//  📧 ABRIR CORREO DE ABONO EN OUTLOOK WEB (prellenado)
//  Template exacto de Notas_SupportFitness.md — Facturación mensual
// ════════════════════════════════════════════════════════════════
async function enviarCorreoAbonoAutomatico(orden, idMes, gimnasio, periodo, precio, factura) {
    const txtArea   = document.getElementById('txt-mail-' + orden);
    const correos   = txtArea ? txtArea.value.trim() : '';
    const precioFmt = '$' + Math.round(precio).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const anio      = new Date().getFullYear();

    const ok = await modalConfirmar({
        titulo:    '📧 Preparar correo de facturación',
        mensaje:   'Se abrirá Outlook Web con el correo prellenado.\n\n' +
                   '🏋️ Cliente: ' + gimnasio + '\n' +
                   '📅 Periodo: ' + periodo + ' ' + anio + '\n' +
                   (factura ? '📄 Factura: ' + factura + '\n' : '') +
                   '💰 Importe: ' + precioFmt +
                   (correos ? '\n📧 Para: ' + correos : '\n⚠️ Sin correo — podés editarlo en Outlook'),
        icono:     '📬',
        color:     '#0f9d58',
        btnOk:     'Abrir Outlook',
        btnCancel: 'Cancelar'
    });
    if (!ok) return;

    // Template FACTURACIÓN MENSUAL — texto plano (Notas_SupportFitness.md)
    const asunto = 'Factura Gimnasio - ' + gimnasio;
    const cuerpo = [
        'Buenas tardes, Señores de administración.',
        '',
        'Adjunto factura por el mantenimiento preventivo del Gimnasio periodo ' + periodo + ' ' + anio + ' y número de cuenta para realizar transferencia a la brevedad.',
        (factura ? 'Factura N°: ' + factura : ''),
        '',
        'Por favor, confirmar recepción.',
        _FIRMA
    ].filter(l => l !== null).join('\n');

    window.open(_urlOutlook(correos, asunto, cuerpo), '_blank');
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
// ─── NUEVA FUNCIÓN INTERNA PARA ENVIAR CORREO DESDE EL PANEL DE INFORMES ───
async function enviarMailRapidoAbono(orden, idMes) {
    try {
        const abono = listaAbonosBase.find(a => a.orden === parseInt(orden, 10)) || {};
        const gimnasioNombre = abono.gimnasio || "Cliente";

        const ok = await modalConfirmar({
            titulo:    'Enviar correo de facturación',
            mensaje:   `¿Enviar el correo de facturación a:\n${gimnasioNombre}\nPeriodo: ${idMes}?`,
            icono:     '📧',
            color:     '#1a73e8',
            btnOk:     'Enviar',
            btnCancel: 'Cancelar'
        });
        if (!ok) return;

        mostrarMensaje('⏳ Enviando correo electrónico...', 'info');

        // Llamada directa a tu API de Google Apps Script
        llamarAPI({ 
            accion: "enviarCorreoAbono", 
            payload: { 
                orden: orden,
                mesAnio: idMes, 
                gimnasio: gimnasioNombre,
                correoCliente: "support_fitness@hotmail.com" // <-- CAMBIAR ACÁ por el correo real si lo tenés guardado en el abono
            } 
        })
        .then(respuesta => {
            if(respuesta.ok) {
                mostrarMensaje('✅ Correo enviado correctamente', 'success');
                // Opcionalmente pintás el casillero para indicar que ya fue enviado
                marcarComoEnviado(orden, idMes); 
            } else {
                mostrarMensaje('❌ Error al enviar: ' + respuesta.error, 'error');
            }
        })
        .catch(() => mostrarMensaje('❌ Error de conexión con el Servidor', 'error'));
    } catch(e) {
        mostrarMensaje('Error al preparar el correo. Intentá de nuevo.', 'error');
    }
}
// =========================================================================
// 🔥 AUMENTO MASIVO DE PRECIOS POR IPC 🔥
// =========================================================================

function abrirModalAumentoMasivo() {
    let modal = document.getElementById('modal-aumento-masivo');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-aumento-masivo';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:15px; box-sizing:border-box; backdrop-filter: blur(3px);';
        document.body.appendChild(modal);
    }

    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const opcionesMeses = meses.map(m => `<option value="${m}">${m}</option>`).join('');

    // Sugerir mes efectivo (el mes actual + 1 por defecto)
    const hoy = new Date();
    let sigMes = hoy.getMonth() + 2; 
    let anioEff = hoy.getFullYear();
    if (sigMes > 12) { sigMes -= 12; anioEff++; }
    const mesEfectivoSugerido = String(sigMes).padStart(2, '0') + '/' + anioEff;

    modal.innerHTML = `
        <div style="background:var(--inf-card); border: 1px solid var(--inf-border); padding:20px; border-radius:14px; width:100%; max-width:600px; max-height:90vh; display:flex; flex-direction:column; box-shadow:var(--inf-shadow-md);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--inf-border); padding-bottom:12px; margin-bottom:12px;">
                <h2 style="margin:0; color:var(--inf-amarillo); font-size:18px; font-weight:900;">📈 Aumento Masivo (IPC)</h2>
                <span onclick="cerrarModalAumentoMasivo()" style="cursor:pointer; color:var(--inf-rojo); font-size:24px; font-weight:bold; line-height:1;">✖</span>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:15px;">
                <div style="flex:1; min-width:140px;">
                    <label style="font-size:11px; font-weight:bold; color:var(--inf-sub);">Filtrar por Mes de Aviso:</label>
                    <select id="masivo-mes-aviso" onchange="renderizarListaAumentoMasivo()" style="width:100%; padding:8px; border-radius:8px; border:2px solid var(--inf-border); background:var(--inf-bg); color:var(--inf-text); font-weight:bold; outline:none; margin-top:4px;">
                        <option value="Todos">Mostrar Todos</option>
                        ${opcionesMeses}
                    </select>
                </div>
                <div style="flex:1; min-width:140px;">
                    <label style="font-size:11px; font-weight:bold; color:var(--inf-sub);">Aplica desde (MM/YYYY):</label>
                    <input type="text" id="masivo-mes-efectivo" value="${mesEfectivoSugerido}" maxlength="7" oninput="this.value=this.value.replace(/[^0-9\\/]/g,''); if(this.value.length===2&&!this.value.includes('/'))this.value+='/'" style="width:100%; padding:8px; border-radius:8px; border:2px solid var(--inf-azul); background:var(--inf-bg); color:var(--inf-text); font-weight:bold; text-align:center; outline:none; margin-top:4px;">
                </div>
            </div>

            <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); padding:12px; border-radius:10px; margin-bottom:15px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1; min-width:150px;">
                    <label style="font-size:11px; font-weight:bold; color:var(--inf-amarillo);">Porcentaje General:</label>
                    <div style="display:flex; align-items:center; gap:5px; margin-top:4px;">
                        <input type="number" id="masivo-porcentaje" placeholder="Ej: 15" style="width:70px; padding:8px; border-radius:8px; border:2px solid rgba(245,158,11,0.4); background:var(--inf-bg); color:var(--inf-text); font-weight:bold; text-align:center; outline:none;">
                        <span style="font-weight:bold; color:var(--inf-amarillo);">%</span>
                    </div>
                </div>
                <button onclick="aplicarPorcentajeMasivo()" style="background:var(--inf-amarillo); color:white; border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer; height:fit-content; transition:0.2s; white-space:nowrap;">
                    ⚡ Aplicar % a la lista
                </button>
            </div>

            <div style="flex:1; overflow-y:auto; border:1px solid var(--inf-border); border-radius:10px; background:var(--inf-bg); padding:0;" id="masivo-lista-gyms">
                </div>

            <button onclick="guardarAumentoMasivo()" style="width:100%; background:linear-gradient(135deg,var(--inf-verde),#0b7a42); color:white; border:none; padding:14px; border-radius:10px; font-weight:900; font-size:15px; cursor:pointer; margin-top:15px; box-shadow:0 4px 12px rgba(15,157,88,0.3);">
                💾 Guardar Cambios Seleccionados
            </button>
        </div>
    `;
    modal.style.display = 'flex';
    
    // Autoseleccionar el mes actual en el filtro al abrir
    document.getElementById('masivo-mes-aviso').value = meses[hoy.getMonth()];
    renderizarListaAumentoMasivo();
}

function cerrarModalAumentoMasivo() {
    const modal = document.getElementById('modal-aumento-masivo');
    if (modal) modal.style.display = 'none';
}

function renderizarListaAumentoMasivo() {
    const contenedor = document.getElementById('masivo-lista-gyms');
    const filtroMes = document.getElementById('masivo-mes-aviso').value;
    const hoy = new Date();
    
    // Filtramos la lista según el mes de aviso que tienen configurado
    let filtrados = listaAbonosBase;
    if (filtroMes !== "Todos") {
        filtrados = listaAbonosBase.filter(a => String(a.mesIncrem).trim().toLowerCase() === filtroMes.toLowerCase());
    }

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div style="padding:20px; text-align:center; color:var(--inf-muted); font-weight:bold;">No hay gimnasios configurados con aviso en ${filtroMes}.</div>`;
        return;
    }

    let html = `<div style="padding:10px; background:var(--inf-bg); font-size:11px; font-weight:bold; color:var(--inf-sub); display:flex; justify-content:space-between; border-bottom:1px solid var(--inf-border);">
                    <span>SELECCIONAR / GIMNASIO</span>
                    <span>NUEVO PRECIO (ARS)</span>
                </div>`;

    filtrados.sort((a,b) => a.orden - b.orden).forEach(a => {
        // Obtenemos el precio vigente actual de este gimnasio
        const precioActual = getPrecioParaMes(a, hoy.getMonth() + 1, hoy.getFullYear());
        
        html += `
            <div class="item-masivo-gym" data-orden="${a.orden}" data-precio-base="${precioActual}" style="display:flex; align-items:center; justify-content:space-between; padding:12px 10px; border-bottom:1px solid var(--inf-border); background:var(--inf-card);">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <input type="checkbox" id="chk-masivo-${a.orden}" class="chk-masivo-item" checked style="width:18px; height:18px; cursor:pointer; flex-shrink:0;">
                    <div style="display:flex; flex-direction:column; min-width:0;">
                        <label for="chk-masivo-${a.orden}" style="font-weight:bold; font-size:13px; color:var(--inf-text); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.gym}</label>
                        <span style="font-size:11px; color:var(--inf-azul); font-weight:bold;">Actual: $${precioActual.toLocaleString('es-AR')}</span>
                    </div>
                </div>
                <input type="number" id="inp-masivo-precio-${a.orden}" value="${precioActual}" style="width:90px; padding:6px; border:2px solid var(--inf-border); background:var(--inf-bg); color:var(--inf-text); border-radius:6px; font-weight:bold; text-align:right; outline:none; flex-shrink:0; transition:border-color 0.2s;">
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

function aplicarPorcentajeMasivo() {
    const porc = parseFloat(document.getElementById('masivo-porcentaje').value);
    if (isNaN(porc) || porc <= 0) {
        mostrarMensaje('Ingresá un porcentaje válido mayor a 0', 'error');
        return;
    }

    const items = document.querySelectorAll('.item-masivo-gym');
    items.forEach(item => {
        const precioBase = parseFloat(item.getAttribute('data-precio-base'));
        const inpNuevo = document.getElementById('inp-masivo-precio-' + item.getAttribute('data-orden'));
        const chk = document.getElementById('chk-masivo-' + item.getAttribute('data-orden'));
        
        if (chk.checked) {
            // Aumento matemático: Precio + Porcentaje
            let nuevoPrecio = precioBase * (1 + (porc / 100));
            
            // Redondea para arriba eliminando decimales (ej: 1450.20 -> 1451)
            nuevoPrecio = Math.ceil(nuevoPrecio); 
            
            inpNuevo.value = nuevoPrecio;
            
            // Animación visual de feedback respetando la UI
            inpNuevo.style.borderColor = 'var(--inf-verde)';
            setTimeout(() => inpNuevo.style.borderColor = 'var(--inf-border)', 800);
        }
    });
}

async function guardarAumentoMasivo() {
    const desde = document.getElementById('masivo-mes-efectivo').value.trim();
    if (!/^\d{2}\/\d{4}$/.test(desde)) {
        mostrarMensaje('El formato de fecha debe ser MM/YYYY', 'error');
        return;
    }

    const items = document.querySelectorAll('.item-masivo-gym');
    let aumentos = [];

    items.forEach(item => {
        const orden = parseInt(item.getAttribute('data-orden'));
        const chk = document.getElementById('chk-masivo-' + orden);
        const precioNuevo = parseFloat(document.getElementById('inp-masivo-precio-' + orden).value);

        if (chk.checked && !isNaN(precioNuevo)) {
            aumentos.push({
                orden: orden,
                desde: desde,
                precio: precioNuevo
            });
        }
    });

    if (aumentos.length === 0) {
        mostrarMensaje('No hay ningún gimnasio seleccionado para aumentar.', 'error');
        return;
    }

    const ok = await modalConfirmar({
        titulo: 'Guardar Aumentos',
        mensaje: `Se actualizará el precio de ${aumentos.length} gimnasios a partir del mes ${desde}.\n¿Estás seguro?`,
        icono: '💾', color: '#0f9d58', btnOk: 'Sí, aplicar', btnCancel: 'Cancelar'
    });
    if (!ok) return;

    cerrarModalAumentoMasivo();
    mostrarMensaje('Aplicando aumentos masivos... ⏳', 'cargando');

    try {
        // Enviar el paquete entero a la nueva función del backend
        await llamarAPI({ accion: "actualizarPreciosMasivos", payload: { aumentos: aumentos } });
        
        // Actualizar la lista en memoria para no tener que recargar toda la página
        aumentos.forEach(aum => {
            const abono = listaAbonosBase.find(a => a.orden === aum.orden);
            if (abono) {
                if (!abono.preciosHistorial) abono.preciosHistorial = [];
                abono.preciosHistorial = abono.preciosHistorial.filter(e => e.desde !== aum.desde);
                abono.preciosHistorial.push({ desde: aum.desde, precio: aum.precio });
                abono.preciosHistorial.sort((a, b) => {
                    const [am, ay] = a.desde.split('/').map(Number);
                    const [bm, by] = b.desde.split('/').map(Number);
                    return (ay * 12 + am) - (by * 12 + bm);
                });
            }
        });

        mostrarMensaje(`✅ ${aumentos.length} precios actualizados correctamente.`, 'exito');
        renderizarAbonos(); // Refresca las tarjetas visualmente
    } catch(e) {
        mostrarMensaje('❌ Error al guardar masivamente: ' + e.message, 'error');
    }
}