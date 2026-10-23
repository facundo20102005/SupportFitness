// ══════════════════════════════════════════════════════════════════
//  inf-clientes.js (v2) — Clientes para Informes
//
//  Pestañas:
//   · 👥 Abonados     → hoja "Base Abonos" (solo lectura, igual que antes)
//   · 🔧 No abonados  → hoja "No Abonados": se pueden AGREGAR, EDITAR
//                       (nombre, CUIT, correo) y ELIMINAR desde la página.
//                       También se pueden IMPORTAR desde las facturas de
//                       "Presupuestos de Reparacion" (los que no están en
//                       Base Abonos; los "⚠️ IMPORTADO ARCA" entran solo con CUIT).
//
//  Backend (Apps Script) — acciones que usa este archivo:
//    obtenerNoAbonadosBD   {}                                   → [{fila,gym,cuit,correo}]
//    guardarNoAbonado      {fila|null,gym,cuit,correo,
//                           gymAnterior,cuitAnterior,
//                           renombrarFacturas}                  → {fila,gym,cuit,correo,facturasActualizadas}
//    eliminarNoAbonado     {fila}                               → {ok:true}
//    obtenerCandidatosNoAbonados {}                             → [{gym,cuit,facturas,sinNombre}]
//    importarNoAbonados    {lista:[{gym,cuit,correo}]}          → {agregados, omitidos}
//
//  · Reutiliza window.listaAbonosBase y window.llamarAPI (inf-api.js).
//  · Autocontenido: inyecta su propio CSS y su propio modal.
//  · Usa las variables --inf-* de Informes (modo claro/oscuro).
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const HOJA_DOCS = 'Presupuestos de Reparacion';
    let tabActual = 'abonados';          // 'abonados' | 'noabonados'
    let textoBusqueda = '';
    let cargandoNA = false;
    let errorNA = '';

    window.listaNoAbonados = window.listaNoAbonados || null;   // null = todavía no cargada

    // ── CSS (se inyecta una sola vez) ─────────────────────────────
    function inyectarCSS() {
        if (document.getElementById('inf-clientes-css')) {
            document.getElementById('inf-clientes-css').remove();   // v2 reemplaza al CSS viejo
        }
        const st = document.createElement('style');
        st.id = 'inf-clientes-css';
        st.textContent = `
        .btn-clientes-abrir {
            width: 100%; margin: -4px 0 16px; padding: 12px; border-radius: 14px; cursor: pointer;
            font-weight: 800; font-size: 13px; font-family: inherit;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            background: var(--inf-card); color: var(--inf-azul);
            border: 1px solid var(--inf-border); box-shadow: var(--inf-shadow);
            transition: transform .2s, background .2s;
        }
        .btn-clientes-abrir:hover { background: var(--inf-azul-lt); transform: translateY(-1px); }
        .btn-clientes-abrir:active { transform: scale(.98); }

        #inf-modal-clientes {
            position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.65);
            display: flex; align-items: flex-start; justify-content: center;
            padding: 16px; overflow-y: auto; backdrop-filter: blur(4px);
        }
        .icl-box {
            background: var(--inf-card); color: var(--inf-text); border-radius: 18px;
            width: 100%; max-width: 960px; margin: auto; overflow: hidden;
            border: 1px solid var(--inf-border); box-shadow: 0 25px 60px rgba(0,0,0,.45);
        }
        .icl-head {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 16px 20px; background: linear-gradient(135deg,#1a73e8,#0d47a1); color: #fff;
        }
        .icl-head h3 { margin: 0; font-size: 17px; font-weight: 900; }
        .icl-head small { display: block; margin-top: 2px; font-size: 12px; opacity: .85; }
        .icl-x {
            background: rgba(255,255,255,.2); border: none; color: #fff; width: 34px; height: 34px;
            border-radius: 50%; font-size: 17px; font-weight: 900; cursor: pointer; flex-shrink: 0;
        }
        .icl-tabs { display: flex; gap: 6px; padding: 10px 16px 0; border-bottom: 1px solid var(--inf-border); }
        .icl-tab {
            flex: 1; padding: 10px 8px; border: none; border-radius: 10px 10px 0 0; cursor: pointer;
            font-family: inherit; font-weight: 800; font-size: 13px;
            background: transparent; color: var(--inf-sub); transition: background .2s, color .2s;
        }
        .icl-tab:hover { color: var(--inf-text); background: var(--inf-azul-lt); }
        .icl-tab.activo { background: var(--inf-azul); color: #fff; }
        .icl-search { padding: 10px 16px; border-bottom: 1px solid var(--inf-border); display: flex; gap: 8px; flex-wrap: wrap; }
        .icl-search input {
            flex: 1; min-width: 180px; box-sizing: border-box; padding: 10px 14px; border-radius: 10px; outline: none;
            border: 1.5px solid var(--inf-border); background: var(--inf-bg); color: var(--inf-text);
            font-size: 13px; font-family: inherit;
        }
        .icl-search input:focus { border-color: var(--inf-azul); }
        .icl-accion {
            padding: 9px 13px; border-radius: 10px; cursor: pointer; font-family: inherit;
            font-weight: 800; font-size: 12px; white-space: nowrap;
            border: 1.5px solid var(--inf-azul); background: var(--inf-azul-lt); color: var(--inf-azul);
        }
        .icl-accion.verde { border-color: #0f9d58; color: #0f9d58; background: rgba(15,157,88,.10); }
        .icl-accion:disabled { opacity: .5; cursor: default; }
        .icl-scroll { overflow: auto; max-height: 62vh; }
        .icl-tabla { width: 100%; border-collapse: collapse; font-family: inherit; }
        .icl-tabla th {
            position: sticky; top: 0; z-index: 2; background: var(--inf-card);
            padding: 10px; font-size: 11px; font-weight: 800; letter-spacing: .4px;
            color: var(--inf-sub); text-align: left; white-space: nowrap;
            border-bottom: 1px solid var(--inf-border);
        }
        .icl-tabla td { padding: 9px 10px; font-size: 12px; vertical-align: top; border-bottom: 1px solid var(--inf-border); }
        .icl-tabla tr:hover td { background: var(--inf-azul-lt); }
        .icl-orden { color: var(--inf-sub); font-weight: 800; }
        .icl-gym   { font-weight: 900; font-size: 13px; }
        .icl-tipo  { color: var(--inf-sub); font-weight: 700; text-align: center; }
        .icl-vacio { color: var(--inf-sub); opacity: .6; }
        .icl-copy-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
        .icl-copy-row span { color: var(--inf-sub); word-break: break-all; }
        .icl-copy {
            background: none; border: none; cursor: pointer; font-size: 13px; padding: 1px 3px;
            color: var(--inf-azul); flex-shrink: 0;
        }
        .icl-ver {
            background: var(--inf-azul-lt); color: var(--inf-azul); border: 1px solid rgba(26,115,232,.3);
            padding: 4px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;
        }
        .icl-mails { display: none; margin-top: 5px; }
        .icl-acc { white-space: nowrap; text-align: right; }
        .icl-btn-mini {
            border: 1px solid var(--inf-border); background: var(--inf-bg); color: var(--inf-text);
            border-radius: 8px; padding: 5px 9px; font-size: 12px; cursor: pointer; margin-left: 4px;
        }
        .icl-btn-mini:hover { border-color: var(--inf-azul); }
        .icl-btn-mini.rojo:hover { border-color: #d93025; }
        .icl-estado { padding: 28px 20px; text-align: center; color: var(--inf-sub); font-size: 13px; line-height: 1.5; }
        .icl-estado b { color: var(--inf-text); }
        .icl-msg { display: none; margin: 10px 16px 0; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; }
        .icl-msg.ok  { display: block; background: rgba(15,157,88,.14); color: #0f9d58; }
        .icl-msg.err { display: block; background: rgba(217,48,37,.14); color: #d93025; }
        .icl-foot {
            padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;
            gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--inf-border); font-size: 13px; color: var(--inf-sub);
        }
        .icl-cerrar {
            background: var(--inf-azul-lt); color: var(--inf-azul); border: none; padding: 8px 18px;
            border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 13px;
        }

        /* Formulario (agregar / editar) e importación: capa encima del listado */
        .icl-capa {
            position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.6);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .icl-form {
            background: var(--inf-card); color: var(--inf-text); width: 100%; max-width: 440px; max-height: 92vh; overflow-y: auto;
            border-radius: 16px; padding: 22px 20px; border: 1px solid var(--inf-border); box-shadow: 0 25px 60px rgba(0,0,0,.5);
        }
        .icl-form.ancho { max-width: 640px; }
        .icl-form h4 { margin: 0 0 14px; font-size: 16px; font-weight: 900; }
        .icl-form label { display: block; font-size: 11px; font-weight: 800; letter-spacing: .4px; color: var(--inf-sub); margin: 12px 0 5px; text-transform: uppercase; }
        .icl-form input[type=text], .icl-form textarea {
            width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; outline: none;
            border: 1.5px solid var(--inf-border); background: var(--inf-bg); color: var(--inf-text);
            font-size: 13px; font-family: inherit;
        }
        .icl-form input[type=text]:focus, .icl-form textarea:focus { border-color: var(--inf-azul); }
        .icl-form textarea { min-height: 64px; resize: vertical; }
        .icl-ayuda { font-size: 11px; color: var(--inf-sub); margin-top: 4px; }
        .icl-check { display: flex !important; align-items: flex-start; gap: 8px; text-transform: none !important; letter-spacing: 0 !important;
                     font-size: 12px !important; font-weight: 700 !important; color: var(--inf-text) !important; cursor: pointer; }
        .icl-check input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--inf-azul); }
        .icl-err { color: #d93025; font-size: 12px; font-weight: 700; margin-top: 10px; display: none; }
        .icl-form-btns { display: flex; gap: 10px; margin-top: 18px; }
        .icl-form-btns button { flex: 1; padding: 11px; border-radius: 10px; font-weight: 900; font-size: 13px; cursor: pointer; font-family: inherit; }
        .icl-b-cancel { background: transparent; color: var(--inf-sub); border: 1.5px solid var(--inf-border); }
        .icl-b-ok { background: var(--inf-azul); color: #fff; border: none; }
        .icl-b-ok:disabled { opacity: .55; cursor: default; }
        .icl-imp-lista { max-height: 46vh; overflow: auto; border: 1px solid var(--inf-border); border-radius: 10px; margin-top: 10px; }
        .icl-imp-fila { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--inf-border); font-size: 12px; }
        .icl-imp-fila:last-child { border-bottom: none; }
        .icl-imp-fila input { width: 16px; height: 16px; accent-color: var(--inf-azul); flex-shrink: 0; }
        .icl-imp-fila .n { font-weight: 800; flex: 1; min-width: 0; word-break: break-word; }
        .icl-imp-fila .c { color: var(--inf-sub); white-space: nowrap; }

        @media (max-width: 560px) {
            #inf-modal-clientes { padding: 8px; }
            .icl-tabla td, .icl-tabla th { padding: 8px 6px; }
            .icl-tab { font-size: 12px; }
        }`;
        document.head.appendChild(st);
    }

    // ── Utilidades ────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function norm(s) {
        return String(s || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    }
    function soloDigitos(s) { return String(s || '').replace(/\D/g, ''); }
    function formatearCuit(s) {
        const d = soloDigitos(s);
        return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : String(s || '').trim();
    }

    // Misma lógica que Jefatura: separa por "/" o "," y descarta lo que no sea mail
    function separarCorreos(raw) {
        raw = String(raw || '').trim();
        if (!raw) return [];
        let arr = raw.split(/[\/,;]/)
            .map(e => e.replace(/\([^)]*\)/g, '').replace(/^[+\s]+/, '').trim())
            .filter(e => e.indexOf('@') > 0);
        if (!arr.length) arr = [raw];
        return arr;
    }
    // Lo que escribe el usuario (separado por coma, ; , / o salto de línea) → "a@x.com / b@y.com"
    function normalizarCorreos(raw) {
        return String(raw || '').split(/[\n,;\/]+/).map(e => e.trim()).filter(Boolean).join(' / ');
    }
    function correoValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

    function mensaje(tipo, texto) {
        const el = document.getElementById('icl-msg');
        if (!el) return;
        el.className = 'icl-msg ' + (tipo === 'ok' ? 'ok' : tipo === 'err' ? 'err' : '');
        el.textContent = texto || '';
        clearTimeout(mensaje._t);
        if (texto) mensaje._t = setTimeout(() => { el.className = 'icl-msg'; el.textContent = ''; }, 4500);
    }

    // ── Copiar al portapapeles ───────────────────────────────────
    window._iclCopiar = function (btn, modo) {
        let txt = String(btn.getAttribute('data-v') || '');
        if (modo === 'cuit') txt = txt.replace(/[-\s\/+]/g, '').trim();   // solo dígitos
        const ok = () => {
            const orig = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = orig; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(ok).catch(() => {});
        } else {
            const ta = document.createElement('textarea');
            ta.value = txt; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); ok(); } catch (e) {}
            ta.remove();
        }
    };

    window._iclToggleMails = function (btn, id, label) {
        const el = document.getElementById(id);
        if (!el) return;
        const abierto = el.style.display === 'block';
        el.style.display = abierto ? 'none' : 'block';
        btn.textContent = abierto ? label : 'Ocultar';
    };

    window._iclFiltrar = function (texto) {
        textoBusqueda = norm(texto);
        const tbody = document.querySelector('#inf-tabla-clientes tbody');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
            tr.style.display = (!textoBusqueda || (tr.dataset.buscar || '').includes(textoBusqueda)) ? '' : 'none';
        });
    };

    window.cerrarClientesInf = function () {
        ['icl-capa', 'inf-modal-clientes'].forEach(id => { const m = document.getElementById(id); if (m) m.remove(); });
        document.removeEventListener('keydown', _escCerrar);
    };
    function _escCerrar(e) {
        if (e.key !== 'Escape') return;
        if (document.getElementById('icl-capa')) cerrarCapa();   // primero cierra el formulario
        else window.cerrarClientesInf();
    }
    function cerrarCapa() { const c = document.getElementById('icl-capa'); if (c) c.remove(); }

    // ── Datos ─────────────────────────────────────────────────────
    async function obtenerAbonados() {
        let lista = window.listaAbonosBase;
        if (Array.isArray(lista) && lista.length) return lista;
        if (typeof window.llamarAPI !== 'function') return [];
        const r = await window.llamarAPI({ accion: 'obtenerAbonosBD' });
        lista = Array.isArray(r) ? r : [];
        if (lista.length) window.listaAbonosBase = lista;
        return lista;
    }

    async function cargarNoAbonados(forzar) {
        if (!forzar && Array.isArray(window.listaNoAbonados)) return window.listaNoAbonados;
        cargandoNA = true; errorNA = '';
        try {
            const r = await window.llamarAPI({ accion: 'obtenerNoAbonadosBD' });
            window.listaNoAbonados = Array.isArray(r) ? r : [];
        } catch (e) {
            errorNA = e && e.message ? e.message : 'No se pudo cargar la lista.';
            if (!Array.isArray(window.listaNoAbonados)) window.listaNoAbonados = null;
        } finally { cargandoNA = false; }
        return window.listaNoAbonados || [];
    }

    function actualizarFacturasLocal(cuitDigitos, nombreNuevo) {
        // Refleja el cambio de nombre en lo ya cargado y limpia la caché local
        let tocadas = 0;
        const aplicar = lista => (lista || []).forEach(d => {
            if (soloDigitos(d.cuit) === cuitDigitos && d.cliente !== nombreNuevo) { d.cliente = nombreNuevo; tocadas++; }
        });
        aplicar(window.documentosGuardados);
        if (window._docsPorHoja) aplicar(window._docsPorHoja[HOJA_DOCS]);
        try {
            const dic = JSON.parse(localStorage.getItem('cuitGlobalDic') || '{}');
            Object.keys(dic).forEach(k => { if (soloDigitos(k) === cuitDigitos) dic[k] = nombreNuevo; });
            localStorage.setItem('cuitGlobalDic', JSON.stringify(dic));
            localStorage.removeItem('sf_inf_cache_docs_' + HOJA_DOCS);
        } catch (e) {}
        try {
            const cont = document.getElementById('contenedor-informes-creados');
            if (cont && cont.children.length && typeof window.renderizarTarjetas === 'function') window.renderizarTarjetas();
        } catch (e) {}
        return tocadas;
    }

    // ── Filas ─────────────────────────────────────────────────────
    function celdaCuit(cuitRaw) {
        cuitRaw = String(cuitRaw || '').trim();
        return (cuitRaw && cuitRaw !== '—')
            ? '<div class="icl-copy-row"><span>' + esc(cuitRaw) + '</span>'
              + '<button class="icl-copy" data-v="' + esc(cuitRaw) + '" onclick="_iclCopiar(this,\'cuit\')" title="Copiar sin guiones">📋</button></div>'
            : '<span class="icl-vacio">—</span>';
    }
    function celdaCorreo(correo, idBase) {
        const mails = separarCorreos(correo);
        if (!mails.length) return '<span class="icl-vacio">Sin correo</span>';
        const label = mails.length > 1 ? '📧 Ver (' + mails.length + ')' : '📧 Ver';
        const lista = mails.map(m =>
            '<div class="icl-copy-row"><span>' + esc(m) + '</span>'
            + '<button class="icl-copy" data-v="' + esc(m) + '" onclick="_iclCopiar(this,\'mail\')" title="Copiar correo">📋</button></div>'
        ).join('');
        return '<button class="icl-ver" onclick="_iclToggleMails(this,\'' + idBase + '\',\'' + label + '\')">' + label + '</button>'
             + '<div class="icl-mails" id="' + idBase + '">' + lista + '</div>';
    }

    function filaAbonado(a, i) {
        const buscar = norm([a.orden, a.gym, a.tipoFact, a.cuit, a.correo].join(' '));
        return '<tr data-buscar="' + esc(buscar) + '">'
            + '<td class="icl-orden">' + esc(a.orden) + '</td>'
            + '<td class="icl-gym">' + esc(a.gym || '—') + '</td>'
            + '<td class="icl-tipo">' + esc(a.tipoFact || '—') + '</td>'
            + '<td>' + celdaCuit(a.cuit) + '</td>'
            + '<td>' + celdaCorreo(a.correo, 'icl-mail-a' + i) + '</td>'
            + '</tr>';
    }

    function filaNoAbonado(a, i) {
        const buscar = norm([a.gym, a.cuit, a.correo].join(' '));
        return '<tr data-buscar="' + esc(buscar) + '">'
            + '<td class="icl-orden">' + (i + 1) + '</td>'
            + '<td class="icl-gym">' + esc(a.gym || '—') + '</td>'
            + '<td>' + celdaCuit(a.cuit) + '</td>'
            + '<td>' + celdaCorreo(a.correo, 'icl-mail-n' + i) + '</td>'
            + '<td class="icl-acc">'
            +   '<button class="icl-btn-mini" title="Editar" onclick="_iclEditar(' + Number(a.fila) + ')">✏️</button>'
            +   '<button class="icl-btn-mini rojo" title="Eliminar" onclick="_iclEliminar(' + Number(a.fila) + ')">🗑️</button>'
            + '</td></tr>';
    }

    // ── Contenido del modal según la pestaña ──────────────────────
    function pintarCuerpo() {
        const cont = document.getElementById('icl-cuerpo');
        if (!cont) return;
        const abonados = window.listaAbonosBase || [];
        const na = window.listaNoAbonados;

        // contadores en pestañas
        const tA = document.getElementById('icl-tab-abonados');
        const tN = document.getElementById('icl-tab-noabonados');
        if (tA) tA.textContent = '👥 Abonados (' + abonados.length + ')';
        if (tN) tN.textContent = '🔧 No abonados' + (Array.isArray(na) ? ' (' + na.length + ')' : '');
        if (tA) tA.classList.toggle('activo', tabActual === 'abonados');
        if (tN) tN.classList.toggle('activo', tabActual === 'noabonados');

        const sub = document.getElementById('icl-sub');
        const barra = document.getElementById('icl-barra-na');
        const pie = document.getElementById('icl-pie-txt');
        if (barra) barra.style.display = tabActual === 'noabonados' ? 'contents' : 'none';

        if (tabActual === 'abonados') {
            if (sub) sub.textContent = abonados.length + ' clientes · Base Abonos';
            if (pie) pie.textContent = 'Tocá 📋 para copiar el CUIT (sin guiones) o el correo.';
            const ordenados = abonados.slice().sort((x, y) => (Number(x.orden) || 0) - (Number(y.orden) || 0));
            cont.innerHTML = '<table class="icl-tabla" id="inf-tabla-clientes">'
                + '<thead><tr><th>#</th><th>CLIENTE</th><th style="text-align:center">TIPO</th><th>CUIT</th><th>CORREO</th></tr></thead>'
                + '<tbody>' + ordenados.map(filaAbonado).join('') + '</tbody></table>';
        } else {
            if (pie) pie.textContent = 'Los no abonados se guardan en la hoja "No Abonados". Tocá ✏️ para editar nombre, CUIT o correo.';
            if (cargandoNA && !Array.isArray(na)) {
                if (sub) sub.textContent = 'Cargando…';
                cont.innerHTML = '<div class="icl-estado">⏳ Cargando no abonados…</div>';
            } else if (!Array.isArray(na)) {
                if (sub) sub.textContent = 'No se pudo cargar';
                cont.innerHTML = '<div class="icl-estado"><b>No se pudo cargar la hoja "No Abonados".</b><br>' + esc(errorNA || 'Revisá la conexión.')
                    + '<br><br><button class="icl-accion" onclick="_iclReintentarNA()">🔄 Reintentar</button></div>';
            } else {
                if (sub) sub.textContent = na.length + ' clientes · No Abonados';
                if (!na.length) {
                    cont.innerHTML = '<div class="icl-estado"><b>Todavía no hay clientes no abonados.</b><br>'
                        + 'Podés traerlos automáticamente desde las facturas con <b>⬇️ Importar desde facturas</b> o cargarlos con <b>➕ Agregar</b>.</div>';
                } else {
                    cont.innerHTML = '<table class="icl-tabla" id="inf-tabla-clientes">'
                        + '<thead><tr><th>#</th><th>CLIENTE</th><th>CUIT</th><th>CORREO</th><th></th></tr></thead>'
                        + '<tbody>' + na.map(filaNoAbonado).join('') + '</tbody></table>';
                }
            }
        }
        window._iclFiltrar(document.getElementById('icl-buscar') ? document.getElementById('icl-buscar').value : '');
    }

    window._iclReintentarNA = async function () {
        await cargarNoAbonados(true);
        pintarCuerpo();
    };

    window._iclTab = async function (tab) {
        tabActual = tab;
        pintarCuerpo();
        if (tab === 'noabonados' && !Array.isArray(window.listaNoAbonados)) {
            pintarCuerpo();           // muestra "Cargando…"
            await cargarNoAbonados(false);
            pintarCuerpo();
        }
    };

    // ── Agregar / editar ──────────────────────────────────────────
    function abrirFormulario(item) {
        cerrarCapa();
        const esNuevo = !item;
        const it = item || { fila: null, gym: '', cuit: '', correo: '' };
        const capa = document.createElement('div');
        capa.id = 'icl-capa';
        capa.className = 'icl-capa';
        capa.innerHTML =
            '<div class="icl-form">'
          +   '<h4>' + (esNuevo ? '➕ Nuevo cliente no abonado' : '✏️ Editar cliente') + '</h4>'
          +   '<label>Nombre del gimnasio / cliente *</label>'
          +   '<input type="text" id="icl-f-gym" autocomplete="off" value="' + esc(it.gym) + '">'
          +   '<label>CUIT (vincula las facturas)</label>'
          +   '<input type="text" id="icl-f-cuit" autocomplete="off" inputmode="numeric" placeholder="XX-XXXXXXXX-X" value="' + esc(it.cuit) + '">'
          +   '<div class="icl-ayuda">Se usa para reconocer al cliente en las facturas.</div>'
          +   '<label>Correo(s)</label>'
          +   '<textarea id="icl-f-correo" placeholder="uno@mail.com, otro@mail.com">' + esc(it.correo) + '</textarea>'
          +   '<div class="icl-ayuda">Si hay más de uno, separalos con coma o salto de línea.</div>'
          +   (esNuevo ? '' :
                '<label class="icl-check"><input type="checkbox" id="icl-f-renombrar" checked>'
              + '<span>Si cambio el nombre o el CUIT, actualizarlo también en las facturas guardadas de este cliente</span></label>')
          +   '<div class="icl-err" id="icl-f-err"></div>'
          +   '<div class="icl-form-btns">'
          +     '<button class="icl-b-cancel" onclick="_iclCerrarCapa()">Cancelar</button>'
          +     '<button class="icl-b-ok" id="icl-f-ok" onclick="_iclGuardar(' + (esNuevo ? 'null' : Number(it.fila)) + ')">Guardar</button>'
          +   '</div>'
          + '</div>';
        capa.addEventListener('mousedown', e => { if (e.target === capa) cerrarCapa(); });
        document.body.appendChild(capa);
        setTimeout(() => { const i = document.getElementById('icl-f-gym'); if (i) i.focus(); }, 50);
    }
    window._iclCerrarCapa = cerrarCapa;
    window._iclAgregar = function () { abrirFormulario(null); };
    window._iclEditar = function (fila) {
        const it = (window.listaNoAbonados || []).find(x => Number(x.fila) === Number(fila));
        if (it) abrirFormulario(it);
    };

    window._iclGuardar = async function (fila) {
        const errEl = document.getElementById('icl-f-err');
        const btn = document.getElementById('icl-f-ok');
        const error = t => { errEl.textContent = t; errEl.style.display = 'block'; };
        errEl.style.display = 'none';

        const gym = document.getElementById('icl-f-gym').value.trim().replace(/\s+/g, ' ');
        const cuitIngresado = document.getElementById('icl-f-cuit').value.trim();
        const cuitDig = soloDigitos(cuitIngresado);
        const correo = normalizarCorreos(document.getElementById('icl-f-correo').value);
        const chk = document.getElementById('icl-f-renombrar');
        const renombrar = !!(chk && chk.checked);

        if (!gym) return error('Ingresá el nombre del cliente.');
        if (cuitIngresado && cuitDig.length !== 11) return error('El CUIT debe tener 11 dígitos (ej: 30-12345678-9).');
        const malos = separarCorreos(correo).filter(e => !correoValido(e));
        if (correo && malos.length) return error('Revisá el correo: "' + malos[0] + '" no parece válido.');

        // CUIT repetido en Base Abonos u otro no abonado
        if (cuitDig) {
            const enAbonos = (window.listaAbonosBase || []).find(a => soloDigitos(a.cuit) === cuitDig);
            if (enAbonos) return error('Ese CUIT ya está en Base Abonos (' + (enAbonos.gym || 'sin nombre') + '). Un cliente abonado no va en esta lista.');
            const otro = (window.listaNoAbonados || []).find(a => soloDigitos(a.cuit) === cuitDig && Number(a.fila) !== Number(fila));
            if (otro) return error('Ese CUIT ya lo tiene "' + (otro.gym || 'otro cliente') + '" en No abonados.');
        }

        const previo = fila ? (window.listaNoAbonados || []).find(a => Number(a.fila) === Number(fila)) : null;
        const cuitFinal = cuitDig ? formatearCuit(cuitDig) : '';

        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            const r = await window.llamarAPI({
                accion: 'guardarNoAbonado',
                payload: {
                    fila: fila || null, gym: gym, cuit: cuitFinal, correo: correo,
                    gymAnterior: previo ? previo.gym : '',
                    cuitAnterior: previo ? previo.cuit : '',
                    renombrarFacturas: renombrar,
                },
            });
            const guardado = {
                fila: (r && r.fila) || fila, gym: (r && r.gym) || gym,
                cuit: (r && r.cuit != null) ? r.cuit : cuitFinal, correo: (r && r.correo != null) ? r.correo : correo,
            };
            if (!Array.isArray(window.listaNoAbonados)) window.listaNoAbonados = [];
            const idx = window.listaNoAbonados.findIndex(a => Number(a.fila) === Number(guardado.fila));
            if (idx >= 0) window.listaNoAbonados[idx] = guardado; else window.listaNoAbonados.push(guardado);

            let extra = '';
            if (renombrar && cuitDig) {
                const n = (r && Number(r.facturasActualizadas)) || 0;
                actualizarFacturasLocal(cuitDig, guardado.gym);
                if (n) extra = ' · ' + n + ' factura' + (n > 1 ? 's' : '') + ' actualizada' + (n > 1 ? 's' : '');
            }
            cerrarCapa();
            pintarCuerpo();
            mensaje('ok', '✅ "' + guardado.gym + '" guardado' + extra);
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Guardar';
            error('No se pudo guardar: ' + (e && e.message ? e.message : 'error de conexión'));
        }
    };

    window._iclEliminar = function (fila) {
        const it = (window.listaNoAbonados || []).find(x => Number(x.fila) === Number(fila));
        if (!it) return;
        cerrarCapa();
        const capa = document.createElement('div');
        capa.id = 'icl-capa';
        capa.className = 'icl-capa';
        capa.innerHTML =
            '<div class="icl-form">'
          +   '<h4>🗑️ Eliminar cliente</h4>'
          +   '<div style="font-size:13px; line-height:1.5;">¿Eliminar a <b>' + esc(it.gym) + '</b> de la lista de no abonados?<br>'
          +   '<span class="icl-ayuda">Las facturas guardadas no se tocan.</span></div>'
          +   '<div class="icl-err" id="icl-f-err"></div>'
          +   '<div class="icl-form-btns">'
          +     '<button class="icl-b-cancel" onclick="_iclCerrarCapa()">Cancelar</button>'
          +     '<button class="icl-b-ok" id="icl-f-ok" style="background:#d93025;" onclick="_iclConfirmarEliminar(' + Number(fila) + ')">Eliminar</button>'
          +   '</div></div>';
        capa.addEventListener('mousedown', e => { if (e.target === capa) cerrarCapa(); });
        document.body.appendChild(capa);
    };

    window._iclConfirmarEliminar = async function (fila) {
        const btn = document.getElementById('icl-f-ok');
        const errEl = document.getElementById('icl-f-err');
        btn.disabled = true; btn.textContent = 'Eliminando…';
        try {
            await window.llamarAPI({ accion: 'eliminarNoAbonado', payload: { fila: fila } });
            // Al borrar una fila de la hoja, las de abajo suben: se recarga para no desfasar los números de fila
            await cargarNoAbonados(true);
            cerrarCapa();
            pintarCuerpo();
            mensaje('ok', '🗑️ Cliente eliminado');
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Eliminar';
            errEl.textContent = 'No se pudo eliminar: ' + (e && e.message ? e.message : 'error de conexión');
            errEl.style.display = 'block';
        }
    };

    // ── Importar desde facturas ───────────────────────────────────
    // El backend lee la hoja "Presupuestos de Reparacion" y devuelve los clientes que NO están en
    // Base Abonos ni en No Abonados. Las facturas "⚠️ IMPORTADO ARCA" vienen solo con su CUIT.
    window._iclImportar = async function () {
        if (!Array.isArray(window.listaNoAbonados)) { mensaje('err', 'Esperá a que cargue la lista de no abonados.'); return; }
        mensaje('ok', '⏳ Buscando clientes en las facturas…');
        let cand;
        try {
            cand = await window.llamarAPI({ accion: 'obtenerCandidatosNoAbonados' }, 40000);
        } catch (e) {
            mensaje('err', 'No se pudieron leer las facturas: ' + (e && e.message ? e.message : 'error de conexión'));
            return;
        }
        if (!Array.isArray(cand) || !cand.length) {
            mensaje('ok', '✅ No hay clientes nuevos para importar: todos los de las facturas ya están en Abonados o No abonados.');
            return;
        }
        mensaje('', '');

        cerrarCapa();
        const capa = document.createElement('div');
        capa.id = 'icl-capa';
        capa.className = 'icl-capa';
        window._iclCand = cand;
        const nSin = cand.filter(c => c.sinNombre).length;
        capa.innerHTML =
            '<div class="icl-form ancho">'
          +   '<h4>⬇️ Importar desde facturas</h4>'
          +   '<div style="font-size:12px; color:var(--inf-sub); line-height:1.5;">Clientes de <b>Presupuestos de Reparacion</b> que no están en Base Abonos ni en No abonados. '
          +   'Destildá los que no quieras sumar.'
          +   (nSin ? ' Los <b>⚠️ SIN NOMBRE</b> (' + nSin + ') son facturas importadas de ARCA: se cargan solo con el CUIT para que les pongas el nombre con ✏️.' : '')
          +   '</div>'
          +   '<div class="icl-imp-lista">'
          +     cand.map((c, i) =>
                  '<label class="icl-imp-fila" style="text-transform:none;letter-spacing:0;margin:0;cursor:pointer;">'
                + '<input type="checkbox" checked data-i="' + i + '">'
                + '<span class="n">' + esc(c.gym) + '</span>'
                + '<span class="c">' + (c.cuit ? esc(c.cuit) : 'sin CUIT') + ' · ' + c.facturas + ' fact.</span></label>').join('')
          +   '</div>'
          +   '<div class="icl-err" id="icl-f-err"></div>'
          +   '<div class="icl-form-btns">'
          +     '<button class="icl-b-cancel" onclick="_iclCerrarCapa()">Cancelar</button>'
          +     '<button class="icl-b-ok" id="icl-f-ok" onclick="_iclConfirmarImportar()">Importar ' + cand.length + '</button>'
          +   '</div></div>';
        capa.addEventListener('mousedown', e => { if (e.target === capa) cerrarCapa(); });
        capa.addEventListener('change', () => {
            const n = capa.querySelectorAll('input[data-i]:checked').length;
            const b = document.getElementById('icl-f-ok');
            if (b) { b.textContent = 'Importar ' + n; b.disabled = n === 0; }
        });
        document.body.appendChild(capa);
    };

    window._iclConfirmarImportar = async function () {
        const capa = document.getElementById('icl-capa');
        const btn = document.getElementById('icl-f-ok');
        const errEl = document.getElementById('icl-f-err');
        const elegidos = Array.from(capa.querySelectorAll('input[data-i]:checked')).map(i => window._iclCand[Number(i.dataset.i)]);
        if (!elegidos.length) return;
        btn.disabled = true; btn.textContent = 'Importando…';
        try {
            await window.llamarAPI({
                accion: 'importarNoAbonados',
                payload: { lista: elegidos.map(c => ({ gym: c.sinNombre ? '' : c.gym, cuit: c.cuit, correo: '' })) },
            }, 60000);
            await cargarNoAbonados(true);   // recarga con los números de fila reales
            cerrarCapa();
            pintarCuerpo();
            mensaje('ok', '✅ ' + elegidos.length + ' cliente' + (elegidos.length > 1 ? 's' : '') + ' importado' + (elegidos.length > 1 ? 's' : ''));
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Importar ' + elegidos.length;
            errEl.textContent = 'No se pudo importar: ' + (e && e.message ? e.message : 'error de conexión');
            errEl.style.display = 'block';
        }
    };

    // ── Apertura del modal ────────────────────────────────────────
    window.abrirClientesInf = async function (tabInicial) {
        inyectarCSS();
        window.cerrarClientesInf();
        tabActual = tabInicial === 'noabonados' ? 'noabonados' : 'abonados';
        textoBusqueda = '';

        let lista = [];
        try { lista = await obtenerAbonados(); } catch (e) { lista = []; }

        if (!lista.length) {
            const msg = 'No se pudo cargar la lista de clientes. Revisá la conexión.';
            if (typeof window.mostrarMensaje === 'function') window.mostrarMensaje(msg, 'error'); else alert(msg);
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'inf-modal-clientes';
        modal.innerHTML =
            '<div class="icl-box">'
          +   '<div class="icl-head">'
          +     '<div><h3>👥 Clientes</h3><small id="icl-sub"></small></div>'
          +     '<button class="icl-x" onclick="cerrarClientesInf()">✕</button>'
          +   '</div>'
          +   '<div class="icl-tabs">'
          +     '<button class="icl-tab" id="icl-tab-abonados" onclick="_iclTab(\'abonados\')">👥 Abonados</button>'
          +     '<button class="icl-tab" id="icl-tab-noabonados" onclick="_iclTab(\'noabonados\')">🔧 No abonados</button>'
          +   '</div>'
          +   '<div class="icl-search">'
          +     '<input type="text" id="icl-buscar" placeholder="🔍 Buscar por cliente, CUIT o correo..." oninput="_iclFiltrar(this.value)" autocomplete="off">'
          +     '<span id="icl-barra-na" style="display:none; gap:8px;">'
          +       '<button class="icl-accion verde" onclick="_iclAgregar()">➕ Agregar</button>'
          +       '<button class="icl-accion" onclick="_iclImportar()">⬇️ Importar desde facturas</button>'
          +     '</span>'
          +   '</div>'
          +   '<div class="icl-msg" id="icl-msg"></div>'
          +   '<div class="icl-scroll" id="icl-cuerpo"></div>'
          +   '<div class="icl-foot"><span id="icl-pie-txt"></span>'
          +     '<button class="icl-cerrar" onclick="cerrarClientesInf()">Cerrar</button></div>'
          + '</div>';

        modal.addEventListener('mousedown', e => { if (e.target === modal) window.cerrarClientesInf(); });
        document.body.appendChild(modal);
        document.addEventListener('keydown', _escCerrar);

        // El contenedor de botones usa flex solo cuando está visible
        const barra = document.getElementById('icl-barra-na');
        if (barra) barra.style.display = 'none';

        pintarCuerpo();
        if (tabActual === 'noabonados' && !Array.isArray(window.listaNoAbonados)) {
            await cargarNoAbonados(false);
            pintarCuerpo();
        } else if (!Array.isArray(window.listaNoAbonados)) {
            // precarga silenciosa para que la pestaña abra al instante
            cargarNoAbonados(false).then(() => { if (document.getElementById('icl-cuerpo')) pintarCuerpo(); });
        }
        const inp = document.getElementById('icl-buscar');
        if (inp && window.innerWidth > 700) inp.focus();
    };
})();