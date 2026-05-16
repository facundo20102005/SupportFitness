// ============================================================
//  tapizados.js — Lógica exclusiva de la vista Tapizados
//  Depende de: nav.js (global)
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec";

let listaTapizadosPendientes  = [];
let tapizadoSeleccionadoActual = null;
let listaPresupuestosJefe     = [];
let presupuestoSeleccionadoJefe = null;
let callbackConfirmacion      = null;

// ── Helpers ───────────────────────────────────────────────
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
function formatearMoneda(input) {
    let raw = input.value.replace(/\D/g, "");
    input.value = raw ? "$" + parseInt(raw, 10).toLocaleString("es-AR") : "";
}

// ── API ───────────────────────────────────────────────────
async function llamarAPI(obj) {
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(obj),
        redirect: "follow"
    });
    const result = await resp.json();
    if (result.status === "success") return result.data;
    throw new Error(result.message);
}

// ── Verificación de acceso ────────────────────────────────
async function verificarAcceso() {
    const pass = document.getElementById('input-pass').value.trim();
    if (!pass) return;
    document.getElementById('pass-error').style.display = 'none';
    try {
        const res = await llamarAPI({ accion: "verificarPassword", payload: { pass, destino: "tapizados" } });
        if (res && res.ok) {
            if (res.isJefe) localStorage.setItem("auth_jefatura", "true");
            localStorage.setItem("auth_tapizados", "true");
            _ocultarModalPass();
            iniciarTapizados();
        } else {
            document.getElementById('pass-error').style.display = 'block';
        }
    } catch(e) {
        document.getElementById('pass-error').innerText = '❌ Error de conexión.';
        document.getElementById('pass-error').style.display = 'block';
    }
}

// ── Arranque ──────────────────────────────────────────────
function iniciarTapizados() {
    const st = document.getElementById('status-tapizados');
    st.className = "status-inline cargando";
    st.innerHTML = '<span>⏳</span> Buscando pendientes...';
    st.style.display = 'flex';
    document.getElementById('select-tapizados').style.display = 'none';
    document.getElementById('calc-tapizado').style.display = 'none';

    const isMaster = localStorage.getItem("auth_jefatura") === 'true';
    if (isMaster) {
        document.getElementById('panel-jefe-presupuestos').style.display = 'block';
        cargarPresupuestosJefe();
    }

    llamarAPI({ accion: "obtenerTapizadosPendientes" })
        .then(renderizarDropdownTapizados)
        .catch(() => {
            st.className = "status-inline error";
            st.innerHTML = '<span>❌</span> Error al conectar con la BD.';
        });
}

function renderizarDropdownTapizados(pendientes) {
    listaTapizadosPendientes = pendientes;
    const st = document.getElementById('status-tapizados');
    const select = document.getElementById('select-tapizados');
    select.innerHTML = '<option value="">— Elegir Gimnasio Pendiente —</option>';
    if (pendientes.length === 0) {
        st.className = "status-inline exito";
        st.innerHTML = '<span>✅</span> Todo al día. No hay gimnasios marcados para tapizar.';
        st.style.display = 'flex';
        return;
    }
    st.style.display = 'none';
    pendientes.forEach((p, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.text = `${p.gym} (${p.fecha})`;
        select.appendChild(opt);
    });
    select.style.display = 'block';
}

function seleccionarTapizadoPendiente() {
    const idx = document.getElementById('select-tapizados').value;
    const calcBox = document.getElementById('calc-tapizado');
    if (idx === "") { calcBox.style.display = 'none'; return; }
    calcBox.style.display = 'block';
    tapizadoSeleccionadoActual = listaTapizadosPendientes[idx];
    const cont = document.getElementById('contenedor-fotos-precios');
    cont.innerHTML = "";
    const isMaster = localStorage.getItem("auth_jefatura") === 'true';

    if (!tapizadoSeleccionadoActual.fotos.length) {
        cont.innerHTML = `<div style="text-align:center; padding:30px; color:#d93025; font-weight:700; font-size:15px;">
            📷 El técnico no subió fotos en esta visita.
        </div>`;
    } else {
        tapizadoSeleccionadoActual.fotos.forEach((url, i) => {
            if (!url.trim()) return;
            let viewUrl = url;
            let m = url.match(/[-\w]{25,}/);
            if (m) viewUrl = `https://drive.google.com/thumbnail?id=${m[0]}&sz=w800`;
            cont.innerHTML += `
            <div class="tapizado-item" data-foto-url="${url}">
                <div class="tap-foto-header">
                    <span class="unidad-badge">📸 Foto ${i+1}</span>
                    <img src="${viewUrl}" class="foto-preview" alt="Foto tapizado">
                    <button class="zoom-btn" onclick="abrirLupa('${url}')">🔍 Ampliar</button>
                </div>
                <div class="tap-inputs">
                    <label class="tap-label">Detalle de la pieza</label>
                    <input type="text" class="tap-desc-input input-desc in-desc"
                           placeholder="Ej: Asiento, respaldo, laterales...">
                    <div class="tap-nums-grid">
                        <div>
                            <label class="tap-label">Cantidad</label>
                            <input type="number" class="input-cant in-cant" placeholder="1" min="1"
                                   style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:10px; font-size:16px; font-weight:700; text-align:center;"
                                   oninput="recalcularTotalTapizadoVisual()">
                        </div>
                        <div>
                            <label class="tap-label">Precio por unidad</label>
                            <input type="text" inputmode="numeric" class="input-precio in-prec"
                                   placeholder="$0"
                                   style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:10px; font-size:16px; font-weight:700; text-align:center;"
                                   oninput="formatearMoneda(this); recalcularTotalTapizadoVisual()">
                        </div>
                    </div>
                    <div class="photo-total" id="photo-total-${i+1}">Subtotal: $0</div>
                </div>
            </div>`;
        });
    }
    document.getElementById('caja-precio-cliente').style.display = isMaster ? 'flex' : 'none';
    recalcularTotalTapizadoVisual();
}

function abrirLupa(url) {
    let final = url;
    let m = url.match(/[-\w]{25,}/);
    if (m) final = `https://drive.google.com/thumbnail?id=${m[0]}&sz=w2000`;
    document.getElementById('imgLupa').src = final;
    document.getElementById('modalLupa').classList.add('open');
}

function recalcularTotalTapizadoVisual() {
    let suma = 0;
    document.querySelectorAll('.tapizado-item').forEach((item, i) => {
        let cant = parseFloat(item.querySelector('.input-cant').value) || 0;
        let raw  = item.querySelector('.input-precio').value.replace(/\D/g,"");
        let prec = parseFloat(raw) || 0;
        let sub  = cant * prec; suma += sub;
        document.getElementById(`photo-total-${i+1}`).innerText = "Subtotal: $" + sub.toLocaleString('es-AR');
    });
    document.getElementById('precio-tapicero-total').innerText = "$" + suma.toLocaleString('es-AR');
    if (localStorage.getItem("auth_jefatura") === 'true') {
        document.getElementById('precio-cliente-total').innerText = "$" + Math.round(suma * 1.25).toLocaleString('es-AR');
    }
}

function guardarCotizacionDetalladaBD() {
    if (!tapizadoSeleccionadoActual) return;
    let urls=[], descs=[], precios=[], subtotales=[], suma=0;
    document.querySelectorAll('.tapizado-item').forEach(item => {
        let fotoUrl = item.getAttribute('data-foto-url');
        let cant = parseFloat(item.querySelector('.input-cant').value) || 0;
        let raw  = item.querySelector('.input-precio').value.replace(/\D/g,"");
        let prec = parseFloat(raw) || 0;
        let desc = item.querySelector('.input-desc').value.trim() || "Pieza s/n";
        if (cant > 0 && prec > 0) {
            let total = cant * prec; suma += total;
            urls.push(fotoUrl);
            descs.push(`${cant} unidad(es) de ${desc}`);
            precios.push("$" + prec.toLocaleString('es-AR'));
            subtotales.push("$" + total.toLocaleString('es-AR'));
        }
    });
    const finalizar = () => procesarGuardadoFinalTapicero(suma, urls, descs, precios, subtotales);
    if (suma === 0) {
        mostrarConfirmacion("No marcaste precios. ¿Guardar como 'Sin tapizados'?", ok => { if (ok) finalizar(); });
    } else {
        finalizar();
    }
}

function procesarGuardadoFinalTapicero(suma, urls, descs, precios, subtotales) {
    let btn = document.getElementById('btn-guardar-cotizacion');
    let st  = document.getElementById('status-cotizacion');
    btn.disabled = true; st.className="status mostrar cargando"; st.innerText="Guardando...";
    llamarAPI({
        accion: "guardarCotizacionDetallada",
        payload: { remito: tapizadoSeleccionadoActual.remito, urls, descripciones: descs, precios, subtotales, totalT: suma, totalC: suma * 1.25 }
    }).then(res => {
        st.className="status mostrar exito"; st.innerText=res;
        setTimeout(() => iniciarTapizados(), 2500); btn.disabled=false;
    }).catch(() => {
        st.className="status mostrar error"; st.innerText="Error."; btn.disabled=false;
    });
}

// ── Panel Jefe: Presupuestos ──────────────────────────────
function cargarPresupuestosJefe() {
    const sel = document.getElementById("select-presupuestos-jefe");
    const det = document.getElementById("detalle-presupuesto-jefe");
    sel.style.display="none"; det.style.display="none";
    sel.innerHTML='<option value="">-- Elegir Gimnasio Presupuestado --</option>';
    llamarAPI({ accion: "obtenerPresupuestosArmados" }).then(res => {
        listaPresupuestosJefe = res;
        res.forEach((p,i) => { sel.innerHTML += `<option value="${i}">${p.gym} (${p.fecha})</option>`; });
        if (res.length) sel.style.display="block";
    }).catch(() => {});
}

function seleccionarPresupuestoJefe() {
    const idx = document.getElementById("select-presupuestos-jefe").value;
    const det = document.getElementById("detalle-presupuesto-jefe");
    if (idx==="") { det.style.display="none"; return; }
    const p = listaPresupuestosJefe[idx]; presupuestoSeleccionadoJefe = p;
    let costoT = parseFloat(String(p.totalTapicero).replace(/[^0-9,-]+/g,"").replace(',','.')) || 0;
    let precC  = parseFloat(String(p.totalCliente).replace(/[^0-9,-]+/g,"").replace(',','.')) || 0;
    let html = `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:15px;border-bottom:1px solid #ccc;padding-bottom:10px;">
        <b style="font-size:18px;color:#333;">${p.gym}</b>
        <span style="color:#5f6368;font-size:14px;">Visita: ${p.fecha}</span></div>`;
    html += `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
        <tr style="background:#e6f4ea;border-bottom:2px solid #188038;">
            <th style="text-align:left;padding:10px;">Detalle</th>
            <th style="text-align:center;padding:10px;">Precio c/u</th>
            <th style="text-align:right;padding:10px;">Subtotal</th></tr>`;
    let maxLen = Math.max(p.detalle.length, p.precios.length, p.subtotales.length);
    for (let i=0;i<maxLen;i++) {
        let td = p.detalle[i]||"Sin detalle", tp=p.precios[i]||"-", ts=p.subtotales[i]||"$0";
        html += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;word-break:break-word;">${td}</td>
            <td style="text-align:center;padding:10px;color:#5f6368;">${tp}</td>
            <td style="text-align:right;padding:10px;font-weight:bold;color:#1a73e8;">${ts}</td></tr>`;
    }
    html += `</table>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:15px;border-radius:5px;border:1px solid #eee;">
        <div style="color:#5f6368;font-size:14px;">Costo Tapicero:<br>
            <b style="font-size:18px;color:#333;">$${costoT.toLocaleString('es-AR')}</b></div>
        <div style="text-align:right;color:#188038;font-weight:bold;">Precio Final Cliente:<br>
            <input type="text" inputmode="numeric" id="precio-edit-jefe"
                   value="$${precC.toLocaleString('es-AR')}"
                   style="width:130px;font-size:18px;" oninput="formatearMoneda(this)"></div>
    </div>
    <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
        <button onclick="modificarPrecioPresupuesto()"
                style="background:#fbbc04;border:none;padding:10px 16px;border-radius:5px;font-weight:bold;cursor:pointer;">
            💾 Guardar Precio</button>
        <button onclick="marcarPresupuestoEnviado()"
                style="background:#188038;color:white;border:none;padding:10px 16px;border-radius:5px;font-weight:bold;cursor:pointer;">
            📤 Marcar Enviado</button>
    </div>`;
    det.innerHTML = html; det.style.display="block";
}

function modificarPrecioPresupuesto() {
    if (!presupuestoSeleccionadoJefe) return;
    let raw = document.getElementById("precio-edit-jefe").value.replace(/\D/g,"");
    let nuevo = parseFloat(raw);
    if (isNaN(nuevo) || nuevo < 0) { mostrarAlerta("Ingresá un precio válido."); return; }
    llamarAPI({ accion:"actualizarEstadoPresupuesto", payload:{ fila:presupuestoSeleccionadoJefe.fila, accion:"actualizar", nuevoPrecio:nuevo }})
        .then(res => mostrarAlerta(res)).catch(() => mostrarAlerta("Error al guardar precio."));
}

function marcarPresupuestoEnviado() {
    if (!presupuestoSeleccionadoJefe) return;
    mostrarConfirmacion(`¿Seguro que ya le enviaste el presupuesto a ${presupuestoSeleccionadoJefe.gym}?`, ok => {
        if (!ok) return;
        const det = document.getElementById("detalle-presupuesto-jefe");
        det.style.opacity="0.5";
        llamarAPI({ accion:"actualizarEstadoPresupuesto", payload:{ fila:presupuestoSeleccionadoJefe.fila, accion:"enviar" }})
            .then(() => { det.style.display="none"; det.style.opacity="1"; cargarPresupuestosJefe(); mostrarAlerta("Presupuesto guardado como Enviado. 📤"); })
            .catch(() => { mostrarAlerta("Error de red."); det.style.opacity="1"; });
    });
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('load', () => {
    NavBar.init({ paginaActual: 'tapizados', mostrarBottomNav: false });

    const hasJefe  = localStorage.getItem("auth_jefatura")  === 'true';
    const hasTapiz = localStorage.getItem("auth_tapizados") === 'true';

    if (hasJefe || hasTapiz) {
        _ocultarModalPass();
        iniciarTapizados();
    } else {
        _mostrarModalPass();
    }
});

function _mostrarModalPass() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { modal.classList.add('mostrar'); });
    });
    const st = document.getElementById('status-tapizados');
    if (st) st.style.display = 'none';
    setTimeout(() => { document.getElementById('input-pass')?.focus(); }, 300);
}

function _ocultarModalPass() {
    const modal = document.getElementById('modalPassword');
    if (!modal) return;
    modal.classList.remove('mostrar');
    setTimeout(() => { modal.style.display = 'none'; }, 250);
}