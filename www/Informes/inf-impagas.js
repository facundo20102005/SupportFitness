// ══════════════════════════════════════════════════════════════════
//  inf-impagas.js — Facturas de REPARACIONES sin pagar del mes (para anular)
//
//  · Botón "🧾 Reparaciones sin pagar del mes" (se inserta solo, debajo de "Ver Clientes").
//  · El último día del mes (ver AVISO_ULTIMO_HABIL) abre solo la lista, una vez por día,
//    y el botón se pone en rojo con el contador.
//  · Usa los mismos datos y reglas que la lista de Presupuestos Guardados:
//      - sólo facturas de Reparación (clasificarDocumento === 'reparacion')
//      - con número de factura, no anuladas (sin nota de crédito) y no pagadas
//      - cuyo mes de fecha coincide con el mes elegido
//  · NO toca el backend.
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── CONFIGURACIÓN ────────────────────────────────────────────
    // true  → avisa el último día HÁBIL (lunes a viernes) del mes y todos los días que queden hasta fin de mes.
    //         (Ej.: si el mes termina un sábado, avisa desde el viernes.)
    // false → avisa únicamente el último día calendario del mes.
    const AVISO_ULTIMO_HABIL = true;
    const REFRESCO_MS        = 5000;   // cada cuánto actualiza el contador del botón

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                   'Septiembre','Octubre','Noviembre','Diciembre'];

    // ── CSS ──────────────────────────────────────────────────────
    function inyectarCSS() {
        if (document.getElementById('inf-impagas-css')) return;
        const st = document.createElement('style');
        st.id = 'inf-impagas-css';
        st.textContent = `
        .btn-impagas-abrir {
            width: 100%; margin: -6px 0 16px; padding: 12px; border-radius: 14px; cursor: pointer;
            font-weight: 800; font-size: 13px; font-family: inherit;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            background: var(--inf-card); color: #d93025;
            border: 1px solid var(--inf-border); box-shadow: var(--inf-shadow);
            transition: transform .2s, background .2s;
        }
        .btn-impagas-abrir:hover { background: rgba(217,48,37,.10); transform: translateY(-1px); }
        .btn-impagas-abrir:active { transform: scale(.98); }
        .btn-impagas-abrir.alerta {
            background: rgba(217,48,37,.14); border-color: #d93025; animation: iimPulso 2s infinite;
        }
        @keyframes iimPulso {
            0%,100% { box-shadow: 0 0 0 0 rgba(217,48,37,.35); }
            50%     { box-shadow: 0 0 0 6px rgba(217,48,37,0); }
        }
        .iim-badge {
            background: #d93025; color: #fff; border-radius: 999px; padding: 1px 9px;
            font-size: 11px; font-weight: 900;
        }

        #inf-modal-impagas {
            position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.65);
            display: flex; align-items: flex-start; justify-content: center;
            padding: 16px; overflow-y: auto; backdrop-filter: blur(4px);
        }
        .iim-box {
            background: var(--inf-card); color: var(--inf-text); border-radius: 18px;
            width: 100%; max-width: 860px; margin: auto; overflow: hidden;
            border: 1px solid var(--inf-border); box-shadow: 0 25px 60px rgba(0,0,0,.45);
        }
        .iim-head {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 16px 20px; background: linear-gradient(135deg,#d93025,#a50e0e); color: #fff;
        }
        .iim-head h3 { margin: 0; font-size: 17px; font-weight: 900; }
        .iim-head small { display: block; margin-top: 3px; font-size: 12px; opacity: .92; }
        .iim-x {
            background: rgba(255,255,255,.2); border: none; color: #fff; width: 34px; height: 34px;
            border-radius: 50%; font-size: 17px; font-weight: 900; cursor: pointer; flex-shrink: 0;
        }
        .iim-tools {
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
            padding: 10px 16px; border-bottom: 1px solid var(--inf-border);
        }
        .iim-tools label { font-size: 12px; font-weight: 800; color: var(--inf-sub); }
        .iim-tools input[type=month] {
            padding: 7px 10px; border-radius: 8px; border: 1.5px solid var(--inf-border);
            background: var(--inf-bg); color: var(--inf-text); font-family: inherit; font-size: 13px;
        }
        .iim-btn {
            padding: 8px 14px; border-radius: 8px; border: 1px solid var(--inf-border);
            background: var(--inf-azul-lt); color: var(--inf-azul); font-weight: 800; font-size: 12px;
            cursor: pointer; font-family: inherit;
        }
        .iim-aviso {
            padding: 9px 16px; font-size: 12px; color: var(--inf-sub); line-height: 1.45;
            border-bottom: 1px solid var(--inf-border);
        }
        .iim-scroll { overflow: auto; max-height: 62vh; }
        .iim-tabla { width: 100%; border-collapse: collapse; font-family: inherit; }
        .iim-tabla th {
            position: sticky; top: 0; z-index: 2; background: var(--inf-card);
            padding: 10px; font-size: 11px; font-weight: 800; letter-spacing: .4px; text-align: left;
            color: var(--inf-sub); white-space: nowrap; border-bottom: 1px solid var(--inf-border);
        }
        .iim-tabla td { padding: 9px 10px; font-size: 12px; vertical-align: middle; border-bottom: 1px solid var(--inf-border); }
        .iim-tabla tr:hover td { background: rgba(217,48,37,.07); }
        .iim-n    { color: var(--inf-sub); font-weight: 800; }
        .iim-cli  { font-weight: 900; font-size: 13px; }
        .iim-cuit { color: var(--inf-sub); font-size: 11px; margin-top: 2px; }
        .iim-fact { font-weight: 900; color: var(--inf-azul); white-space: nowrap; }
        .iim-tot  { font-weight: 900; text-align: right; white-space: nowrap; }
        .iim-copy { background: none; border: none; cursor: pointer; font-size: 14px; color: var(--inf-azul); padding: 2px 4px; }
        .iim-vacio { padding: 36px 20px; text-align: center; color: var(--inf-sub); font-weight: 700; }
        .iim-foot {
            padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;
            gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--inf-border); font-size: 13px; color: var(--inf-sub);
        }
        @media (max-width: 560px) {
            #inf-modal-impagas { padding: 8px; }
            .iim-tabla td, .iim-tabla th { padding: 8px 6px; }
        }`;
        document.head.appendChild(st);
    }

    // ── Datos ────────────────────────────────────────────────────
    function docsRep() {
        const d = window._docsPorHoja && window._docsPorHoja[HOJA_PRESUPUESTOS];
        return Array.isArray(d) ? d : [];
    }

    function datosListos() {
        return docsRep().length > 0
            && Array.isArray(window.listaAbonosBase) && window.listaAbonosBase.length > 0
            && typeof clasificarDocumento === 'function' && typeof limpiarFecha === 'function';
    }

    // Si todavía no cargó algo, lo pide (una vez) con las mismas acciones de siempre
    async function asegurarDatos() {
        if (datosListos()) return true;
        try {
            if (!docsRep().length && typeof window.llamarAPI === 'function') {
                const r = await window.llamarAPI({ accion: 'obtenerDocumentosBD', payload: { hoja: HOJA_PRESUPUESTOS } });
                window._docsPorHoja = window._docsPorHoja || {};
                window._docsPorHoja[HOJA_PRESUPUESTOS] = Array.isArray(r) ? r : [];
            }
            if (!(window.listaAbonosBase || []).length && typeof window.llamarAPI === 'function') {
                const a = await window.llamarAPI({ accion: 'obtenerAbonosBD' });
                window.listaAbonosBase = Array.isArray(a) ? a : [];
            }
        } catch (e) { console.warn('[inf-impagas] carga:', e); }
        return datosListos();
    }

    // Facturas de reparación del mes (mes 1-12) que siguen sin pagar y sin anular
    function calcular(anio, mes) {
        const out = [];
        docsRep().forEach(d => {
            const num = String(d.numFactura || '').trim();
            if (!/\d{4}/.test(num)) return;                              // sin número de factura
            if (/^(NC|ANULADA)\b/i.test(num)) return;                    // nota de crédito / factura anulada
            if (String(d.numNC || '').trim()) return;                    // tiene nota de crédito
            if (/anulad|cancelad/i.test(String(d.estado || ''))) return; // estado anulado
            if (String(d.pagado || '').trim().toLowerCase() === 'pagado') return;
            if (clasificarDocumento(d) !== 'reparacion') return;         // abonos fuera

            const p = String(limpiarFecha(d.fecha)).split('/');
            if (p.length !== 3 || Number(p[1]) !== mes || Number(p[2]) !== anio) return;

            out.push({
                doc: d, num: num, fecha: p.join('/'),
                ts: new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime(),
                total: Number(d.total) || 0,
                cuit: String(d.cuit || '').trim(),
                cliente: String(d.cliente || '').trim()
            });
        });
        out.sort((a, b) => (a.ts - b.ts) || a.num.localeCompare(b.num));
        return out;
    }

    // ── Día de aviso ─────────────────────────────────────────────
    function diaDeAviso(f) {
        const d = new Date(f.getFullYear(), f.getMonth() + 1, 0);        // último día del mes
        if (AVISO_ULTIMO_HABIL) { while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); }
        return d.getDate();
    }
    function esDiaDeAviso(f) { return f.getDate() >= diaDeAviso(f); }

    function claveHoy(f) {
        return 'sf_impagas_aviso_' + f.getFullYear() + '-' + (f.getMonth() + 1) + '-' + f.getDate();
    }
    function yaAvisadoHoy(f) { try { return !!localStorage.getItem(claveHoy(f)); } catch (e) { return false; } }
    function marcarAvisadoHoy(f) { try { localStorage.setItem(claveHoy(f), '1'); } catch (e) {} }

    // ── Utilidades ───────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function money(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }

    function copiar(txt, btn) {
        const ok = () => {
            if (!btn) return;
            const o = btn.textContent; btn.textContent = '✅';
            setTimeout(() => { btn.textContent = o; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(ok).catch(() => {});
        } else {
            const ta = document.createElement('textarea');
            ta.value = txt; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); ok(); } catch (e) {}
            ta.remove();
        }
    }

    // ── Botón en la página ───────────────────────────────────────
    function insertarBoton() {
        if (document.getElementById('btn-impagas')) return;
        inyectarCSS();
        const btn = document.createElement('button');
        btn.id = 'btn-impagas';
        btn.className = 'btn-impagas-abrir';
        btn.onclick = function () { window.abrirImpagasInf(); };
        btn.innerHTML = '<span id="impagas-label">🧾 Reparaciones sin pagar del mes</span>'
                      + '<span class="iim-badge" id="impagas-badge" style="display:none;"></span>';

        const ancla = document.querySelector('.btn-clientes-abrir') || document.querySelector('.modo-tabs');
        if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(btn, ancla.nextSibling);
        else (document.querySelector('.inf-page') || document.body).prepend(btn);
    }

    function actualizarBoton(lista, hoy) {
        const btn = document.getElementById('btn-impagas');
        if (!btn) return;
        const badge = document.getElementById('impagas-badge');
        const label = document.getElementById('impagas-label');
        const n = lista ? lista.length : 0;
        const alerta = n > 0 && esDiaDeAviso(hoy);
        badge.style.display = n > 0 ? '' : 'none';
        badge.textContent = n;
        label.textContent = alerta ? '⚠️ Anular reparaciones sin pagar del mes' : '🧾 Reparaciones sin pagar del mes';
        btn.classList.toggle('alerta', alerta);
    }

    // ── Modal ────────────────────────────────────────────────────
    let _sel = { anio: 0, mes: 0 };

    function filaHTML(r, i) {
        const sinNombre = !r.cliente || /IMPORTADO|⚠/i.test(r.cliente);
        const nombre = sinNombre ? 'Sin nombre (importada de ARCA)' : r.cliente;
        return '<tr>'
            + '<td class="iim-n">' + (i + 1) + '</td>'
            + '<td><div class="iim-cli">' + esc(nombre) + '</div>'
            +     (r.cuit ? '<div class="iim-cuit">CUIT ' + esc(r.cuit) + '</div>' : '') + '</td>'
            + '<td class="iim-fact">' + esc(r.num) + ' <button class="iim-copy" title="Copiar N° de factura" data-v="' + esc(r.num)
            +     '" onclick="_iimCopiar(this)">📋</button></td>'
            + '<td style="white-space:nowrap;">' + esc(r.fecha) + '</td>'
            + '<td class="iim-tot">' + money(r.total) + '</td>'
            + '</tr>';
    }

    function pintarLista() {
        const cont = document.getElementById('iim-contenido');
        if (!cont) return;
        const lista = calcular(_sel.anio, _sel.mes);
        const total = lista.reduce((a, r) => a + r.total, 0);
        const titulo = MESES[_sel.mes - 1] + ' ' + _sel.anio;

        document.getElementById('iim-sub').textContent =
            titulo + ' · ' + lista.length + ' factura' + (lista.length === 1 ? '' : 's') + ' · ' + money(total);
        document.getElementById('iim-total').textContent = money(total);

        if (!lista.length) {
            cont.innerHTML = '<div class="iim-vacio">✅ No hay facturas de reparaciones sin pagar en ' + esc(titulo) + '.</div>';
            return;
        }
        cont.innerHTML = '<table class="iim-tabla"><thead><tr><th>#</th><th>CLIENTE</th><th>FACTURA</th><th>FECHA</th>'
            + '<th style="text-align:right">TOTAL</th></tr></thead><tbody>' + lista.map(filaHTML).join('') + '</tbody></table>';
    }

    window._iimCopiar = function (btn) { copiar(btn.getAttribute('data-v') || '', btn); };

    window._iimCambiarMes = function (valor) {            // valor = "YYYY-MM"
        const m = /^(\d{4})-(\d{2})$/.exec(valor || '');
        if (!m) return;
        _sel = { anio: Number(m[1]), mes: Number(m[2]) };
        pintarLista();
    };

    window._iimCopiarLista = function (btn) {
        const lista = calcular(_sel.anio, _sel.mes);
        const total = lista.reduce((a, r) => a + r.total, 0);
        const lineas = ['Reparaciones sin pagar — ' + MESES[_sel.mes - 1] + ' ' + _sel.anio + ' (' + lista.length + ')', ''];
        lista.forEach((r, i) => {
            const nombre = (!r.cliente || /IMPORTADO|⚠/i.test(r.cliente)) ? 'Sin nombre' + (r.cuit ? ' (CUIT ' + r.cuit + ')' : '') : r.cliente;
            lineas.push((i + 1) + '. ' + nombre + ' — ' + r.num + ' — ' + r.fecha + ' — ' + money(r.total));
        });
        lineas.push('', 'Total: ' + money(total));
        copiar(lineas.join('\n'), btn);
    };

    window.cerrarImpagasInf = function () {
        const m = document.getElementById('inf-modal-impagas');
        if (m) m.remove();
        document.removeEventListener('keydown', _esc);
    };
    function _esc(e) { if (e.key === 'Escape') window.cerrarImpagasInf(); }

    window.abrirImpagasInf = async function () {
        inyectarCSS();
        window.cerrarImpagasInf();

        const ok = await asegurarDatos();
        if (!ok) {
            const msg = 'Todavía no cargaron los datos de facturas. Esperá unos segundos y probá de nuevo.';
            if (typeof window.mostrarMensaje === 'function') window.mostrarMensaje(msg, 'error'); else alert(msg);
            return;
        }

        const hoy = new Date();
        _sel = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
        const valMes = _sel.anio + '-' + String(_sel.mes).padStart(2, '0');

        const modal = document.createElement('div');
        modal.id = 'inf-modal-impagas';
        modal.innerHTML =
            '<div class="iim-box">'
          +   '<div class="iim-head">'
          +     '<div><h3>🧾 Reparaciones sin pagar</h3><small id="iim-sub"></small></div>'
          +     '<button class="iim-x" onclick="cerrarImpagasInf()">✕</button>'
          +   '</div>'
          +   '<div class="iim-tools">'
          +     '<label for="iim-mes">Mes:</label>'
          +     '<input type="month" id="iim-mes" value="' + valMes + '" onchange="_iimCambiarMes(this.value)">'
          +     '<button class="iim-btn" style="margin-left:auto;" onclick="_iimCopiarLista(this)">📋 Copiar lista</button>'
          +   '</div>'
          +   '<div class="iim-aviso">Facturas de <b>reparaciones</b> del mes que siguen <b>sin pagar</b> y no están anuladas. '
          +     'Anulalas en ARCA con su nota de crédito y después tocá <b>🔄 Sincronizar con Base ARCA</b> '
          +     '(en Presupuestos → Ver Guardados): pasan a "Anulada" y salen de esta lista.</div>'
          +   '<div class="iim-scroll" id="iim-contenido"></div>'
          +   '<div class="iim-foot"><span>Total sin pagar: <strong id="iim-total"></strong></span>'
          +     '<button class="iim-btn" onclick="cerrarImpagasInf()">Cerrar</button></div>'
          + '</div>';
        modal.addEventListener('click', e => { if (e.target === modal) window.cerrarImpagasInf(); });
        document.body.appendChild(modal);
        document.addEventListener('keydown', _esc);
        pintarLista();
    };

    // ── Ciclo: actualiza el botón y avisa solo el día que corresponde ──
    function tick() {
        if (!document.getElementById('btn-impagas')) insertarBoton();
        if (!datosListos()) return;
        const hoy = new Date();
        const lista = calcular(hoy.getFullYear(), hoy.getMonth() + 1);
        actualizarBoton(lista, hoy);

        if (lista.length && esDiaDeAviso(hoy) && !yaAvisadoHoy(hoy) && !document.getElementById('inf-modal-impagas')) {
            marcarAvisadoHoy(hoy);
            window.abrirImpagasInf();
        }
    }

    function iniciar() {
        insertarBoton();
        tick();
        setInterval(tick, REFRESCO_MS);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();