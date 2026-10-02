// ══════════════════════════════════════════════════════════════════
//  inf-herramientas.js — Agrupa los botones secundarios de Informes
//  en un único panel plegable "🧰 Herramientas" (cerrado por defecto).
//
//  Agrupa (sin tocar su lógica, solo los reubica):
//    · 👥 Ver Clientes                 (.btn-clientes-abrir  · inf-clientes.js)
//    · 🧾 Reparaciones sin pagar       (#btn-impagas         · inf-impagas.js)
//    · 🔄 Sincronizar con Base ARCA    (.btn-arca            · solo Presupuestos > Ver Guardados)
//    · 🔎 Revisar notas de crédito     (.btn-ncr-abrir       · solo Presupuestos > Ver Guardados)
//
//  · Los botones de ARCA y notas de crédito se muestran únicamente cuando
//    corresponde (igual que antes), el resto siempre.
//  · Si hay reparaciones sin pagar, el botón Herramientas muestra el
//    contador (y pulsa en rojo el día de aviso) aunque esté cerrado.
//  · Usa las variables --inf-*, así respeta modo claro/oscuro.
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Orden en que aparecen dentro del panel
    const ITEMS = [
        { sel: '.btn-clientes-abrir', soloArca: false },
        { sel: '#btn-impagas',        soloArca: false },
        { sel: '.btn-arca',           soloArca: true  },
        { sel: '.btn-ncr-abrir',      soloArca: true  },
    ];

    function inyectarCSS() {
        if (document.getElementById('inf-herramientas-css')) return;
        const st = document.createElement('style');
        st.id = 'inf-herramientas-css';
        st.textContent = `
        #inf-tools { margin: -4px 0 16px; }
        .itl-toggle {
            width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 11px 16px; border-radius: 14px; cursor: pointer; font-family: inherit;
            font-weight: 800; font-size: 13px; text-align: left;
            background: var(--inf-card); color: var(--inf-text);
            border: 1px solid var(--inf-border); box-shadow: var(--inf-shadow);
            transition: background .2s, transform .2s;
        }
        .itl-toggle:hover { background: var(--inf-azul-lt); }
        .itl-toggle:active { transform: scale(.98); }
        .itl-left { display: flex; align-items: center; gap: 8px; }
        .itl-sub { font-weight: 600; font-size: 11px; color: var(--inf-sub); }
        .itl-flecha { color: var(--inf-sub); transition: transform .25s; font-size: 12px; }
        #inf-tools.abierto .itl-flecha { transform: rotate(180deg); }
        .itl-badge {
            background: #d93025; color: #fff; border-radius: 999px; padding: 1px 9px;
            font-size: 11px; font-weight: 900; display: none;
        }
        .itl-toggle.alerta { border-color: #d93025; background: rgba(217,48,37,.12); animation: itlPulso 2s infinite; }
        @keyframes itlPulso {
            0%,100% { box-shadow: 0 0 0 0 rgba(217,48,37,.35); }
            50%     { box-shadow: 0 0 0 6px rgba(217,48,37,0); }
        }

        .itl-grid { display: none; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        #inf-tools.abierto .itl-grid { display: grid; }

        /* Los botones originales se adaptan a la grilla compacta */
        .itl-grid > button {
            margin: 0 !important; width: 100% !important; min-height: 46px;
            padding: 8px 10px !important; border-radius: 12px !important;
            font-size: 12px !important; line-height: 1.25; text-align: center;
            display: flex !important; align-items: center; justify-content: center; gap: 6px;
        }
        .itl-grid > .itl-oculto { display: none !important; }

        @media (max-width: 380px) {
            .itl-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
            .itl-toggle.alerta { animation: none; }
        }`;
        document.head.appendChild(st);
    }

    let panel, toggle, grid, badge, sub;

    function crearPanel() {
        if (document.getElementById('inf-tools')) return true;
        const ancla = document.querySelector('.modo-tabs');
        if (!ancla || !ancla.parentNode) return false;

        inyectarCSS();
        panel = document.createElement('div');
        panel.id = 'inf-tools';
        panel.innerHTML =
            '<button type="button" class="itl-toggle" id="itl-toggle" aria-expanded="false">'
          +   '<span class="itl-left">🧰 Herramientas '
          +     '<span class="itl-sub">Clientes · Sin pagar · ARCA · Notas de crédito</span>'
          +     '<span class="itl-badge" id="itl-badge"></span></span>'
          +   '<span class="itl-flecha">▼</span>'
          + '</button>'
          + '<div class="itl-grid" id="itl-grid"></div>';

        ancla.parentNode.insertBefore(panel, ancla.nextSibling);

        toggle = panel.querySelector('#itl-toggle');
        grid   = panel.querySelector('#itl-grid');
        badge  = panel.querySelector('#itl-badge');
        sub    = panel.querySelector('.itl-sub');

        toggle.addEventListener('click', function () {
            const abierto = panel.classList.toggle('abierto');
            toggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        // Al usar una herramienta, el panel se vuelve a plegar solo
        grid.addEventListener('click', function (e) {
            if (e.target.closest('button')) setTimeout(cerrar, 150);
        });
        return true;
    }

    function cerrar() {
        if (!panel) return;
        panel.classList.remove('abierto');
        toggle.setAttribute('aria-expanded', 'false');
    }

    function sincronizar() {
        if (!crearPanel()) return;

        // 1) Mover los botones al panel (en orden)
        let movido = false;
        ITEMS.forEach(function (it) {
            const el = document.querySelector(it.sel);
            if (el && el.parentNode !== grid) { grid.appendChild(el); movido = true; }
        });
        if (movido) {
            ITEMS.forEach(function (it) {
                const el = grid.querySelector(it.sel);
                if (el) grid.appendChild(el);   // reordena
            });
        }

        // 2) ARCA y notas de crédito: solo si #arca-container está visible
        //    (lo controlan inf-ui.js / inf-reparaciones.js como siempre)
        const cont = document.getElementById('arca-container');
        const arcaVisible = !!(cont && cont.offsetParent !== null);
        let visibles = 0;
        ITEMS.forEach(function (it) {
            const el = grid.querySelector(it.sel);
            if (!el) return;
            const ocultar = it.soloArca && !arcaVisible;
            el.classList.toggle('itl-oculto', ocultar);
            if (!ocultar) visibles++;
        });

        // 3) Contador / alerta de "reparaciones sin pagar" visible aunque esté cerrado
        const bi = document.getElementById('impagas-badge');
        const bt = document.getElementById('btn-impagas');
        const n = (bi && bi.style.display !== 'none') ? (bi.textContent || '').trim() : '';
        badge.style.display = n ? 'inline-block' : 'none';
        badge.textContent = n;
        toggle.classList.toggle('alerta', !!(bt && bt.classList.contains('alerta')));
        sub.style.display = n ? 'none' : '';
    }

    function iniciar() {
        sincronizar();
        // Liviano: los otros scripts muestran/ocultan botones y cargan datos de forma asíncrona
        setInterval(sincronizar, 700);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();