// ============================================================
//  nav.js — Menú compartido de Support Fitness v2
//
//  FIXES:
//  1. Menú fijo en top:0 en todas las páginas (no se desplaza)
//  2. Navegación directa a la carpeta correcta desde cualquier página
//  3. Opción "Formulario" (página principal) visible en el menú
//  4. Routing directo: Tapizados→Tapizados/, Jefatura→Jefatura/, etc.
//  5. Dark mode sin flash (se aplica ANTES de renderizar)
// ============================================================

const NavBar = (() => {

    // ── Definición central de páginas ───────────────────────────────────────
    // Para agregar una página: agregala aquí, aparece en todos lados.
    const PAGINAS = [
        {
            id:        'formulario',
            label:     'Formulario',
            icono:     '📝',
            bnavIcono: '📝',
            bnavLabel: 'Registro',
            // Siempre apunta a la raíz
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

    // ── Detectar la raíz del proyecto automáticamente ──────────────────────
    // Funciona tanto en localhost como en GitHub Pages, Netlify, etc.
    let _raizCache = null;
    function _detectarRaiz() {
        if (_raizCache) return _raizCache;
        const ruta = window.location.pathname;
        // Buscar el nombre de carpeta conocida del proyecto
        // Si estamos en /www/Jefatura/index.html → raíz es /www/
        const carpetasConocidas = ['/Jefatura/', '/Tapizados/', '/Informes/', '/Institucional/'];
        for (const c of carpetasConocidas) {
            const idx = ruta.indexOf(c);
            if (idx !== -1) {
                _raizCache = ruta.substring(0, idx) + '/';
                return _raizCache;
            }
        }
        // Estamos en la raíz (index.html o similar)
        const sinArchivo = ruta.replace(/\/[^/]*$/, '');
        _raizCache = sinArchivo ? sinArchivo + '/' : '/';
        return _raizCache;
    }

    function _resolverRuta(rutaDesdeRaiz) {
        const raiz = _detectarRaiz();
        const ruta = rutaDesdeRaiz.replace(/^\//, '');
        // Si la raíz es '/', construir ruta absoluta correcta sin duplicar barras
        if (raiz === '/') return '/' + ruta;
        return raiz + ruta;
    }

    // ── Detectar página actual ─────────────────────────────────────────────
    function _detectarPaginaActual() {
        const ruta = window.location.pathname.toLowerCase();
        if (ruta.includes('/jefatura/'))     return 'jefatura';
        if (ruta.includes('/tapizados/'))    return 'tapizados';
        if (ruta.includes('/informes/'))     return 'informes';
        if (ruta.includes('/institucional/')) return 'institucional';
        return 'formulario'; // raíz = formulario
    }

    // ── Dark mode (SIN FLASH: se aplica antes de todo) ────────────────────
    function _aplicarDarkModeInmediato() {
        if (localStorage.getItem('darkMode') === 'yes') {
            document.documentElement.classList.add('dark-mode');
            document.body.classList.add('dark-mode');
        }
    }

    function toggleDarkMode(callbackExtra) {
        const activo = document.body.classList.toggle('dark-mode');
        document.documentElement.classList.toggle('dark-mode', activo);
        localStorage.setItem('darkMode', activo ? 'yes' : 'no');
        ['btn-dark-mobile', 'btn-dark-mode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = activo ? '☀️' : '🌙';
        });
        if (typeof callbackExtra === 'function') callbackExtra(activo);
    }

    // ── Navegación directa (sin pasar por index.html) ────────────────────
    function navegarA(paginaId) {
        const pagina = PAGINAS.find(p => p.id === paginaId);
        if (!pagina) return;
        
        const paginaActual = _detectarPaginaActual();

        // Si ya estamos en esa página, no hacemos nada
        if (paginaActual === paginaId) return;

        // Caso especial: formulario en index.html
        // Si ya estamos en index.html, llamar cerrarVistas() si existe
        if (paginaId === 'formulario' && paginaActual === 'formulario') {
            if (window.cerrarVistas) window.cerrarVistas();
            return;
        }

        // Navegar directamente a la URL absoluta
        window.location.href = pagina.urlAbsoluta();
    }

    // ── Inyectar TOP NAV ──────────────────────────────────────────────────
    function _inyectarTopNav(config) {
        const paginaActual = config.paginaActual || _detectarPaginaActual();
        const raiz = _detectarRaiz();

        // Botones de navegación (todos excepto el actual)
        const botonesHTML = PAGINAS.map(p => {
            const esActual = p.id === paginaActual;
            const style = esActual
                ? 'background:rgba(255,255,255,0.25); color:white; font-weight:900; border:1px solid rgba(255,255,255,0.5);'
                : '';
            return `<button class="btn-jefe" style="${style}" onclick="NavBar.navegarA('${p.id}')" title="${p.label}">
                        ${p.icono} ${p.label}
                    </button>`;
        }).join('');

        // Extras para index.html
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
        // FIX: posición fija siempre pegada al top
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

        // Insertar al principio del body
        document.body.insertBefore(nav, document.body.firstChild);

        // Asegurar padding-top para que el contenido no quede bajo el nav
        // (solo si body no lo tiene ya)
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
        // 1. Dark mode SIN flash (antes que nada)
        _aplicarDarkModeInmediato();

        // 2. Auto-detectar página actual si no se especifica
        if (!config.paginaActual) {
            config.paginaActual = _detectarPaginaActual();
        }

        // 3. Guardar callback de dark mode
        window._navDarkCallback = config.onDarkModeChange || null;

        // 4. Inyectar navs
        _inyectarTopNav(config);
        if (config.mostrarBottomNav !== false) {
            _inyectarBottomNav(config);
        }
    }

    function toggleDarkModePublico() {
        toggleDarkMode(window._navDarkCallback);
    }

    return {
        init,
        navegarA,
        toggleDarkMode: toggleDarkModePublico,
        detectarPaginaActual: _detectarPaginaActual,
        detectarRaiz: _detectarRaiz,
    };

})();

// Compatibilidad con código viejo que llama toggleDarkMode() directamente
function toggleDarkMode() {
    NavBar.toggleDarkMode();
}