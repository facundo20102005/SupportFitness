// ══════════════════════════════════════════════════════════════════
//  inf-clientes.js — Listado de clientes (hoja "Base Abonos") para Informes
//  Muestra: Orden · Cliente · Tipo · CUIT · Correo
//
//  · NO toca el backend: reutiliza window.listaAbonosBase (que ya carga
//    inf-api.js con la acción "obtenerAbonosBD"). Si todavía está vacía,
//    la pide una vez con window.llamarAPI.
//  · Autocontenido: inyecta su propio CSS y su propio modal.
//  · Usa las variables --inf-* de Informes, así respeta modo claro/oscuro.
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── CSS (se inyecta una sola vez) ─────────────────────────────
    function inyectarCSS() {
        if (document.getElementById('inf-clientes-css')) return;
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
            width: 100%; max-width: 900px; margin: auto; overflow: hidden;
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
        .icl-search { padding: 10px 16px; border-bottom: 1px solid var(--inf-border); }
        .icl-search input {
            width: 100%; box-sizing: border-box; padding: 10px 14px; border-radius: 10px; outline: none;
            border: 1.5px solid var(--inf-border); background: var(--inf-bg); color: var(--inf-text);
            font-size: 13px; font-family: inherit;
        }
        .icl-search input:focus { border-color: var(--inf-azul); }
        .icl-scroll { overflow: auto; max-height: 68vh; }
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
        .icl-foot {
            padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;
            gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--inf-border); font-size: 13px; color: var(--inf-sub);
        }
        .icl-cerrar {
            background: var(--inf-azul-lt); color: var(--inf-azul); border: none; padding: 8px 18px;
            border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 13px;
        }
        @media (max-width: 560px) {
            #inf-modal-clientes { padding: 8px; }
            .icl-tabla td, .icl-tabla th { padding: 8px 6px; }
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

    // Misma lógica que Jefatura: separa por "/" o "," y descarta lo que no sea mail
    function separarCorreos(raw) {
        raw = String(raw || '').trim();
        if (!raw) return [];
        let arr = raw.split(/[\/,]/)
            .map(e => e.replace(/\([^)]*\)/g, '').replace(/^[+\s]+/, '').trim())
            .filter(e => e.indexOf('@') > 0);
        if (!arr.length) arr = [raw];
        return arr;
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
        const q = norm(texto);
        const tbody = document.querySelector('#inf-tabla-clientes tbody');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
            tr.style.display = (!q || (tr.dataset.buscar || '').includes(q)) ? '' : 'none';
        });
    };

    window.cerrarClientesInf = function () {
        const m = document.getElementById('inf-modal-clientes');
        if (m) m.remove();
        document.removeEventListener('keydown', _escCerrar);
    };
    function _escCerrar(e) { if (e.key === 'Escape') window.cerrarClientesInf(); }

    // ── Obtener datos (reusa lo ya cargado; si no, pide una vez) ──
    async function obtenerClientes() {
        let lista = window.listaAbonosBase;
        if (Array.isArray(lista) && lista.length) return lista;
        if (typeof window.llamarAPI !== 'function') return [];
        const r = await window.llamarAPI({ accion: 'obtenerAbonosBD' });
        lista = Array.isArray(r) ? r : [];
        if (lista.length) window.listaAbonosBase = lista;
        return lista;
    }

    // ── Modal ─────────────────────────────────────────────────────
    function filaHTML(a, i) {
        const cuitRaw = String(a.cuit || '').trim();
        const cuitCelda = (cuitRaw && cuitRaw !== '—')
            ? '<div class="icl-copy-row"><span>' + esc(cuitRaw) + '</span>'
              + '<button class="icl-copy" data-v="' + esc(cuitRaw) + '" onclick="_iclCopiar(this,\'cuit\')" title="Copiar sin guiones">📋</button></div>'
            : '<span class="icl-vacio">—</span>';

        const mails = separarCorreos(a.correo);
        let mailCelda;
        if (mails.length) {
            const id = 'icl-mail-' + i;
            const label = mails.length > 1 ? '📧 Ver (' + mails.length + ')' : '📧 Ver';
            const lista = mails.map(m =>
                '<div class="icl-copy-row"><span>' + esc(m) + '</span>'
                + '<button class="icl-copy" data-v="' + esc(m) + '" onclick="_iclCopiar(this,\'mail\')" title="Copiar correo">📋</button></div>'
            ).join('');
            mailCelda = '<button class="icl-ver" onclick="_iclToggleMails(this,\'' + id + '\',\'' + label + '\')">' + label + '</button>'
                      + '<div class="icl-mails" id="' + id + '">' + lista + '</div>';
        } else {
            mailCelda = '<span class="icl-vacio">Sin correo</span>';
        }

        const buscar = norm([a.orden, a.gym, a.tipoFact, a.cuit, a.correo].join(' '));
        return '<tr data-buscar="' + esc(buscar) + '">'
            + '<td class="icl-orden">' + esc(a.orden) + '</td>'
            + '<td class="icl-gym">' + esc(a.gym || '—') + '</td>'
            + '<td class="icl-tipo">' + esc(a.tipoFact || '—') + '</td>'
            + '<td>' + cuitCelda + '</td>'
            + '<td>' + mailCelda + '</td>'
            + '</tr>';
    }

    window.abrirClientesInf = async function () {
        inyectarCSS();
        window.cerrarClientesInf();

        let lista = [];
        try { lista = await obtenerClientes(); } catch (e) { lista = []; }

        if (!lista.length) {
            if (typeof window.mostrarMensaje === 'function') {
                window.mostrarMensaje('No se pudo cargar la lista de clientes. Revisá la conexión.', 'error');
            } else {
                alert('No se pudo cargar la lista de clientes. Revisá la conexión.');
            }
            return;
        }

        // Ordenados por número de orden (el de la hoja)
        const ordenados = lista.slice().sort((x, y) => (Number(x.orden) || 0) - (Number(y.orden) || 0));

        const modal = document.createElement('div');
        modal.id = 'inf-modal-clientes';
        modal.innerHTML =
            '<div class="icl-box">'
          +   '<div class="icl-head">'
          +     '<div><h3>👥 Clientes · Base Abonos</h3><small>' + ordenados.length + ' clientes</small></div>'
          +     '<button class="icl-x" onclick="cerrarClientesInf()">✕</button>'
          +   '</div>'
          +   '<div class="icl-search"><input type="text" placeholder="🔍 Buscar por cliente, CUIT, correo u orden..." '
          +     'oninput="_iclFiltrar(this.value)" autocomplete="off"></div>'
          +   '<div class="icl-scroll"><table class="icl-tabla" id="inf-tabla-clientes">'
          +     '<thead><tr><th>#</th><th>CLIENTE</th><th style="text-align:center">TIPO</th><th>CUIT</th><th>CORREO</th></tr></thead>'
          +     '<tbody>' + ordenados.map(filaHTML).join('') + '</tbody>'
          +   '</table></div>'
          +   '<div class="icl-foot"><span>Tocá 📋 para copiar el CUIT (sin guiones) o el correo.</span>'
          +     '<button class="icl-cerrar" onclick="cerrarClientesInf()">Cerrar</button></div>'
          + '</div>';

        modal.addEventListener('click', e => { if (e.target === modal) window.cerrarClientesInf(); });
        document.body.appendChild(modal);
        document.addEventListener('keydown', _escCerrar);
        const inp = modal.querySelector('.icl-search input');
        if (inp && window.innerWidth > 700) inp.focus();
    };
})();