// ── inf-nc.js — Revisar / corregir notas de crédito ──────────────
// Cargar DESPUÉS de inf-docs.js. Usa window.llamarAPI y obtenerYRenderizarCreados.
(function () {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = (n) => '$' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    function cerrar() { const o = $('#_nc-modal'); if (o) o.remove(); }

    function tarjetaNC(p, idx) {
        const cands = p.candidatas.map((c, i) => {
            const marcada = c.vinculada || (!p.vinculada && p.candidatas.length === 1);
            return `
            <label style="display:flex; gap:10px; align-items:flex-start; padding:10px 12px; margin-top:6px; border-radius:10px;
                          border:1.5px solid ${c.vinculada ? '#f87171' : 'rgba(255,255,255,0.12)'}; cursor:pointer; background:rgba(255,255,255,0.03);">
                <input type="radio" name="nc-${idx}" value="${esc(c.nro)}" ${marcada ? 'checked' : ''} style="margin-top:3px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:900; color:#e2e8f0; font-size:14px;">Factura ${esc(c.nro)}
                        ${c.vinculada ? '<span style="font-size:10px; color:#f87171; font-weight:800; margin-left:6px;">ANULADA HOY POR ESTA NC</span>' : ''}</div>
                    <div style="font-size:12px; color:#94a3b8;">${esc(c.fecha)} · ${money(c.importe)}${c.cliente ? ' · ' + esc(c.cliente) : ''}</div>
                    ${c.enSistema ? '' : '<div style="font-size:11px; color:#fdba74; font-weight:700;">⚠️ Todavía no está en la hoja — sincronizá con ARCA primero</div>'}
                </div>
            </label>`;
        }).join('');

        const aviso = p.aproximado
            ? '<div style="font-size:11px; color:#fdba74; font-weight:700; margin-top:6px;">No hay una factura con el mismo importe. Estas son las últimas del mismo CUIT (¿nota de crédito parcial?).</div>'
            : (p.vinculada ? '<div style="font-size:11px; color:#94a3b8; margin-top:6px;">Hay más de una factura posible. Confirmá cuál es la que corresponde.</div>'
                           : '<div style="font-size:11px; color:#94a3b8; margin-top:6px;">Esta nota de crédito todavía no anuló ninguna factura.</div>');

        return `
        <div id="nc-card-${idx}" style="background:#1e293b; border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:14px; margin-bottom:12px;">
            <div style="font-weight:900; font-size:15px; color:#e2e8f0;">🔄 ${esc(p.nc)}</div>
            <div style="font-size:12px; color:#94a3b8;">${esc(p.fecha)} · ${money(p.importe)} · CUIT ${esc(p.cuit)}</div>
            ${aviso}
            ${cands}
            <button data-idx="${idx}" class="_nc-aplicar"
                    style="margin-top:10px; width:100%; padding:10px; border:none; border-radius:10px; background:#1a73e8; color:white; font-weight:900; font-size:13px; cursor:pointer;">
                ✔ Anular la factura seleccionada
            </button>
            <div id="nc-res-${idx}" style="font-size:12px; font-weight:800; margin-top:8px;"></div>
        </div>`;
    }

    async function aplicar(p, idx) {
        const card = $('#nc-card-' + idx);
        const sel  = card && card.querySelector('input[type=radio]:checked');
        const res  = $('#nc-res-' + idx);
        if (!sel) { res.style.color = '#fdba74'; res.textContent = 'Elegí una factura.'; return; }
        const btn = card.querySelector('._nc-aplicar');
        btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '⏳ Aplicando...';
        try {
            const r = await window.llamarAPI({ accion: 'aplicarAnulacionNC', payload: { nc: p.nc, factura: sel.value } });
            if (r && r.ok) {
                card.style.opacity = '.55';
                card.querySelectorAll('input').forEach(i => i.disabled = true);
                btn.remove();
                res.style.color = '#4ade80'; res.textContent = '✅ ' + (r.mensaje || 'Listo');
                window._ncCambios = true;
            } else {
                btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✔ Anular la factura seleccionada';
                res.style.color = '#f87171'; res.textContent = '❌ ' + ((r && r.error) || 'No se pudo aplicar');
            }
        } catch (e) {
            btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✔ Anular la factura seleccionada';
            res.style.color = '#f87171'; res.textContent = '❌ ' + (e.message || e);
        }
    }

    async function abrirRevisionNC() {
        cerrar();
        window._ncCambios = false;
        const ov = document.createElement('div');
        ov.id = '_nc-modal';
        ov.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; padding:12px;';
        ov.innerHTML = `
            <div style="background:#0f172a; border-radius:14px; width:100%; max-width:560px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; align-items:center; padding:12px 14px; background:#1e293b;">
                    <div style="flex:1; font-weight:900; font-size:15px; color:#e2e8f0;">🔄 Revisar notas de crédito</div>
                    <button id="_nc-cerrar" style="padding:7px 12px; border:none; border-radius:8px; background:#d93025; color:white; font-weight:900; font-size:12px; cursor:pointer;">✕ Cerrar</button>
                </div>
                <div id="_nc-cuerpo" style="padding:14px; overflow-y:auto;">
                    <div style="text-align:center; color:#94a3b8; padding:24px;">⏳ Analizando notas de crédito...</div>
                </div>
            </div>`;
        document.body.appendChild(ov);

        const salir = () => {
            cerrar();
            if (window._ncCambios && typeof window.obtenerYRenderizarCreados === 'function') window.obtenerYRenderizarCreados(true);
        };
        $('#_nc-cerrar', ov).onclick = salir;
        ov.addEventListener('click', (e) => { if (e.target === ov) salir(); });

        const cuerpo = $('#_nc-cuerpo', ov);
        try {
            const r = await window.llamarAPI({ accion: 'obtenerNCParaRevisar' }, 30000);
            if (!r || !r.ok) { cuerpo.innerHTML = `<div style="color:#f87171; font-weight:800;">❌ ${esc((r && r.error) || 'No se pudo analizar')}</div>`; return; }
            if (!r.pendientes.length) {
                cuerpo.innerHTML = '<div style="text-align:center; padding:28px; color:#4ade80; font-weight:900;">✅ No hay notas de crédito para revisar.</div>';
                return;
            }
            cuerpo.innerHTML = r.pendientes.map(tarjetaNC).join('');
            cuerpo.querySelectorAll('._nc-aplicar').forEach((b) => {
                const idx = Number(b.dataset.idx);
                b.onclick = () => aplicar(r.pendientes[idx], idx);
            });
        } catch (e) {
            cuerpo.innerHTML = `<div style="color:#f87171; font-weight:800;">❌ ${esc(e.message || e)}</div>`;
        }
    }

    window.abrirRevisionNC = abrirRevisionNC;
})();