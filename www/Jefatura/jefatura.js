// ============================================================
//  jefatura.js — Lógica exclusiva de la vista Jefatura
//  FIXES: matching flexible, motivo vacío, gyms del mes, timeout API
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec";

// ── Estado global ─────────────────────────────────────────
let historialGlobal         = [];
let datosCalendarioGlobal   = [];
let fechaVistaJefatura      = new Date();
let añoVistaActual          = new Date().getFullYear();
let cronogramaZonasDinamico = null;
let cacheDocumentosJefatura = [];
let callbackConfirmacion    = null;

// ── Helpers de UI ─────────────────────────────────────────
function mostrarAlerta(msg) {
    document.getElementById('msg-alerta').innerText = msg;
    document.getElementById('modalAlerta').style.display = 'flex';
}
function mostrarConfirmacion(msg, cb) {
    document.getElementById('msg-confirmacion').innerText = msg;
    callbackConfirmacion = cb;
    document.getElementById('modalConfirmacion').style.display = 'flex';
}
function cerrarConfirmacion(ok) {
    document.getElementById('modalConfirmacion').style.display = 'none';
    if (callbackConfirmacion) callbackConfirmacion(ok);
    callbackConfirmacion = null;
}

// ── Normalización de texto para comparaciones flexibles ────
function normalizar(str) {
    return str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
}

// Expande abreviaturas comunes antes de comparar
function _normGym(str) {
    return normalizar(str || '')
        .replace(/\bcons\.?\b/g,   'consorcio')
        .replace(/\bprop\.?\b/g,   'propietarios')
        .replace(/\bcoprops?\.?\b/g, 'copropietarios')
        .replace(/[.,\-\/\\()\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
 
function gymCoincide(gymHistorial, gymCronograma) {
    if (!gymHistorial || !gymCronograma) return false;
    const a = _normGym(gymHistorial);
    const b = _normGym(gymCronograma);
 
    // 1. Coincidencia exacta después de normalizar (lo más confiable)
    if (a === b) return true;
 
    // 2. Uno contiene al otro COMPLETAMENTE (no substring parcial de una palabra)
    //    Mínimo 10 chars para evitar falsos positivos con nombres cortos
    //    Ejemplo válido:    "consorcio torre oro" ⊂ "consorcio torre oro 2" → TRUE
    //    Ejemplo inválido:  "consorcio torre oro" ⊄ "consorcio torre gelly 3650" → FALSE
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (shorter.length >= 10 && longer.includes(shorter)) return true;
 
    return false;
    // FIX: ELIMINADO el bloque de palabras sueltas (era el causante del bug)
    // Antes: "tower".length>4 && "consorcio torre gelly".includes("torre") → TRUE (incorrecto)
    // Ahora: no se hace esa comparación → FALSE (correcto)
}

// FIX: motivo preventivo — ya NO incluye motivos vacíos como preventivos
function esMotivoPresentivo(motivo) {
    const m = String(motivo || "").toLowerCase();
    return m.includes("preventivo") || m === "mantenimiento preventivo" || m.includes(" mp");
}

// ── API con timeout (FIX: evita spinners infinitos) ────────
async function llamarAPI(obj, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(obj),
            redirect: "follow",
            signal: controller.signal
        });
        clearTimeout(timer);
        const result = await resp.json();
        if (result.status === "success") return result.data;
        throw new Error(result.message || "Error del servidor");
    } catch(e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error("La solicitud tardó demasiado. Verificá tu conexión.");
        throw e;
    }
}

// ── Auth con expiración (FIX: no queda sesión abierta para siempre) ──
const AUTH_KEY    = 'sf_jefatura_auth';
const AUTH_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function _tieneAcceso() {
    try {
        const raw = sessionStorage.getItem(AUTH_KEY);
        if (!raw) return false;
        const { expiry } = JSON.parse(raw);
        if (Date.now() > expiry) { sessionStorage.removeItem(AUTH_KEY); return false; }
        return true;
    } catch(e) { return false; }
}

function _guardarAcceso() {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ expiry: Date.now() + AUTH_TTL_MS }));
    // Mantener compatibilidad con código legacy que lee localStorage
    localStorage.setItem("auth_jefatura", "true");
}

// ── Verificación de acceso ────────────────────────────────
async function verificarAcceso() {
    const pass = document.getElementById('input-pass').value.trim();
    if (!pass) return;
    const errEl     = document.getElementById('pass-error');
    const loadingEl = document.getElementById('pass-loading');
    const btnEl     = document.getElementById('btn-ingresar');

    errEl.style.display     = 'none';
    loadingEl.style.display = 'block';
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.6'; }

    try {
        const res = await llamarAPI({ accion: "verificarPassword", payload: { pass, destino: "jefatura" } });
        if (res && res.ok) {
            _guardarAcceso();
            _ocultarModalPass();
            iniciarJefatura();
        } else {
            errEl.style.display     = 'block';
            loadingEl.style.display = 'none';
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
            document.getElementById('input-pass').value = '';
            setTimeout(() => document.getElementById('input-pass')?.focus(), 100);
        }
    } catch(e) {
        errEl.innerText         = '❌ Error de conexión. Verificá tu internet.';
        errEl.style.display     = 'block';
        loadingEl.style.display = 'none';
        if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
    }
}

// ── Arranque de la página ─────────────────────────────────
async function iniciarJefatura() {
    const st = document.getElementById('status-jefatura');
    st.className = "status mostrar cargando";
    st.innerText = "Sincronizando datos... ⏳";
    st.style.display = 'block';

    const btnSync = document.getElementById('btn-sincronizar-zonas');
    if (btnSync) btnSync.style.display = 'flex';

    try {
        const [datosCalendario, resultadoCron, datosAbonos] = await Promise.all([
            llamarAPI({ accion: "obtenerDatosCalendarioWeb" }),
            llamarAPI({ accion: "obtenerCronogramaDesdeSheet" }).catch(() => ({ zonas: [], historial: [] })),
            llamarAPI({ accion: "obtenerAbonosBD" }).catch(() => [])
        ]);

        window.listaAbonosGlobal = datosAbonos || [];

        if (resultadoCron.zonas && resultadoCron.zonas.length > 0) {
            cronogramaZonasDinamico = resultadoCron.zonas;
        }

        let combined = await llamarAPI({ accion: "obtenerRegistroHistorico" }).catch(() => []);
        (resultadoCron.historial || []).forEach(n => {
            if (!combined.some(v => v.gym === n.gym && v.año === n.año && v.mes === n.mes && v.dia === n.dia))
                combined.push(n);
        });
        historialGlobal = combined;

        renderizarJefaturaCompleta(datosCalendario);
        activarBotonHistorial();
    } catch(e) {
        st.innerText = "Error al cargar datos: " + e.message;
        st.className = "status mostrar error";
    }
}

function renderizarJefaturaCompleta(datos) {
    if (!datos || datos.length === 0) {
        const st = document.getElementById('status-jefatura');
        st.innerText = "No hay registros este mes.";
        st.className = "status mostrar error";
        return;
    }
    datosCalendarioGlobal = datos;
    document.getElementById('status-jefatura').style.display = 'none';
    document.getElementById('kpi-box').style.display         = 'grid';
    const btnExportar = document.getElementById('btn-exportar-clientes');
    if (btnExportar) btnExportar.style.display = 'flex';
    document.getElementById('cal-header').style.display  = 'flex';
    document.getElementById('cal-wrapper').style.display = 'block';
    dibujarGrillaMes(fechaVistaJefatura.getFullYear(), fechaVistaJefatura.getMonth());
    cargarIngresosJefatura();
}

// ── KPIs de ingresos ─────────────────────────────────────
async function cargarIngresosJefatura() {
    try {
        const docs = await llamarAPI({ accion: "obtenerDocumentosBD", payload: { hoja: "Presupuestos de Reparacion" } });
        cacheDocumentosJefatura = docs || [];
    } catch(e) {}
    actualizarKPIIngresos();
}

function actualizarKPIIngresos() {
    const mesNum  = fechaVistaJefatura.getMonth() + 1;
    const anioNum = fechaVistaJefatura.getFullYear();

    function parsearFecha(f) {
        if (!f) return null;
        let s = String(f);
        if (s.includes('T')) return new Date(s);
        let p = s.split('/');
        if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
        return null;
    }

    let facturasAnuladas = new Set();
    let notasCredito = cacheDocumentosJefatura.filter(d => String(d.numFactura || "").startsWith("NC "));
    let normales     = cacheDocumentosJefatura.filter(d => {
        let n = String(d.numFactura || "");
        return n && !n.startsWith("NC ") && (n.includes("A-") || n.includes("B-") || n.includes("C-"));
    });
    notasCredito.forEach(nc => {
        let cuit  = String(nc.cuit || "").replace(/\D/g,"");
        let total = Math.round(Number(nc.total));
        let fNC   = parsearFecha(nc.fecha);
        let cands = normales.filter(f => String(f.cuit||"").replace(/\D/g,"") === cuit &&
            Math.abs(Math.round(Number(f.total)) - total) <= 1);
        if (cands.length) {
            cands.sort((a,b) => {
                let fa = parsearFecha(a.fecha), fb = parsearFecha(b.fecha);
                return (fa&&fNC ? Math.abs(fa-fNC) : Infinity) - (fb&&fNC ? Math.abs(fb-fNC) : Infinity);
            });
            facturasAnuladas.add(cands[0].id);
        }
    });

    let ingresoMes = 0, ingresoAnio = 0;
    cacheDocumentosJefatura.forEach(doc => {
        if (String(doc.numFactura||"").startsWith("NC ")) return;
        if (facturasAnuladas.has(doc.id)) return;
        let total = Number(doc.total) || 0;
        let f = parsearFecha(doc.fecha);
        if (!f) return;
        if (f.getFullYear() === anioNum) {
            ingresoAnio += total;
            if (f.getMonth() + 1 === mesNum) ingresoMes += total;
        }
    });

    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const esMobile = window.innerWidth <= 768;
    const fmt = n => {
        const v = Math.round(n);
        if (esMobile) {
            if (v >= 1_000_000) return '$' + (v / 1_000_000).toLocaleString('es-AR', {maximumFractionDigits:1}) + 'M';
            if (v >= 1_000)     return '$' + (v / 1_000).toLocaleString('es-AR', {maximumFractionDigits:0}) + 'K';
        }
        return '$' + v.toLocaleString('es-AR');
    };
    const fmtFull = n => '$' + Math.round(n).toLocaleString('es-AR');

    const tituloEl = document.getElementById('kpi-titulo-ingresos-mes');
    if (tituloEl) tituloEl.innerText = `💰 ${meses[mesNum-1].substring(0,3)} ${anioNum}`;

    const mesEl = document.getElementById('kpi-ingresos-mes');
    if (mesEl) { mesEl.innerText = fmt(ingresoMes); mesEl.title = fmtFull(ingresoMes); }

    const anioEl = document.getElementById('kpi-ingresos-anio');
    if (anioEl) { anioEl.innerText = fmt(ingresoAnio); anioEl.title = fmtFull(ingresoAnio); }

    const boxIngresos = document.getElementById('kpi-box-ingresos');
    if (boxIngresos) boxIngresos.style.display = 'grid';
}

// ── Calendario ────────────────────────────────────────────
function cambiarMesJefatura(dir) {
    fechaVistaJefatura.setMonth(fechaVistaJefatura.getMonth() + dir);
    dibujarGrillaMes(fechaVistaJefatura.getFullYear(), fechaVistaJefatura.getMonth());
    actualizarKPIIngresos();
}

function dibujarGrillaMes(año, mes) {
    const mN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    document.getElementById('cal-titulo').innerText = mN[mes] + " " + año;

    let grid = document.getElementById('calendario-grid');
    grid.innerHTML = "";
    ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].forEach(d => {
        grid.innerHTML += `<div class="cal-dia-header">${d}</div>`;
    });

    const primer  = new Date(año, mes, 1);
    const ultimo  = new Date(año, mes+1, 0);
    const mapDays = [6,0,1,2,3,4,5];
    let offset = mapDays[primer.getDay()];

    for (let i=0; i<offset; i++) grid.innerHTML += `<div class="cal-celda empty"></div>`;

    let totalVisitas=0, tecSet=new Set(), conteoDias={};

    for (let dia=1; dia<=ultimo.getDate(); dia++) {
        let v = datosCalendarioGlobal.filter(d => d.año===año && d.mes===mes && d.dia===dia);
        let html = `<div class="cal-celda"><div class="cal-numero">${dia}</div>`;
        if (v.length > 0) {
            v.forEach(x => { totalVisitas++; tecSet.add(x.tecnico); conteoDias[dia]=(conteoDias[dia]||0)+1; });
            html += `<button onclick="abrirModalRecorrido(${año},${mes},${dia})"
                style="background:#e8f0fe;color:#1a73e8;border:1px solid #1a73e8;border-radius:6px;
                       padding:8px 4px;font-size:11px;font-weight:bold;cursor:pointer;width:100%;
                       margin-top:5px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                🔍 Ver Recorrido<br><span style="color:#d93025;">(${v.length} visitas)</span></button>`;
        }
        html += `</div>`;
        grid.innerHTML += html;
    }

    let sobrantes = (7 - ((offset+ultimo.getDate()) % 7)) % 7;
    for (let i=0; i<sobrantes; i++) grid.innerHTML += `<div class="cal-celda empty"></div>`;

    document.getElementById('kpi-visitas').innerText = totalVisitas;
    document.getElementById('kpi-tecnicos').innerText = tecSet.size;

    let maxDia="-", maxV=0;
    for (const [d,c] of Object.entries(conteoDias)) {
        if (c > maxV) { maxV=c; maxDia=`${d} de ${mN[mes].substring(0,3)}`; }
    }
    document.getElementById('kpi-dia').innerText = maxV > 0 ? `${maxDia} (${maxV})` : "-";

    // ── NUEVO: Panel de gyms que corresponden este mes ────
    renderizarPanelGymsMes(año, mes);
}

// ══════════════════════════════════════════════════════════
//  PANEL "GYMS DEL MES" — FIX PRINCIPAL SOLICITADO
//  Muestra qué gyms deben visitarse este mes según cronograma,
//  cuáles ya fueron visitados y cuáles están pendientes.
// ══════════════════════════════════════════════════════════
function renderizarPanelGymsMes(año, mes) {
    // Eliminar panel previo si existe
    const previo = document.getElementById('panel-gyms-mes');
    if (previo) previo.remove();

    const zonas = (cronogramaZonasDinamico && cronogramaZonasDinamico.length > 0)
        ? cronogramaZonasDinamico
        : cronogramaZonasFallback;

    if (!zonas || zonas.length === 0) return;

    // Determinar qué gyms corresponden visitar este mes
    let gymsPendientes = [];
    let gymsVisitados  = [];

    zonas.forEach(zonaObj => {
        (zonaObj.clientes || []).forEach(cliente => {
            const inicio = (cliente.mesInicio !== undefined && cliente.mesInicio !== null)
                ? cliente.mesInicio : 0;
            const tipo = getTipoCasillero(cliente.freq, cliente.nombre, mes, inicio);

            // Solo los que deben visitarse este mes (no BLACK)
            if (tipo === "BLACK") return;

            // Buscar si ya fue visitado este mes en el historial
            // FIX: usar gymCoincide (matching flexible) en lugar de === estricto
            const visitas = historialGlobal.filter(v =>
                gymCoincide(v.gym, cliente.nombre) &&
                v.año === año &&
                v.mes  === mes &&
                esMotivoPresentivo(v.motivo)
            );

            const obj = {
                nombre: cliente.nombre,
                zona:   zonaObj.zona,
                freq:   cliente.freq,
                dias:   visitas.length > 0
                    ? [...new Set(visitas.map(v => v.dia))].filter(d => d>=1 && d<=31).sort((a,b)=>a-b)
                    : []
            };

            if (visitas.length > 0) gymsVisitados.push(obj);
            else gymsPendientes.push(obj);
        });
    });

    if (gymsPendientes.length === 0 && gymsVisitados.length === 0) return;

    const mN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    const panel = document.createElement('div');
    panel.id = 'panel-gyms-mes';
    panel.style.cssText = `
        background: white;
        border-radius: 16px;
        border: 1px solid rgba(0,0,0,0.07);
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        margin-top: 16px;
        overflow: hidden;
    `;

    const total = gymsPendientes.length + gymsVisitados.length;
    const pct   = total > 0 ? Math.round((gymsVisitados.length / total) * 100) : 0;

    panel.innerHTML = `
        <div style="padding:16px 18px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
            <div>
                <div style="font-size:16px; font-weight:900; color:#1d2939;">
                    📍 Gyms de ${mN[mes]} ${año}
                </div>
                <div style="font-size:12px; color:#9aa0a6; margin-top:3px;">
                    ${gymsVisitados.length} visitados · ${gymsPendientes.length} pendientes
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:22px; font-weight:900; color:${pct===100 ? '#0f9d58' : pct>50 ? '#1a73e8' : '#d93025'};">${pct}%</div>
                <div style="font-size:11px; color:#9aa0a6;">completado</div>
            </div>
        </div>
        <div style="height:5px; background:#f0f2f5;">
            <div style="height:100%; width:${pct}%; background:${pct===100 ? '#0f9d58' : '#1a73e8'}; transition:width 0.6s ease; border-radius:0 3px 3px 0;"></div>
        </div>

        ${gymsPendientes.length > 0 ? `
        <div style="padding:12px 18px 6px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; color:#d93025; background:#fff5f5;">
            ⚠️ Pendientes (${gymsPendientes.length})
        </div>
        <div style="padding:4px 12px 10px; background:#fff5f5; display:flex; flex-wrap:wrap; gap:6px;">
            ${gymsPendientes.map(g => `
                <div style="background:white; border:1.5px solid #f28b82; border-radius:8px; padding:7px 11px; font-size:12px;">
                    <div style="font-weight:800; color:#d93025;">${g.nombre}</div>
                    <div style="font-size:10px; color:#9aa0a6; margin-top:2px;">${g.zona} · ${g.freq}</div>
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${gymsVisitados.length > 0 ? `
        <div style="padding:12px 18px 6px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; color:#0f9d58; background:#f6fef9;">
            ✅ Visitados (${gymsVisitados.length})
        </div>
        <div style="padding:4px 12px 10px; background:#f6fef9; display:flex; flex-wrap:wrap; gap:6px;">
            ${gymsVisitados.map(g => `
                <div style="background:white; border:1.5px solid #81c995; border-radius:8px; padding:7px 11px; font-size:12px;">
                    <div style="font-weight:800; color:#0f9d58;">${g.nombre}</div>
                    <div style="font-size:10px; color:#9aa0a6; margin-top:2px;">
                        ${g.zona} · Día${g.dias.length > 1 ? 's' : ''}: ${g.dias.join(', ')}
                    </div>
                </div>
            `).join('')}
        </div>
        ` : ''}
    `;

    // Aplicar dark mode si corresponde
    if (document.body.classList.contains('dark-mode')) {
        panel.style.background = '#1a1f2e';
        panel.style.borderColor = 'rgba(255,255,255,0.07)';
    }

    // Insertar después del wrapper del calendario
    const calWrapper = document.getElementById('cal-wrapper');
    if (calWrapper && calWrapper.parentNode) {
        calWrapper.parentNode.insertBefore(panel, calWrapper.nextSibling);
    }
}

function abrirModalRecorrido(año, mes, dia) {
    const mN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    document.getElementById('titulo-modal-recorrido').innerText = `Ruta: ${dia} de ${mN[mes]}`;
    let visitas = datosCalendarioGlobal.filter(d => d.año===año && d.mes===mes && d.dia===dia);
    let agrupado = {};
    visitas.forEach(v => {
        if (!agrupado[v.tecnico]) agrupado[v.tecnico] = [];
        agrupado[v.tecnico].push(`<b>${v.hora}</b> - ${v.gym}`);
    });
    const colores = ["#4285F4","#DB4437","#F4B400","#0F9D58","#AB47BC","#00ACC1"];
    let html="", i=0;
    for (const [tec, regs] of Object.entries(agrupado)) {
        regs.sort();
        let c = colores[i++ % colores.length];
        html += `<div style="background:#f8f9fa;border-left:4px solid ${c};padding:12px;margin-bottom:12px;border-radius:8px;">
            <div style="font-weight:900;color:${c};font-size:15px;margin-bottom:8px;">👤 ${tec}</div>
            <div style="color:#3c4043;font-size:13px;line-height:1.8;">${regs.join("<br>")}</div>
            <div style="color:#d93025;font-size:12px;margin-top:8px;font-weight:bold;border-top:1px solid #eee;padding-top:5px;">Total: ${regs.length} visita(s)</div>
        </div>`;
    }
    document.getElementById('contenido-modal-recorrido').innerHTML = html;
    const modal = document.getElementById('modalRecorrido');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('mostrar'), 10);
}

// ── Historial Anual (grilla) ──────────────────────────────
const cronogramaZonasFallback = [
    { zona: "Zona 1", clientes: [
        { nombre: "Always Club 1 (Guatemala)", freq: "Mensual" },
        { nombre: "Always Club 2 (Costa Rica)", freq: "Mensual" },
        { nombre: "Gimnasio Narziso Fitness Club", freq: "Mensual" },
        { nombre: "Consorcio Gurruchaga 2140", freq: "Trimestral" },
        { nombre: "Consorcio Palermo 1 (Uriarte)", freq: "Mensual" },
        { nombre: "Consorcio Paraguay 4871 (Godoy Cruz)", freq: "Bimestral" },
        { nombre: "Consorcio Paraguay 4747 (Town House)", freq: "Mensual" },
        { nombre: "Consorcio Grand Bourg (Figueroa Alcorta 3051)", freq: "Mensual" },
        { nombre: "Consorcio Palacio Alcorta", freq: "Mensual" },
        { nombre: "Consorcio Torre Gelly 3650", freq: "Mensual" },
        { nombre: "Consorcio Segui 3672", freq: "Mensual" },
        { nombre: "Consorcio Libertador 2424", freq: "Mensual" },
        { nombre: "Consorcio Ruggieri 3045", freq: "Mensual" },
        { nombre: "Consorcio Austria 2660", freq: "Mensual" },
        { nombre: "Consorcio Austria 1709", freq: "Mensual" },
        { nombre: "Consorcio Rugierri 2935 (Cerviño)", freq: "Mensual" },
        { nombre: "Consorcio Juncal Plaza", freq: "Mensual" },
        { nombre: "Consorcio Juncal Park", freq: "Mensual" },
        { nombre: "Hotel Palladio", freq: "Trimestral" },
        { nombre: "Consorcio Riobamba 1261", freq: "Bimestral" },
        { nombre: "Consorcio Premier Rodriguez Peña", freq: "Mensual" },
        { nombre: "Consorcio Juncal 1919", freq: "Mensual" }
    ]},
    { zona: "Zona 2", clientes: [
        { nombre: "Consorcio Malabia 444", freq: "Mensual" },
        { nombre: "Banco Galicia (Torre Leiva)", freq: "Mensual" },
        { nombre: "Consorcio Charlone 555", freq: "Mensual" },
        { nombre: "Consorcio Virrey del Pino 1769", freq: "Mensual" },
        { nombre: "Consorcio Arevalo 1950", freq: "Bimestral" },
        { nombre: "Consorcio Live Hotel", freq: "Mensual" },
        { nombre: "Consorcio Cramer 1753", freq: "Mensual" },
        { nombre: "Consorcio Astor Nuñez", freq: "Bimestral" },
        { nombre: "Consorcio WOW (Nuñez 2422)", freq: "Mensual" },
        { nombre: "Consorcio 3 de Febrero 2845", freq: "Trimestral" },
        { nombre: "Consorcio Jardines del Libertador", freq: "Mensual" },
        { nombre: "Club Hipico Argentino", freq: "Bimestral" },
        { nombre: "Edificio Awwa", freq: "Mensual" },
        { nombre: "Consorcio Rosales 2575", freq: "Bimestral" },
        { nombre: "Consorcio Wave Libertador", freq: "Bimestral" },
        { nombre: "Consorcio Arcos 1539", freq: "Trimestral" },
        { nombre: "Consorcio Arcos 1965", freq: "Trimestral" },
        { nombre: "Consorcio Lacroze 2201", freq: "Mensual" },
        { nombre: "Consorcio Elcano 2855", freq: "Mensual" }
    ]},
    { zona: "Zona 3", clientes: [
        { nombre: "Consorcio Segui 4602", freq: "Mensual" },
        { nombre: "Consorcio Quartier de Maria", freq: "Mensual" },
        { nombre: "Consorcio Torre Oro", freq: "Mensual" },
        { nombre: "Consorcio Quantum Beruti", freq: "Bimestral" },
        { nombre: "Consorcio Torres del Yacht Norte", freq: "Mensual" },
        { nombre: "Consorcio Torres del Yacht Sur", freq: "Mensual" },
        { nombre: "Osseg Sindicato Seguros", freq: "Mensual" },
        { nombre: "Suites Tematicas (Hotel Boca)", freq: "Bimestral" },
        { nombre: "Hotel Marriot Buenos Aires", freq: "Bimestral" },
        { nombre: "Consorcio Medrano 820", freq: "Trimestral" },
        { nombre: "Gimnasio Eleache", freq: "Bimestral" },
        { nombre: "Torre Milenium Tower 3 (2264)", freq: "Bimestral" },
        { nombre: "DHL Express (Av. Larrazabal)", freq: "Bimestral" },
        { nombre: "Consorcio Rio de Janeiro 257", freq: "Bimestral" }
    ]},
    { zona: "Zona 4", clientes: [
        { nombre: "Consorcio Miradores de la Bahia", freq: "Mensual" },
        { nombre: "Consorcio Condominios Bahia", freq: "Mensual" },
        { nombre: "Asociacion Civil el Yacht Nordelta", freq: "Mensual" },
        { nombre: "Barrios Los Alisos", freq: "Mensual" },
        { nombre: "Barrancas del Lago", freq: "Mensual" },
        { nombre: "Club Santa Barbara", freq: "Mensual" },
        { nombre: "Country Bahia del Sol", freq: "Mensual" },
        { nombre: "Consorcio Antares Nordelta", freq: "Trimestral" },
        { nombre: "Consorcio La Alameda Nordelta", freq: "Mensual" },
        { nombre: "Consorcio de Propietarios Quartier Nordelta", freq: "Bimestral" },
        { nombre: "Trainer Gym Tigre", freq: "Mensual" }
    ]},
    { zona: "Zona 5", clientes: [
        { nombre: "Country El Carmel (Pilar)", freq: "Mensual" },
        { nombre: "Country La Delfina", freq: "Mensual" },
        { nombre: "Country Pilar del Lago", freq: "Mensual" },
        { nombre: "Club Armenia (Pilar)", freq: "Mensual" },
        { nombre: "46 Plaza Pilar (Camagno)", freq: "Mensual" },
        { nombre: "Barrio Mi Refugio (Canning)", freq: "Mensual" },
        { nombre: "Consorcio de Prop Country Golf El Sosiego", freq: "Mensual" },
        { nombre: "Gimnasio Olimpo SPA (La Plata)", freq: "Mensual" },
        { nombre: "Vila Point Benavidez", freq: "Mensual" },
        { nombre: "Gimnasio Graciela (Isidro Casanova)", freq: "Mensual" }
    ]}
];

function getTipoCasillero(freq, nombre, mesIdx, mesInicio) {
    if (freq === "Mensual") return "M";
    const inicio = (mesInicio !== undefined && mesInicio !== null) ? Number(mesInicio) : 0;
    if (freq === "Bimestral") {
        const diff = ((mesIdx - inicio) % 2 + 2) % 2;
        return diff === 0 ? "B" : "BLACK";
    }
    if (freq === "Trimestral") {
        const diff = ((mesIdx - inicio) % 3 + 3) % 3;
        return diff === 0 ? "T" : "BLACK";
    }
    return "M";
}

function renderizarGrillaAnual() {
    document.getElementById('modal-titulo').innerHTML =
        'PERIODO ' + añoVistaActual +
        ' <span style="cursor:pointer;font-size:18px;margin-left:10px;color:#fbbc04;" onclick="forzarRefreshHistorial()" title="Actualizar desde Sheet">🔄</span>';
    document.getElementById('btn-prev').disabled = (añoVistaActual <= 2024);
    document.getElementById('btn-next').disabled = (añoVistaActual >= new Date().getFullYear());

    const mA  = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const suf = String(añoVistaActual).slice(-2);
    const zonas = (cronogramaZonasDinamico && cronogramaZonasDinamico.length > 0)
        ? cronogramaZonasDinamico : cronogramaZonasFallback;

    let html = cronogramaZonasDinamico
        ? `<div style="background:#e6f4ea;color:#0f9d58;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:bold;margin-bottom:10px;border:1px solid #ceead6;">✅ Datos desde Google Sheets (${cronogramaZonasDinamico.length} zonas). Tocá 🔄 para sincronizar.</div>`
        : `<div style="background:#fff3e0;color:#e65100;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:bold;margin-bottom:10px;border:1px solid #ffcc80;">⚠️ Usando cronograma interno. Creá las hojas "Zona 1".."Zona 5" en el Sheet para datos en vivo.</div>`;

    zonas.forEach(zonaObj => {
        html += `<button class="zona-header-btn" onclick="this.nextElementSibling.classList.toggle('activa')">📍 ${zonaObj.zona.toUpperCase()}</button>`;
        html += `<div class="zona-tabla-wrapper activa"><div class="zona-container"><table class="excel-table"><thead>
            <tr class="excel-header-row"><th colspan="14">MANTENIMIENTO PREVENTIVO PERIODO ${añoVistaActual} ${zonaObj.zona.toUpperCase()}</th></tr>
            <tr class="excel-subheader-row"><th class="gym-number-cell">Nº</th><th class="gym-name-cell">Clientes Abonados</th>`;
        mA.forEach(m => html += `<th>${m}-${suf}</th>`);
        html += `</tr></thead><tbody>`;

        zonaObj.clientes.forEach((cliente, idx) => {
            html += `<tr><td class="gym-number-cell">${idx+1}</td><td class="gym-name-cell">${cliente.nombre.toUpperCase()}</td>`;
            for (let m=0; m<12; m++) {
                // FIX: usar gymCoincide (flexible) en lugar de normalizar() === estricto
                // FIX: usar esMotivoPresentivo() en lugar de incluir motivos vacíos
                let visitas = historialGlobal.filter(v =>
                    gymCoincide(v.gym, cliente.nombre) &&
                    v.año === añoVistaActual &&
                    v.mes === m &&
                    esMotivoPresentivo(v.motivo)
                );

                if (visitas.length > 0) {
                    const dias = [...new Set(visitas.map(v=>v.dia))].filter(d=>d>=1&&d<=31).sort((a,b)=>a-b).join(", ");
                    html += `<td class="cell-visit" title="Día ${dias}">${dias}</td>`;
                } else {
                    const inicio = (cliente.mesInicio !== undefined && cliente.mesInicio !== null)
                        ? Number(cliente.mesInicio) : 0;
                    const t = getTipoCasillero(cliente.freq, cliente.nombre, m, inicio);
                    if (t === "BLACK") html += `<td class="cell-black"></td>`;
                    else if (t === "B") html += `<td class="cell-b">B</td>`;
                    else if (t === "T") html += `<td class="cell-t">T</td>`;
                    else html += `<td class="cell-pendiente" title="Pendiente este mes"></td>`;
                }
            }
            html += `</tr>`;
        });
        html += `</tbody></table></div></div>`;
    });

    document.getElementById('contenido-registro').innerHTML = html;
}

function abrirRegistroAnual() {
    añoVistaActual = new Date().getFullYear();
    const modal = document.getElementById('modalRegistro');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('mostrar'), 10);
    if (historialGlobal.length === 0) forzarRefreshHistorial();
    else renderizarGrillaAnual();
}

function cambiarAño(dir) {
    const hoy   = new Date().getFullYear();
    const nuevo = añoVistaActual + dir;
    if (nuevo >= 2024 && nuevo <= hoy) { añoVistaActual = nuevo; renderizarGrillaAnual(); }
}

function cerrarRegistro() {
    const m = document.getElementById('modalRegistro');
    m.classList.remove('mostrar');
    setTimeout(() => { m.style.display = 'none'; }, 300);
}

async function forzarRefreshHistorial() {
    const titulo = document.getElementById('modal-titulo');
    if (titulo) titulo.innerHTML = 'Actualizando... ⏳';
    try {
        const [datosViejos, resultadoAnual] = await Promise.all([
            llamarAPI({ accion: "obtenerRegistroHistorico", payload: { forzar: true } }),
            llamarAPI({ accion: "obtenerCronogramaDesdeSheet" }).catch(() => ({ zonas: [], historial: [] }))
        ]);
        let combined = [...(datosViejos || [])];
        (resultadoAnual.historial || []).forEach(n => {
            if (!combined.some(v => v.gym===n.gym && v.año===n.año && v.mes===n.mes && v.dia===n.dia))
                combined.push(n);
        });
        historialGlobal = combined;
        if (resultadoAnual.zonas && resultadoAnual.zonas.length > 0)
            cronogramaZonasDinamico = resultadoAnual.zonas;
        renderizarGrillaAnual();
    } catch(e) {
        if (titulo) titulo.innerHTML = 'Error al actualizar ❌';
    }
}

// ── Sincronizar historial → zonas ─────────────────────────
async function sincronizarHistorialEnZonasDesdeApp() {
    const btn    = document.getElementById('btn-sincronizar-zonas');
    const status = document.getElementById('status-sync-zonas');
    mostrarConfirmacion(
        "Esto va a rellenar las hojas Zona 1-5 del Sheet con los días de visita de todo el historial.\n\n⏳ Puede tardar hasta 30 segundos. ¿Continuamos?",
        async (ok) => {
            if (!ok) return;
            btn.disabled = true; btn.style.opacity = '0.6';
            btn.innerText = '⏳ Sincronizando...';
            status.style.display = 'block';
            status.style.background = '#e8f0fe'; status.style.color = '#1a73e8';
            status.style.border = '1px solid #aecbfa';
            status.innerText = 'Conectando con Google Sheets... ☁️';
            try {
                const r = await llamarAPI({ accion: "sincronizarHistorialEnZonas" }, 60000);
                status.style.background = '#e6f4ea'; status.style.color = '#0b7a42';
                status.style.border = '1px solid #a8d5b5';
                status.innerText = r;
                forzarRefreshHistorial();
            } catch(e) {
                status.style.background = '#fce8e6'; status.style.color = '#d93025';
                status.style.border = '1px solid #f28b82';
                status.innerText = '❌ Error: ' + e.message;
            } finally {
                btn.disabled = false; btn.style.opacity = '1';
                btn.innerText = '📋 Sincronizar Historial → Hojas de Zona';
                setTimeout(() => { status.style.display = 'none'; }, 12000);
            }
        }
    );
}

// ── Exportar clientes ─────────────────────────────────────
function exportarClientesExcel() {
    if (!window.listaAbonosGlobal || window.listaAbonosGlobal.length === 0) {
        mostrarAlerta("No hay datos de clientes cargados todavía.");
        return;
    }
 
    const existing = document.getElementById("_modal-clientes");
    if (existing) existing.remove();
 
    const abonos = window.listaAbonosGlobal;
    const total  = abonos.reduce((acc, a) => acc + (Number(a.precio) || 0), 0);
    const fmtARS = n => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
 
    // ── Mes y año actual (el que se está viendo en el calendario) ──
    const mesActual = fechaVistaJefatura.getMonth(); // 0-indexed
    const añoActual = fechaVistaJefatura.getFullYear();
    const mesesNombres = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mesLabel = mesesNombres[mesActual] + " " + añoActual;
 
    // ── Normalización para comparar gyms con historialGlobal ──────
    // historialGlobal.gym viene normalizado del backend (lowercase, sin tildes, sin símbolos)
    function normBackend(s) {
        return (s || '').toLowerCase().normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[<>:"/\\|?*]+/g, "")
            .replace(/\s+/g, " ").trim();
    }
 
    // ── Determinar si el gym tuvo visita este mes ─────────────────
    // Usa historialGlobal (ya cargado en memoria al abrir Jefatura)
    function tieneVisitaMes(abonoGym) {
        if (!historialGlobal || historialGlobal.length === 0) return null; // desconocido
        const gymNorm = normBackend(abonoGym);
        return historialGlobal.some(v =>
            v.gym === gymNorm &&
            Number(v.mes) === mesActual &&
            Number(v.año) === añoActual
        );
    }
 
    // ── Construir filas ───────────────────────────────────────────
    const filas = abonos.map((a, i) => {
        const visitoMes = tieneVisitaMes(a.gym); // true / false / null
 
        // Badge de estado del mes
        let badgeMes = '';
        if (visitoMes === true && a.pideRemito) {
            badgeMes = `<span title="Visitado + Remito en ${mesLabel}"
                style="background:#0d4f2e;color:#4ade80;border:1px solid #16a34a;
                       padding:2px 7px;border-radius:6px;font-size:11px;font-weight:800;">
                ✅ OK + 🧾
            </span>`;
        } else if (visitoMes === true) {
            badgeMes = `<span title="Visitado en ${mesLabel}"
                style="background:#0d4f2e;color:#4ade80;border:1px solid #16a34a;
                       padding:2px 7px;border-radius:6px;font-size:11px;font-weight:800;">
                ✅
            </span>`;
        } else if (visitoMes === false && a.pideRemito) {
            badgeMes = `<span title="Sin visita ni remito en ${mesLabel}"
                style="background:#4a0e0e;color:#f87171;border:1px solid #dc2626;
                       padding:2px 7px;border-radius:6px;font-size:11px;font-weight:800;">
                ❌ 🧾
            </span>`;
        } else if (visitoMes === false) {
            badgeMes = `<span title="Sin visita en ${mesLabel}"
                style="background:#1e1e1e;color:#64748b;border:1px solid #334155;
                       padding:2px 7px;border-radius:6px;font-size:11px;font-weight:800;">
                —
            </span>`;
        } else {
            badgeMes = `<span style="color:#475467;font-size:11px;">?</span>`;
        }
 
        // ── Email: botón que muestra/oculta ───────────────────────
        const emailId = `_email-${i}`;
        const emailBtn = a.correo
            ? `<button onclick="
                    var el=document.getElementById('${emailId}');
                    var showing=el.style.display!=='none';
                    el.style.display=showing?'none':'block';
                    this.textContent=showing?'📧 Ver':'📧 Ocultar';
                "
                style="background:#1e3a5f;color:#60a5fa;border:1px solid rgba(96,165,250,0.3);
                       padding:4px 9px;border-radius:6px;font-size:11px;font-weight:700;
                       cursor:pointer;white-space:nowrap;">
                📧 Ver
              </button>
              <div id="${emailId}" style="display:none;margin-top:4px;font-size:11px;
                   color:#94a3b8;word-break:break-all;max-width:240px;line-height:1.4;">
                  ${a.correo}
                  <button onclick="navigator.clipboard.writeText('${(a.correo||'').replace(/'/g,"\\'").replace(/"/g,"&quot;")}').then(()=>{this.textContent='✅';setTimeout(()=>this.textContent='📋',1500);})"
                          style="background:none;border:none;cursor:pointer;font-size:13px;
                                 padding:2px;vertical-align:middle;" title="Copiar">📋</button>
              </div>`
            : '<span style="color:#475467;font-size:11px;">Sin correo</span>';
 
        return `<tr data-gym="${(a.gym||'').toLowerCase()}"
                    style="border-bottom:1px solid rgba(255,255,255,0.04);">
            <td style="padding:8px 10px;color:#94a3b8;font-size:12px;font-weight:700;">${i+1}</td>
            <td style="padding:8px 10px;font-weight:900;font-size:13px;">${a.gym || "—"}</td>
            <td style="padding:8px 10px;font-size:12px;color:#94a3b8;">${a.tipoFact || "—"}</td>
            <td style="padding:8px 10px;font-size:12px;color:#94a3b8;">${a.cuit || "—"}</td>
            <td style="padding:8px 10px;font-size:12px;">${emailBtn}</td>
            <td style="padding:8px 10px;font-weight:900;color:#34d399;text-align:right;">${fmtARS(a.precio||0)}</td>
            <td style="padding:8px 10px;text-align:center;">${badgeMes}</td>
        </tr>`;
    }).join('');
 
    // ── Modal ─────────────────────────────────────────────────────
    const modal = document.createElement("div");
    modal.id = "_modal-clientes";
    modal.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;backdrop-filter:blur(4px);";
 
    modal.innerHTML = `
        <div style="background:#1e293b;border-radius:18px;width:100%;max-width:960px;
                    border:1px solid rgba(255,255,255,0.08);overflow:hidden;
                    box-shadow:0 25px 60px rgba(0,0,0,0.5);margin:auto;">
 
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:18px 22px;background:linear-gradient(135deg,#0f9d58,#0b7a42);">
                <div>
                    <div style="font-size:18px;font-weight:900;color:white;">📊 Clientes Activos</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:2px;">
                        ${abonos.length} clientes · Total mensual: ${fmtARS(total)}
                        &nbsp;·&nbsp;Mes vista: <b>${mesLabel}</b>
                    </div>
                </div>
                <button onclick="document.getElementById('_modal-clientes').remove()"
                        style="background:rgba(255,255,255,0.2);border:none;color:white;
                               width:36px;height:36px;border-radius:50%;font-size:18px;
                               cursor:pointer;font-weight:900;">✕</button>
            </div>
 
            <!-- Leyenda de colores -->
            <div style="padding:8px 20px;background:rgba(255,255,255,0.02);
                        border-bottom:1px solid rgba(255,255,255,0.05);
                        display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#64748b;">
                <span>✅ = Visitado este mes</span>
                <span>✅ + 🧾 = Visitado + requiere remito</span>
                <span>❌ 🧾 = Sin visita (requiere remito)</span>
                <span>— = Sin visita registrada</span>
            </div>
 
            <!-- Buscador -->
            <div style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
                <input type="text" placeholder="🔍 Buscar cliente..."
                       oninput="_filtrarClientesModal(this.value)"
                       style="width:100%;padding:9px 14px;border-radius:8px;
                              border:1.5px solid rgba(255,255,255,0.1);
                              background:rgba(255,255,255,0.05);color:#f1f5f9;
                              font-size:13px;outline:none;box-sizing:border-box;"
                       autocomplete="off">
            </div>
 
            <!-- Tabla -->
            <div style="overflow-x:auto;max-height:65vh;overflow-y:auto;">
                <table id="_tabla-clientes" style="width:100%;border-collapse:collapse;font-family:inherit;">
                    <thead style="position:sticky;top:0;z-index:2;">
                        <tr style="background:#1a2535;">
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:left;white-space:nowrap;">#</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:left;">CLIENTE</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:left;">FACT.</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:left;">CUIT</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:left;">CORREO</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:right;white-space:nowrap;">PRECIO/MES</th>
                            <th style="padding:10px;font-size:11px;color:#64748b;text-align:center;white-space:nowrap;">${mesLabel}</th>
                        </tr>
                    </thead>
                    <tbody style="color:#f1f5f9;">${filas}</tbody>
                </table>
            </div>
 
            <!-- Footer -->
            <div style="padding:14px 22px;background:rgba(0,0,0,0.2);
                        display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <span style="font-size:13px;color:#64748b;">
                    Total mensual estimado: <strong style="color:#34d399;">${fmtARS(total)}</strong>
                </span>
                <button onclick="document.getElementById('_modal-clientes').remove()"
                        style="background:#334155;border:none;color:white;padding:8px 18px;
                               border-radius:8px;font-weight:800;cursor:pointer;font-size:13px;">
                    Cerrar
                </button>
            </div>
        </div>
    `;
 
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}
 
// Filtrado en tiempo real del buscador del modal
function _filtrarClientesModal(texto) {
    const q = texto.toLowerCase().trim();
    document.querySelectorAll('#_tabla-clientes tbody tr').forEach(tr => {
        const gym = tr.dataset.gym || '';
        tr.style.display = (!q || gym.includes(q)) ? '' : 'none';
    });
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('load', () => {
    NavBar.init({ paginaActual: 'jefatura', mostrarBottomNav: false });

    const navDer = document.querySelector('.nav-derecha');
    if (navDer) {
        const btnH = document.createElement('button');
        btnH.className = 'btn-jefe';
        btnH.id = 'btn-historial-nav';
        btnH.style.cssText = 'background:#e8f0fe; color:#1a73e8; opacity:0.6; cursor:not-allowed;';
        btnH.innerText = '⏳ Cargando...';
        btnH.disabled = true;
        navDer.prepend(btnH);
    }

    if (_tieneAcceso()) {
        _ocultarModalPass();
        iniciarJefatura();
    } else {
        _mostrarModalPass();
    }
});

function _mostrarModalPass() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('mostrar')));
    const st = document.getElementById('status-jefatura');
    if (st) st.style.display = 'none';
    setTimeout(() => document.getElementById('input-pass')?.focus(), 300);
}

function _ocultarModalPass() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
}

function activarBotonHistorial() {
    const btn = document.getElementById('btn-historial-nav');
    if (!btn) return;
    btn.disabled = false;
    btn.style.cssText = 'background:#0f9d58; color:white; opacity:1; cursor:pointer;';
    btn.innerText = '📅 Historial Anual';
    btn.onclick = () => abrirRegistroAnual();
}