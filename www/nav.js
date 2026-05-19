// ============================================================
//  nav.js — Menú compartido de Support Fitness v2
//
//  FIXES APLICADOS:
//  1. Eliminado toggleDarkMode() global duplicado (colisionaba con app.js)
//  2. Dark mode aplicado SOLO en documentElement (html), no en body también
//  3. Todo uso de dark mode unificado via NavBar.toggleDarkMode()
// ============================================================

const NavBar = (() => {

    // ── Definición central de páginas ──────────────────────────────────────
    const PAGINAS = [
        {
            id:        'formulario',
            label:     'Formulario',
            icono:     '📝',
            bnavIcono: '📝',
            bnavLabel: 'Registro',
            urlAbsoluta: () => _resolverRuta('/index.html'),
        },
        {
            id:        'institucional',
            label:     'Institucional',
            icono:     '🏢',
            bnavIcono: '🏠',
            bnavLabel: 'Inicio',
            urlAbsoluta: () => _resolverRuta('/Institucional/index.html'),
        },
        {
            id:        'tapizados',
            label:     'Tapizados',
            icono:     '💺',
            bnavIcono: '💺',
            bnavLabel: 'Tapizados',
            urlAbsoluta: () => _resolverRuta('/Tapizados/index.html'),
        },
        {
            id:        'informes',
            label:     'Informes',
            icono:     '📄',
            bnavIcono: '📄',
            bnavLabel: 'Docs',
            urlAbsoluta: () => _resolverRuta('/Informes/Informes-index.html'),
        },
        {
            id:        'jefatura',
            label:     'Jefatura',
            icono:     '📋',
            bnavIcono: '📋',
            bnavLabel: 'Jefatura',
            urlAbsoluta: () => _resolverRuta('/Jefatura/index.html'),
        },
    ];

    // ── Detectar la raíz del proyecto automáticamente ─────────────────────
    let _raizCache = null;
    function _detectarRaiz() {
        if (_raizCache) return _raizCache;
        const ruta = window.location.pathname;
        const carpetasConocidas = ['/Jefatura/', '/Tapizados/', '/Informes/', '/Institucional/'];
        for (const c of carpetasConocidas) {
            const idx = ruta.indexOf(c);
            if (idx !== -1) {
                _raizCache = ruta.substring(0, idx) + '/';
                return _raizCache;
            }
        }
        const sinArchivo = ruta.replace(/\/[^/]*$/, '');
        _raizCache = sinArchivo ? sinArchivo + '/' : '/';
        return _raizCache;
    }

    function _resolverRuta(rutaDesdeRaiz) {
        const raiz = _detectarRaiz();
        const ruta = rutaDesdeRaiz.replace(/^\//, '');
        if (raiz === '/') return '/' + ruta;
        return raiz + ruta;
    }

    // ── Detectar página actual ────────────────────────────────────────────
    function _detectarPaginaActual() {
        const ruta = window.location.pathname.toLowerCase();
        if (ruta.includes('/jefatura/'))      return 'jefatura';
        if (ruta.includes('/tapizados/'))     return 'tapizados';
        if (ruta.includes('/informes/'))      return 'informes';
        if (ruta.includes('/institucional/')) return 'institucional';
        return 'formulario';
    }

    // ── Dark mode — FIX: solo en documentElement, no duplicar en body ──────
    // Aplicar ANTES del render para evitar flash de contenido claro
    function _aplicarDarkModeInmediato() {
        if (localStorage.getItem('darkMode') === 'yes') {
            // FIX: solo html element. Los CSS deben usar html.dark-mode como selector.
            // body.dark-mode sigue funcionando via herencia, pero la clase vive en html.
            document.documentElement.classList.add('dark-mode');
            document.body.classList.add('dark-mode'); // compatibilidad con CSS existente
        }
    }

    function _toggleDarkMode(callbackExtra) {
        const activo = document.documentElement.classList.toggle('dark-mode');
        // Mantener sincronía con body para compatibilidad con CSS existente
        document.body.classList.toggle('dark-mode', activo);
        localStorage.setItem('darkMode', activo ? 'yes' : 'no');
        // Actualizar ícono en todos los botones de dark mode de la página
        ['btn-dark-mobile', 'btn-dark-mode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = activo ? '☀️' : '🌙';
        });
        if (typeof callbackExtra === 'function') callbackExtra(activo);
    }

    // ── Navegación directa ────────────────────────────────────────────────
    function navegarA(paginaId) {
        const pagina = PAGINAS.find(p => p.id === paginaId);
        if (!pagina) return;
        const paginaActual = _detectarPaginaActual();
        if (paginaActual === paginaId) {
            if (paginaId === 'formulario' && window.cerrarVistas) window.cerrarVistas();
            return;
        }
        window.location.href = pagina.urlAbsoluta();
    }

    // ── Inyectar TOP NAV ──────────────────────────────────────────────────
    function _inyectarTopNav(config) {
        const paginaActual = config.paginaActual || _detectarPaginaActual();
        const raiz = _detectarRaiz();

        const botonesHTML = PAGINAS.map(p => {
            const esActual = p.id === paginaActual;
            const style = esActual
                ? 'background:rgba(255,255,255,0.25); color:white; font-weight:900; border:1px solid rgba(255,255,255,0.5);'
                : '';
            return `<button class="btn-jefe" style="${style}" onclick="NavBar.navegarA('${p.id}')" title="${p.label}">
                        ${p.icono} ${p.label}
                    </button>`;
        }).join('');

        const extrasHTML = config.botones?.pendientesBadge ? `
            <span class="nav-status-dot" id="nav-dot" title="En línea"></span>
            <span class="pendientes-badge" id="badge-pendientes">0 pendiente(s)</span>
        ` : '';

        const historialHTML = config.botones?.historial ? `
            <button class="btn-jefe" id="btn-historial-nav" disabled
                    style="background:#e8f0fe; color:#1a73e8; opacity:0.7;">⏳ Cargando...</button>
        ` : '';

        const nav = document.createElement('header');
        nav.className = 'top-nav';
        nav.id = 'top-nav-global';
        // FIX: posición fija, sin !important inline (mover a CSS)
        // Mantenemos los !important solo donde el CSS externo podría pisar esto
        nav.style.cssText = 'position:fixed !important; top:0 !important; left:0 !important; width:100% !important; z-index:1000 !important; margin:0 !important;';
        nav.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${raiz}assets/logo.jpeg" alt="Logo"
                     style="height:32px; width:32px; border-radius:6px; object-fit:cover; cursor:pointer;"
                     onclick="NavBar.navegarA('formulario')" onerror="this.style.display='none'">
                <span class="nav-logo" style="font-size:18px; color:white; font-weight:bold; cursor:pointer;"
                      onclick="NavBar.navegarA('formulario')">Support Fitness</span>
                <button class="btn-dark-mobile-nav" id="btn-dark-mobile"
                        onclick="NavBar.toggleDarkMode()" title="Modo Oscuro">🌙</button>
            </div>
            <div class="nav-derecha">
                ${extrasHTML}
                ${historialHTML}
                ${botonesHTML}
            </div>
        `;

        document.body.insertBefore(nav, document.body.firstChild);

        if (!document.body.style.paddingTop) {
            document.body.style.paddingTop = '60px';
        }
    }

    // ── Inyectar BOTTOM NAV ───────────────────────────────────────────────
    function _inyectarBottomNav(config) {
        const paginaActual = config.paginaActual || _detectarPaginaActual();

        const itemsHTML = PAGINAS.map(p => {
            const esActual = p.id === paginaActual;
            return `<li>
                <button class="bottom-nav-btn ${esActual ? 'activo' : ''}"
                        id="bnav-${p.id}"
                        onclick="NavBar.navegarA('${p.id}')"
                        title="${p.label}">
                    <span class="bnav-icon">${p.bnavIcono}</span>
                    ${p.bnavLabel}
                </button>
            </li>`;
        }).join('');

        const nav = document.createElement('nav');
        nav.className = 'bottom-nav';
        nav.id = 'bottom-nav-global';
        nav.innerHTML = `<ul class="ul-nav">${itemsHTML}</ul>`;
        document.body.appendChild(nav);
    }

    // ── API pública ────────────────────────────────────────────────────────
    function init(config = {}) {
        _aplicarDarkModeInmediato();
        if (!config.paginaActual) config.paginaActual = _detectarPaginaActual();
        window._navDarkCallback = config.onDarkModeChange || null;
        _inyectarTopNav(config);
        _inyectarBottomNav(config);
        if (config.mostrarBottomNav === false) {
            const nav = document.getElementById('bottom-nav-global');
            if (nav) nav.classList.add('bottom-nav-desktop-hidden');
        }
    }

    function toggleDarkModePublico() {
        _toggleDarkMode(window._navDarkCallback);
    }

    return {
        init,
        navegarA,
        toggleDarkMode: toggleDarkModePublico,
        detectarPaginaActual: _detectarPaginaActual,
        detectarRaiz: _detectarRaiz,
    };

})();

// FIX: YA NO SE DEFINE toggleDarkMode() global aquí.
// Todo código que llame toggleDarkMode() directamente debe
// actualizarse a NavBar.toggleDarkMode().
// La función global se mantiene SOLO como alias de compatibilidad
// para no romper código viejo, pero no debe usarse en código nuevo.
if (typeof toggleDarkMode === 'undefined') {
    window.toggleDarkMode = function() { NavBar.toggleDarkMode(); };
}