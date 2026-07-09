// =========================================================
// APP.JS - LÓGICA DEL E-COMMERCE E INSTITUCIONAL
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec"; 

let valorDolarOficial = 1000; 
let productosGlobales = [];
let carrito = []; 
const IVA = 1.21; 

// =========================================================
// 1. INICIALIZACIÓN GLOBAL (Al cargar la página)
// =========================================================
document.addEventListener("DOMContentLoaded", async () => {
    // A. Inicializar E-commerce
    cargarCarritoDesdeStorage();
    await obtenerDolar();
    await obtenerProductosAPI();

    // B. Inicializar Animaciones del DOM (Movidas desde el HTML)
    const header = document.getElementById('site-header');
    const onScroll = function() {
        if(!header) return;
        header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();

    const revealables = document.querySelectorAll('.reveal');
    if('IntersectionObserver' in window && revealables.length) {
        const io = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if(entry.isIntersecting){
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: .15 });
        revealables.forEach(function(el){ io.observe(el); });
    } else {
        revealables.forEach(function(el){ el.classList.add('is-visible'); });
    }

    // C. Listener del Formulario de Contacto (Formspree)
    const formContacto = document.getElementById('form-contacto');
    if (formContacto) {
        formContacto.addEventListener('submit', async function(e) {
            e.preventDefault();
            const status = document.getElementById('status-contacto');
            const btn = formContacto.querySelector('button[type="submit"]');
            const originalText = btn.innerText;
            
            btn.innerText = 'Enviando... ⏳';
            btn.disabled = true;
            status.classList.add('d-none');
            status.classList.remove('alert-success', 'alert-danger');

            try {
                const response = await fetch(formContacto.action, {
                    method: formContacto.method,
                    body: new FormData(formContacto),
                    headers: { 'Accept': 'application/json' }
                });
                if (response.ok) {
                    status.classList.remove('d-none');
                    status.classList.add('alert-success');
                    status.innerText = '✅ ¡Comentario enviado con éxito! Gracias por escribirnos.';
                    formContacto.reset();
                } else {
                    throw new Error('Error en Formspree');
                }
            } catch(err) {
                status.classList.remove('d-none');
                status.classList.add('alert-danger');
                status.innerText = '❌ Hubo un error al enviar. Verificá tu conexión.';
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
                setTimeout(() => status.classList.add('d-none'), 5000);
            }
        });
    }

    // D. Listener para la tecla Enter en el Modal de Contraseña
    const inputPass = document.getElementById('input-pass-tecnica');
    if (inputPass) {
        inputPass.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                verificarAccesoTecnico();
            }
        });
    }
});


// =========================================================
// 2. SEGURIDAD: ACCESO A SALA TÉCNICA (Vía Backend)
// =========================================================
function abrirModalAccesoTecnico(event) {
    event.preventDefault(); 
    document.getElementById('input-pass-tecnica').value = ''; 
    document.getElementById('error-pass-tecnica').classList.add('d-none'); 
    
    const modal = new bootstrap.Modal(document.getElementById('modalAccesoTecnico'));
    modal.show();

    setTimeout(() => document.getElementById('input-pass-tecnica').focus(), 500);
}

async function verificarAccesoTecnico() {
    const passIngresada = document.getElementById('input-pass-tecnica').value.trim();
    if (!passIngresada) return;

    const btnIngresar = document.querySelector('#modalAccesoTecnico button');
    const input = document.getElementById('input-pass-tecnica');
    const errorMsg = document.getElementById('error-pass-tecnica');
    
    // Estado de carga
    const originalText = btnIngresar.innerText;
    btnIngresar.innerText = 'Verificando... ⏳';
    btnIngresar.disabled = true;
    errorMsg.classList.add('d-none');

    try {
        // Enviar la contraseña ingresada al backend de Google Apps Script para validar
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ 
                accion: "verificarPassTapicero", 
                payload: { pass: passIngresada } 
            })
        });
        
        const result = await response.json();
        
        if (result.status === "success" && result.data && result.data.success) {
            // Contraseña correcta ✅
            window.location.href = "../index.html";
        } else {
            // Contraseña incorrecta ❌
            errorMsg.classList.remove('d-none');
            input.style.borderColor = "#dc3545";
            setTimeout(() => input.style.borderColor = "rgba(255,255,255,.1)", 800);
        }
    } catch (error) {
        errorMsg.innerText = "❌ Error de conexión al verificar.";
        errorMsg.classList.remove('d-none');
    } finally {
        btnIngresar.innerText = originalText;
        btnIngresar.disabled = false;
    }
}


// =========================================================
// 3. E-COMMERCE Y CONSUMO DE APIS
// =========================================================
async function obtenerDolar() {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        valorDolarOficial = data.venta || 1000;
        document.getElementById('valor-dolar-display').innerText = `$${valorDolarOficial}`;
    } catch (error) {
        console.error("Error cargando Dólar", error);
    }
}

async function obtenerProductosAPI() {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ accion: "obtenerStock" })
        });
        const result = await response.json();
        
        if(result.status === "success") {
            productosGlobales = result.data;
            document.getElementById('loading-productos').style.display = 'none';
            renderizarProductos();
        }
    } catch (error) {
        document.getElementById('loading-productos').innerHTML = '<p class="text-danger">Error al conectar con la base de datos.</p>';
    }
}

function calcularPrecioFinal(precioUSDBase) {
    const monedaActual = document.getElementById('selector-moneda').value;
    const precioUSDConIVA = precioUSDBase * IVA;
    const precioARSConIVA = precioUSDConIVA * valorDolarOficial;

    if (monedaActual === "USD") {
        return {
            principal: `US$ ${precioUSDConIVA.toFixed(2)}`,
            secundario: `ARS$ ${precioARSConIVA.toLocaleString('es-AR', {minimumFractionDigits: 2})}`,
            valorNumerico: precioUSDConIVA
        };
    } else {
        return {
            principal: `ARS$ ${precioARSConIVA.toLocaleString('es-AR', {minimumFractionDigits: 2})}`,
            secundario: `US$ ${precioUSDConIVA.toFixed(2)}`,
            valorNumerico: precioARSConIVA
        };
    }
}

function renderizarProductos() {
    const contenedor = document.getElementById('contenedor-productos');
    contenedor.innerHTML = '';

    productosGlobales.forEach(prod => {
        const precioData = calcularPrecioFinal(prod.precioUSD);
        
        const html = `
            <div class="col-12 col-md-6 col-lg-3">
                <div class="card h-100 producto-card border-0 shadow-sm">
                    <img src="${prod.imagen}" class="card-img-top p-3 logo-rounded" alt="${prod.nombre}" style="height: 200px; object-fit: contain;">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title fw-bold">${prod.nombre}</h5>
                        <p class="mb-1 precio-ars">${precioData.principal}</p>
                        <p class="mb-2 precio-usd">${precioData.secundario}</p>
                        <span class="iva-badge align-self-start mb-3">Incluye 21% IVA</span>
                        <p class="text-muted small fw-bold">Stock: ${prod.stock} unidades</p>
                        
                        <button class="btn btn-primary mt-auto w-100 fw-bold" onclick="agregarAlCarrito('${prod.id}')">
                            Añadir al Carrito
                        </button>
                    </div>
                </div>
            </div>
        `;
        contenedor.innerHTML += html;
    });
}

function agregarAlCarrito(idProducto) {
    const prod = productosGlobales.find(p => p.id === idProducto);
    if (!prod) return;

    const itemExistente = carrito.find(item => item.id === idProducto);
    
    if (itemExistente) {
        if(itemExistente.cantidad < prod.stock) {
            itemExistente.cantidad++;
        } else {
            mostrarErrorLogico(`Solo quedan ${prod.stock} unidades de este producto.`);
            return;
        }
    } else {
        carrito.push({ ...prod, cantidad: 1 });
    }
    
    guardarCarrito();
    renderizarCarrito();
    
    const btn = event.target;
    const textOriginal = btn.innerText;
    btn.innerText = "¡Añadido! ✔️";
    btn.classList.replace("btn-primary", "btn-success");
    setTimeout(() => {
        btn.innerText = textOriginal;
        btn.classList.replace("btn-success", "btn-primary");
    }, 800);
}

function cambiarCantidad(idProducto, delta) {
    const item = carrito.find(i => i.id === idProducto);
    if (!item) return;

    item.cantidad += delta;
    
    const prodOriginal = productosGlobales.find(p => p.id === idProducto);
    if (item.cantidad > prodOriginal.stock) {
        item.cantidad = prodOriginal.stock;
        mostrarErrorLogico("Stock máximo alcanzado.");
    }

    if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== idProducto);
    }

    guardarCarrito();
    renderizarCarrito();
}

function eliminarDelCarrito(idProducto) {
    carrito = carrito.filter(item => item.id !== idProducto);
    guardarCarrito();
    renderizarCarrito();
}

function vaciarCarrito() {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
}

function renderizarCarrito() {
    const panel = document.getElementById('carrito-panel');
    const monedaActual = document.getElementById('selector-moneda').value;
    panel.innerHTML = '';
    
    let total = 0;
    let totalItems = 0;

    if(carrito.length === 0) {
        panel.innerHTML = '<p class="text-center text-muted mt-4">Tu carrito está vacío.</p>';
    }

    carrito.forEach(item => {
        const precioData = calcularPrecioFinal(item.precioUSD);
        const subtotalNum = precioData.valorNumerico * item.cantidad;
        total += subtotalNum;
        totalItems += item.cantidad;

        const simbolo = monedaActual === "USD" ? "US$" : "ARS$";
        const subtotalTxt = monedaActual === "USD" ? subtotalNum.toFixed(2) : subtotalNum.toLocaleString('es-AR', {minimumFractionDigits:2});

        panel.innerHTML += `
            <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
                <div class="d-flex flex-column" style="max-width: 60%;">
                    <span class="fw-bold text-truncate">${item.nombre}</span>
                    <span class="text-success small">${precioData.principal} c/u</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" onclick="cambiarCantidad('${item.id}', -1)">-</button>
                        <span class="btn btn-light disabled px-2">${item.cantidad}</span>
                        <button class="btn btn-outline-secondary" onclick="cambiarCantidad('${item.id}', 1)">+</button>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="eliminarDelCarrito('${item.id}')">✖</button>
                </div>
            </div>
        `;
    });

    document.getElementById('cart-badge').innerText = totalItems;
    const simboloTotal = monedaActual === "USD" ? "US$" : "ARS$";
    const totalTxt = monedaActual === "USD" ? total.toFixed(2) : total.toLocaleString('es-AR', {minimumFractionDigits:2});
    document.getElementById('carrito-total').innerText = `${simboloTotal} ${totalTxt}`;
}

function guardarCarrito() { localStorage.setItem('ecommerce_carrito', JSON.stringify(carrito)); }
function cargarCarritoDesdeStorage() {
    const guardado = localStorage.getItem('ecommerce_carrito');
    if (guardado) { carrito = JSON.parse(guardado); renderizarCarrito(); }
}

function mostrarErrorLogico(mensaje) {
    const box = document.createElement('div');
    box.style.cssText = "position:fixed; bottom:20px; right:20px; background:#dc3545; color:white; padding:15px 20px; border-radius:8px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.15); animation: fadeUp 0.3s ease;";
    box.innerText = "⚠️ " + mensaje;
    document.body.appendChild(box);
    setTimeout(() => { box.style.opacity = '0'; setTimeout(()=>box.remove(),300); }, 3000);
}

// =========================================================
// 4. FLUJO DE CHECKOUT Y COMPRA
// =========================================================
function abrirModalCheckout() {
    if(carrito.length === 0) {
        mostrarErrorLogico("Agregá productos al carrito antes de pagar.");
        return;
    }
    document.getElementById('checkout-alert').classList.add('d-none');
    
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasCarrito'));
    if(offcanvas) offcanvas.hide();
    
    const modalCheckout = new bootstrap.Modal(document.getElementById('modalCheckout'));
    modalCheckout.show();
}

async function procesarPago(event) {
    event.preventDefault(); 
    
    const btnConfirmar = document.getElementById('btn-confirmar-pago');
    const alerta = document.getElementById('checkout-alert');
    const direccion = document.getElementById('check-direccion').value.trim();
    
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando compra...';
    alerta.classList.add('d-none');

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ accion: "comprarCarrito", payload: { carrito: carrito } })
        });
        const result = await response.json();
        
        if (result.status === "success" && result.data && result.data.success) {
            const modalCheckout = bootstrap.Modal.getInstance(document.getElementById('modalCheckout'));
            if(modalCheckout) modalCheckout.hide();
            
            document.getElementById('exito-mensaje').innerHTML = `Tu pedido está siendo preparado. Lo vas a recibir en <strong>${direccion}</strong> en los próximos <strong>7 días hábiles</strong>.`;
            
            const modalExito = new bootstrap.Modal(document.getElementById('modalExito'));
            modalExito.show();
            
            vaciarCarrito();
            document.getElementById('formCheckout').reset();
            obtenerProductosAPI(); 
            
        } else {
            alerta.innerText = "Problema con el stock: " + (result.data ? result.data.error : result.message);
            alerta.classList.remove('d-none');
            obtenerProductosAPI(); 
        }
        
    } catch (error) {
        alerta.innerText = "Error de conexión. Verificá tu internet e intentá de nuevo.";
        alerta.classList.remove('d-none');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = 'Confirmar y Comprar';
    }
}
// =========================================================
// FUNCIÓN PARA VER/OCULTAR CONTRASEÑA
// =========================================================
function togglePasswordVisibility() {
    const input = document.getElementById('input-pass-tecnica');
    const icon = document.getElementById('toggle-pass-icon');
    
    if (input.type === 'password') {
        input.type = 'text'; // Muestra la contraseña
        icon.innerText = '👁️'; 
    } else {
        input.type = 'password'; // Oculta la contraseña
        icon.innerText = '👁️‍🗨️'; // Vuelve al ícono original
    }
}