// ── inf-ui.js — Interfaz, modales, notificaciones, modo app ────

function toggleBurbujaPrecios() {
    const burbuja = document.getElementById('burbuja-precios');
    const btn = document.getElementById('btn-ver-precios');
    if (!burbuja) return;

    if (burbuja.style.display === 'none') {
        // Construir el contenido
        renderizarBurbujaPrecios();
        burbuja.style.display = 'block';
        btn.innerText = '✖ Cerrar Lista';
        btn.style.background = '#fce8e6';
        btn.style.color = '#d93025';
    } else {
        burbuja.style.display = 'none';
        btn.innerText = '📋 Ver Lista de Precios';
        btn.style.background = '#e8f0fe';
        btn.style.color = '#1a73e8';
    }
}

function renderizarBurbujaPrecios() {
    const contenedor = document.getElementById('burbuja-precios-contenido');
    const labelDolar = document.getElementById('burbuja-dolar-label');
    const tituloBurbuja = document.getElementById('burbuja-titulo');
    if (!contenedor) return;

    const tasaDolar = valorDolarOficial;
    if (labelDolar) {
        labelDolar.innerText = modoApp === 'presupuestos'
            ? `💱 USD Oficial: $${tasaDolar.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
            : '';
    }
    if (tituloBurbuja) {
        tituloBurbuja.innerText = modoApp === 'ofertas' ? '🛠️ Precios de Mantenimiento' : '📋 Lista de Precios';
    }

    const precios = modoApp === 'presupuestos' ? PRECIOS_PRESUPUESTOS : PRECIOS_OFERTAS;

    let html = '';
    Object.entries(precios).forEach(([nombre, info]) => {
        const esUSD = info.moneda === 'USD';
        const precioARS = esUSD ? Math.round(info.precio * tasaDolar) : info.precio;
        const precioConIVA = Math.round(precioARS * 1.21);

        const badgeUSD = esUSD
            ? `<span class="precio-badge-usd">U$D ${info.precio}</span>`
            : `<span style="font-size:11px; color:var(--inf-muted);">ARS</span>`;

        html += `
        <div class="precio-row">
            <span class="precio-nombre">${nombre}</span>
            ${badgeUSD}
            <span class="precio-valor">$${precioARS.toLocaleString('es-AR')}</span>
            ${modoApp === 'presupuestos' ? `<span class="precio-iva">+IVA: $${precioConIVA.toLocaleString('es-AR')}</span>` : ''}
        </div>`;
    });

    if (modoApp === 'presupuestos') {
        html += `<div style="padding:10px 16px; font-size:11px; color:var(--inf-muted); text-align:center; font-style:italic; border-top:1px solid var(--inf-border);">
            Los precios en USD se calculan al tipo de cambio oficial del día.
        </div>`;
    }

    contenedor.innerHTML = html;
}

let cacheHistorial = [];
let fechaSeleccionadaOriginal = "";

async function cargarDatosBase() {
    try {
        cacheHistorial = await llamarAPI({ accion: "obtenerRegistroHistorico" });
        let setOfertas = new Set();
        let setPresup = new Set();
        
        cacheHistorial.forEach(visita => {
            let gymUpper = visita.gym.toUpperCase();
            setOfertas.add(gymUpper);
            let motivo = String(visita.motivos || visita.motivo || "").toLowerCase();
            if (motivo.includes("reparación") || motivo.includes("revision") || motivo.includes("rep")) {
                setPresup.add(gymUpper);
            }
        });

        globalGymsOfertas = Array.from(setOfertas);
        globalGymsPresupuestos = Array.from(setPresup);
    } catch (e) { console.error("Modo offline"); }
}

// 🔥 NUEVAS FUNCIONES PARA BURBUJAS Y DESGLOSE 🔥
function mostrarBurbujasFecha(gymNombre) {
    const contenedor = document.getElementById('contenedor-burbujas-fecha');
    const detalleDiv = document.getElementById('detalle-motivo-burbuja');
    
    if (contenedor) contenedor.innerHTML = "";
    if (detalleDiv) detalleDiv.style.display = "none";
    
    fechaSeleccionadaOriginal = "";

    if (modoApp !== 'presupuestos' || !gymNombre) return;

    const visitas = cacheHistorial.filter(v => v.gym.toUpperCase() === gymNombre.toUpperCase());

    visitas.forEach(v => {
        const span = document.createElement('span');
        span.style.cssText = "background:#e8f0fe; color:#1a73e8; padding:6px 12px; border-radius:20px; cursor:pointer; font-size:12px; font-weight:bold; border:1px solid #1a73e8; transition: 0.2s;";
        span.innerText = v.fechaStr;
        
        // Al hacer clic, le pasamos la visita y el propio elemento burbuja (this)
        span.onclick = function() { seleccionarVisitaParaPresupuesto(v, this); };
        
        contenedor.appendChild(span);
    });
}

function seleccionarVisitaParaPresupuesto(visita, spanElement) {
    fechaSeleccionadaOriginal = visita.fechaStr;

    // 1. Despintar todas las burbujas y pintar solo la seleccionada
    const burbujas = document.getElementById('contenedor-burbujas-fecha').children;
    for(let b of burbujas) {
        b.style.background = '#e8f0fe';
        b.style.color = '#1a73e8';
    }
    if(spanElement) {
        spanElement.style.background = '#1a73e8';
        spanElement.style.color = 'white';
    }

    // 2. Mostrar el detalle incrustado en la página (Chau alert!)
    const detalleDiv = document.getElementById('detalle-motivo-burbuja');
    if (detalleDiv) {
        // Cortamos el motivo por comas o signos de suma
        const lineas = visita.motivo.split(/[,+]+/).map(t => t.trim()).filter(t => t !== "");
        
        detalleDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                <b style="color:#1a73e8; font-size:14px;">📅 Detalle del ${visita.fechaStr}</b>
                <span style="cursor:pointer; color:#d93025; font-weight:bold; font-size:16px;" onclick="document.getElementById('detalle-motivo-burbuja').style.display='none'">✖</span>
            </div>
            <b style="color:#5f6368; font-size:12px;">🔧 Motivos registrados por el técnico:</b><br>
            <div style="margin-top:5px; padding-left:5px; color:#333; line-height:1.6;">• ` + lineas.join('<br>• ') + `</div>
        `;
        detalleDiv.style.display = "block";
    }
        // ... dentro de seleccionarVisitaParaPresupuesto ...
    detalleDiv.style.cssText = `
        display: block;
        margin-top: 15px;
        background: #ffffff;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #1a73e8;
        border-left: 6px solid #1a73e8;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-size: 14px;
    `;
}

// Función para el auto-formateo de la fecha (DD/MM/AAAA)
function formatearFechaManual(e) {
    let v = e.target.value.replace(/\D/g, ''); // Quitar lo que no sea número
    if (v.length > 8) v = v.slice(0,8);
    if (v.length >= 5) {
        e.target.value = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}`;
    } else if (v.length >= 3) {
        e.target.value = `${v.slice(0,2)}/${v.slice(2)}`;
    } else {
        e.target.value = v;
    }
}

function setModoApp(modo) {
    modoApp = modo;
    
    const msjInicial = document.getElementById('mensaje-inicial');
    if(msjInicial) msjInicial.style.display = 'none';
    const areaTrabajo = document.getElementById('area-trabajo');
    if(areaTrabajo) areaTrabajo.style.display = 'block';

    // Actualizar tabs con nueva clase
    ['ofertas','presupuestos','abonos'].forEach(m => {
        const btn = document.getElementById('btn-modo-' + m);
        if (!btn) return;
        btn.classList.toggle('activo', m === modo);
    });

    // Abonos: mostrar/ocultar sección
    const secAbonos = document.getElementById('seccion-abonos');
    if (secAbonos) secAbonos.style.display = modo === 'abonos' ? 'block' : 'none';
    if (areaTrabajo) areaTrabajo.style.display = modo === 'abonos' ? 'none' : 'block';
    if (msjInicial)  msjInicial.style.display  = modo === 'abonos' ? 'none' : 'none';

    if (modo === 'abonos') {
        const hoy = new Date();
        const mm  = String(hoy.getMonth() + 1).padStart(2,'0');
        const yyyy = String(hoy.getFullYear());
        const sel = document.getElementById('selector-mes-abono');
        if (sel && !sel.value) sel.value = `${yyyy}-${mm}`;
        cargarAbonos();
        return;
    }

    // Dólar: solo en presupuestos (los precios de ofertas son en ARS fijos)
    const domDolar = document.getElementById('valor-dolar');
    if (domDolar) domDolar.style.display = modo === 'presupuestos' ? 'inline-block' : 'none';

    // Botón lista precios: SIEMPRE visible (tanto en ofertas como presupuestos)
    const btnPrecios = document.getElementById('btn-ver-precios');
    if (btnPrecios) {
        btnPrecios.style.display = 'inline-block';
        const burbuja = document.getElementById('burbuja-precios');
        if (burbuja) burbuja.style.display = 'none';
        btnPrecios.innerText = modo === 'ofertas' ? '📋 Precios Mantenimiento' : '📋 Lista de Precios';
        btnPrecios.style.background = modo === 'ofertas' ? '#e6f4ea' : '#e8f0fe';
        btnPrecios.style.color      = modo === 'ofertas' ? '#0f9d58' : '#1a73e8';
    }

    // ARCA solo en presupuestos
    const arcaC = document.getElementById('arca-container');
    if (arcaC) arcaC.style.display = modo === 'presupuestos' ? 'block' : 'none';

    // Título y descripción de la sección guardados
    const tit = document.getElementById('titulo-guardados');
    const desc = document.getElementById('desc-guardados');
    const titForm = document.getElementById('titulo-form');
    if (modo === 'ofertas') {
        if (tit) tit.innerText = '📁 Ofertas Guardadas';
        if (desc) desc.innerText = 'Lista de ofertas de mantenimiento.';
        if (titForm) titForm.innerText = '🛠️ Nueva Oferta';
    } else {
        if (tit) tit.innerText = '📁 Presupuestos Guardados';
        if (desc) desc.innerText = 'Facturas y presupuestos en la nube.';
        if (titForm) titForm.innerText = '💰 Nuevo Presupuesto';
    }

    // Mostrar/ocultar campos según modo
    const contFecha = document.getElementById('container-fecha');
    const contFrec  = document.getElementById('container-frecuencia');
    if (contFecha) contFecha.style.display = modo === 'presupuestos' ? 'block' : 'none';
    if (contFrec)  contFrec.style.display  = modo === 'presupuestos' ? 'none'  : 'block';
    const labelGym = document.getElementById('label-gym');
    if (labelGym) labelGym.innerText = modo === 'presupuestos' ? 'Gimnasio / Cliente *' : 'Gimnasio *';

    // ── Auto-rellenar fecha con HOY si el campo está vacío ──────
    if (modo === 'presupuestos') {
        const inputFecha = document.getElementById('input-fecha-presup');
        if (inputFecha && !inputFecha.value.trim()) {
            const hoy = new Date();
            inputFecha.value = String(hoy.getDate()).padStart(2,'0') + '/' +
                               String(hoy.getMonth()+1).padStart(2,'0') + '/' +
                               hoy.getFullYear();
        }
    }

    switchTab('crear');
    // Limpiar form inline (limpiarFormulario no existe como función separada)
    const gymIn = document.getElementById('input-gym');
    if (gymIn) gymIn.value = '';
    const cuitIn = document.getElementById('input-cuit');
    if (cuitIn) cuitIn.value = '';
    const listaMaq = document.getElementById('lista-maquinas-dom');
    if (listaMaq) listaMaq.innerHTML = '';
    const burbs = document.getElementById('contenedor-burbujas-fecha');
    if (burbs) burbs.innerHTML = '';
    const detBurb = document.getElementById('detalle-motivo-burbuja');
    if (detBurb) detBurb.style.display = 'none';
    idEditando = null;
    agregarItem();
}

function switchTab(tab) {
    tabActivo = tab;
    const crear   = document.getElementById('seccion-crear');
    const creados = document.getElementById('seccion-creados');
    const arcaCont = document.getElementById('arca-container');
    const tabC = document.getElementById('tab-crear');
    const tabG = document.getElementById('tab-creados');

    if (tab === 'crear') {
        if (crear)   crear.style.display   = 'block';
        if (creados) creados.style.display  = 'none';
        if (tabC) { tabC.classList.add('activo'); }
        if (tabG) { tabG.classList.remove('activo'); }
        if (arcaCont) arcaCont.style.display = 'none';

        // Auto-rellenar fecha si es presupuesto y el campo está vacío
        if (modoApp === 'presupuestos') {
            const inp = document.getElementById('input-fecha-presup');
            if (inp && !inp.value.trim()) {
                const hoy = new Date();
                inp.value = String(hoy.getDate()).padStart(2,'0') + '/' +
                            String(hoy.getMonth()+1).padStart(2,'0') + '/' +
                            hoy.getFullYear();
            }
        }
    } else {
        if (crear)   crear.style.display   = 'none';
        if (creados) creados.style.display  = 'block';
        if (tabC) { tabC.classList.remove('activo'); }
        if (tabG) { tabG.classList.add('activo'); }
        if (arcaCont) arcaCont.style.display = modoApp === 'presupuestos' ? 'block' : 'none';
        obtenerYRenderizarCreados();
    }
}


// Recibe metros y terminales para el armado del HTML
function agregarItem(tipoBase = "", desc = "", cant = 1, precioForzado = null, metros = 1, terminales = 2) {
    const contenedor = document.getElementById('lista-maquinas-dom');
    const idUnico = Date.now() + Math.random(); 
    const dictPrecios = modoApp === 'ofertas' ? PRECIOS_OFERTAS : PRECIOS_PRESUPUESTOS;
    
    let opcionesHTML = "";
    for (const [nombre, data] of Object.entries(dictPrecios)) {
        let lblPrecio = `(${data.moneda === 'USD' ? 'U$D' : '$'} ${data.precio.toLocaleString('es-AR')})`;
        opcionesHTML += `<option value="${nombre}">${lblPrecio}</option>`;
    }

    const div = document.createElement('div');
    div.className = "maquina-item";
    div.style.cssText = "background: white; padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 4px solid #1a73e8; box-shadow: 0 1px 4px rgba(0,0,0,0.08);";
    div.id = `maq-${idUnico}`;
    
    let gridColumnas = modoApp === 'presupuestos' ? '1fr 1fr 1fr 1.2fr' : '1fr 1fr';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <h4 style="margin:0; color:#1a73e8;">Ítem</h4>
            <span style="color:#d93025; font-weight:bold; cursor:pointer;" onclick="eliminarMaquinaDOM('${div.id}')">✖ Quitar</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
            
            <div>
                <label style="font-size: 12px; font-weight: bold; color: #5f6368;">Detalle / Marca:</label>
                <input type="text" class="maq-desc" value="${desc}" placeholder="Ej: Cinta StarTrac / Pantalla..." style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc;">
            </div>

            <div>
                <label style="font-size: 12px; font-weight: bold; color: #5f6368;">Componente:</label>
                <input type="text" class="maq-tipo" list="dl-${idUnico}" value="${tipoBase}" placeholder="Buscá en la lista o escribí libremente..." style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc; font-weight:bold;" oninput="actualizarPrecioItem(this)">
                <datalist id="dl-${idUnico}">${opcionesHTML}</datalist>
            </div>
            
            <div class="cable-options" style="display:none; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; background: #f1f3f4; padding: 10px; border-radius: 6px; border-left: 3px solid #fbbc04;">
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Metros de Cable:</label>
                    <input type="number" class="maq-metros" value="${metros}" min="0.1" step="0.1" oninput="actualizarPrecioItem(this.closest('.maquina-item').querySelector('.maq-tipo'))" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Cant. Terminales:</label>
                    <input type="number" class="maq-terminales" value="${terminales}" min="0" oninput="actualizarPrecioItem(this.closest('.maquina-item').querySelector('.maq-tipo'))" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: ${gridColumnas}; gap: 10px; margin-top: 5px;">
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Cant:</label>
                    <input type="number" class="maq-cant" value="${cant}" min="1" oninput="calcularTotal()" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc; text-align:center;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color: #5f6368;">Unit. (ARS):</label>
                    <input type="number" class="maq-precio" placeholder="$" style="width:100%; padding:8px; border-radius:6px; border:1px solid #1a73e8; font-weight:bold;" oninput="calcularTotal()">
                </div>
                ${modoApp === 'presupuestos' ? `
                <div>
                    <label style="font-size: 11px; font-weight: bold; color:#d93025;">IVA 21%:</label>
                    <input type="text" class="maq-iva" disabled value="$0" style="width:100%; padding:8px; border-radius:6px; border:none; background:#fce8e6; color:#d93025; font-weight:bold;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: bold; color:#0f9d58;">P. Final:</label>
                    <input type="text" class="maq-final" disabled value="$0" style="width:100%; padding:8px; border-radius:6px; border:none; background:#e6f4ea; color:#0f9d58; font-weight:bold;">
                </div>
                ` : ''}
            </div>

            <!-- 🔥 PREVISUALIZACIÓN DE IMÁGENES DEL ÍTEM 🔥 -->
            <div style="margin-top:12px; border-top:1px dashed #e0e0e0; padding-top:10px;">
                <label style="font-size:11px; font-weight:800; color:#5f6368; text-transform:uppercase; letter-spacing:0.4px; cursor:pointer; display:flex; align-items:center; gap:6px;"
                       onclick="document.getElementById('img-input-${idUnico}').click()">
                    📎 Adjuntar foto del ítem (opcional)
                    <span style="background:#e8f0fe; color:#1a73e8; padding:2px 8px; border-radius:10px; font-size:11px;">+ Agregar</span>
                </label>
                <input type="file" id="img-input-${idUnico}" accept="image/*" multiple style="display:none;"
                       onchange="previewItemImages(this, 'img-preview-${idUnico}')">
                <div id="img-preview-${idUnico}" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
            </div>
        </div>
    `;
    
    contenedor.appendChild(div);
    
    if (precioForzado !== null) {
        div.querySelector('.maq-precio').value = precioForzado;
        actualizarPrecioItem(div.querySelector('.maq-tipo'), true);
    } else if (tipoBase !== "") {
        actualizarPrecioItem(div.querySelector('.maq-tipo'));
    }
}

// 🔥 PREVISUALIZACIÓN DE IMÁGENES EN ÍTEMS 🔥
function previewItemImages(inputEl, previewContainerId) {
    const container = document.getElementById(previewContainerId);
    if (!container) return;

    Array.from(inputEl.files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target.result;
            const thumb = document.createElement('div');
            thumb.className = 'foto-preview-thumb';
            thumb.innerHTML = `
                <img src="${url}" alt="${file.name}" title="${file.name}"
                     onclick="abrirPreviewImagen('${url}')">
                <button class="foto-remove" title="Quitar foto"
                        onclick="this.parentElement.remove()">✕</button>
            `;
            container.appendChild(thumb);
        };
        reader.readAsDataURL(file);
    });
    inputEl.value = ''; // Resetear para permitir re-selección
}

function abrirPreviewImagen(url) {
    const modal = document.getElementById('modal-img-preview');
    const img   = document.getElementById('modal-img-preview-src');
    if (modal && img) {
        img.src = url;
        modal.classList.add('open');
    } else if (window.mostrarPreviaImagen) {
        window.mostrarPreviaImagen(url);
    }
}

function actualizarPrecioItem(inputElement, skipPriceUpdate = false) {
    const item = inputElement.closest('.maquina-item');
    const tipo = inputElement.value.trim();
    const inputPrecio = item.querySelector('.maq-precio');
    const dictPrecios = modoApp === 'ofertas' ? PRECIOS_OFERTAS : PRECIOS_PRESUPUESTOS;
    
    const cableOptions = item.querySelector('.cable-options');
    let isCable = tipo.toLowerCase().includes('cable');
    cableOptions.style.display = isCable ? 'grid' : 'none';

    // 🔥 Usar siempre el dólar real — valorDolarOficial se actualiza automáticamente 🔥
    const tasaDolar = valorDolarOficial;

    if (dictPrecios[tipo] && !skipPriceUpdate) {
        const info = dictPrecios[tipo];
        
        if (isCable) {
            let mts = parseFloat(item.querySelector('.maq-metros').value) || 0;
            let terms = parseInt(item.querySelector('.maq-terminales').value) || 0;
            let costoMtsUSD = mts * info.precio;
            let costoTermsUSD = terms * 10;
            let totalUSD = costoMtsUSD + costoTermsUSD;
            inputPrecio.value = Math.round(totalUSD * tasaDolar);
            
            // Mostrar info del dólar en el item si es USD
            let infoDiv = item.querySelector('.info-usd');
            if (!infoDiv) {
                infoDiv = document.createElement('div');
                infoDiv.className = 'info-usd';
                infoDiv.style.cssText = 'font-size:11px; color:#0f9d58; background:#e6f4ea; padding:4px 8px; border-radius:4px; margin-top:4px; font-weight:bold;';
                inputPrecio.parentElement.appendChild(infoDiv);
            }
            infoDiv.innerText = `U$D ${totalUSD.toFixed(2)} × $${tasaDolar.toLocaleString('es-AR')} = $${Math.round(totalUSD * tasaDolar).toLocaleString('es-AR')}`;
        } else if (info.moneda === "USD") {
            let precioEnPesos = Math.round(info.precio * tasaDolar);
            inputPrecio.value = precioEnPesos;
            
            // Mostrar info del dólar
            let infoDiv = item.querySelector('.info-usd');
            if (!infoDiv) {
                infoDiv = document.createElement('div');
                infoDiv.className = 'info-usd';
                infoDiv.style.cssText = 'font-size:11px; color:#0f9d58; background:#e6f4ea; padding:4px 8px; border-radius:4px; margin-top:4px; font-weight:bold;';
                inputPrecio.parentElement.appendChild(infoDiv);
            }
            infoDiv.innerText = `U$D ${info.precio} × $${tasaDolar.toLocaleString('es-AR')} = $${precioEnPesos.toLocaleString('es-AR')}`;
        } else {
            inputPrecio.value = Math.round(info.precio);
            // Quitar info de dólar si no aplica
            let infoDiv = item.querySelector('.info-usd');
            if (infoDiv) infoDiv.remove();
        }
    } 
    
    calcularTotal();
}

function eliminarMaquinaDOM(idDiv) {
    document.getElementById(idDiv).remove();
    calcularTotal();
}

function calcularTotal() {
    let subtotal = 0;
    const items = document.querySelectorAll('.maquina-item');
    
    items.forEach(item => {
        const cant = parseInt(item.querySelector('.maq-cant').value) || 0;
        const precioUnitario = parseFloat(item.querySelector('.maq-precio').value) || 0;
        
        const subtotalItem = cant * precioUnitario;
        subtotal += subtotalItem;

        // Solo calcula y llena los campos de IVA si estamos en modo presupuestos
        if (modoApp === 'presupuestos') {
            const ivaItem = subtotalItem * 0.21;
            const totalConIva = subtotalItem + ivaItem;
            item.querySelector('.maq-iva').value = `$${Math.round(ivaItem).toLocaleString('es-AR')}`;
            item.querySelector('.maq-final').value = `$${Math.round(totalConIva).toLocaleString('es-AR')}`;
        }
    });

    let totalFinal = subtotal;
    
    // Matemática general de la caja de abajo
    if (modoApp === 'presupuestos') {
        const ivaTotal = subtotal * 0.21;
        totalFinal = subtotal + ivaTotal;
        document.getElementById('subtotal-precio').innerText = `$${Math.round(subtotal).toLocaleString('es-AR')}`;
        document.getElementById('iva-precio').innerText = `$${Math.round(ivaTotal).toLocaleString('es-AR')}`;
    }
    document.getElementById('input-total-manual').value = Math.round(totalFinal);
    return totalFinal;
}

function filtrarGimnasiosPersonalizado() {
    const input = document.getElementById('input-gym');
    const texto = input.value.toLowerCase();
    const sugerenciasBox = document.getElementById('sugerencias-gym');
    
    // Limpiamos lo anterior
    document.getElementById('contenedor-burbujas-fecha').innerHTML = '';
    document.getElementById('detalle-motivo-burbuja').style.display = 'none';

    if (!texto) {
        sugerenciasBox.style.display = 'none';
        return;
    }

    const listaUsar = modoApp === 'ofertas' ? globalGymsOfertas : globalGymsPresupuestos;
    const filtrados = listaUsar.filter(g => g.toLowerCase().includes(texto));

    sugerenciasBox.innerHTML = '';
    
    if (filtrados.length === 0) {
        sugerenciasBox.style.display = 'none';
        return;
    }

    filtrados.forEach(gym => {
        const div = document.createElement('div');
        div.style.cssText = "padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; color: #333; font-weight:bold; font-size: 15px;";
        div.innerText = gym;
        
        div.onclick = () => {
            input.value = gym;
            sugerenciasBox.style.display = 'none'; // Cerramos la lista
            
            // 🔥 IMPORTANTE: Forzamos que aparezcan las burbujas
            if (modoApp === 'presupuestos') {
                mostrarBurbujasFecha(gym);
            }
        };
        sugerenciasBox.appendChild(div);
    });

    sugerenciasBox.style.display = 'block';
}