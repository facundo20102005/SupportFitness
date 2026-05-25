// ══════════════════════════════════════════════════════════════════
//  inf-config.js — ÚNICA fuente de verdad para constantes globales
//  Cargado PRIMERO en todas las páginas (index.html, Informes-index.html, Jefatura/index.html)
//  NO duplicar estas constantes en app.js, jefatura.js, inf-api.js, etc.
// ══════════════════════════════════════════════════════════════════

// ── API ─────────────────────────────────────────────────────────
const SF_API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec";

// Alias retrocompatible — los archivos que aún usan API_URL siguen funcionando
// sin necesidad de refactorizar cada llamada de golpe.
// Una vez migrado todo, eliminar este alias.
// eslint-disable-next-line no-unused-vars
window.API_URL = SF_API_URL;

// ── TIMEOUTS (ms) ──────────────────────────────────────────────
const SF_TIMEOUT = {
    NORMAL:      15_000,   // Llamadas simples al backend
    CON_FOTOS:   50_000,   // Envío de formulario con imágenes adjuntas
    SYNC_OFFLINE:60_000,   // Re-envío de registros guardados offline
    API_DOLAR:    7_000,   // Cotización del dólar (múltiples fuentes)
    REPARACIONES:20_000,   // Carga del módulo Presupuestar
};

// ── DÓLAR ──────────────────────────────────────────────────────
// Valor inicial mientras se obtiene la cotización real.
// Los módulos leen/escriben window.valorDolarOficial.
// Se define UNA sola vez aquí; otros archivos NO deben redeclararla.
window.valorDolarOficial = 1_000;

// TTL de caché del dólar en localStorage (1 hora en ms)
const SF_DOLAR_CACHE_TTL = 3_600_000;

// ── HOJAS DE GOOGLE SHEETS ──────────────────────────────────────
const HOJA_OFERTAS       = "Ofertas de Mantenimiento";
const HOJA_PRESUPUESTOS  = "Presupuestos de Reparacion";

// ── PRECIOS (se usan en inf-reparaciones, inf-docs, Calculadora) ─
const SF_PRECIO_TERMINAL_USD = 10;   // $/terminal de cable importado

const PRECIOS_OFERTAS = {
    "Cintas":                  { precio: 50000,  moneda: "ARS" },
    "Elípticos":               { precio: 40000,  moneda: "ARS" },
    "Bicicleta RB - UB":       { precio: 35000,  moneda: "ARS" },
    "Spinner":                 { precio: 20000,  moneda: "ARS" },
    "Máquina de Musculación":  { precio: 20000,  moneda: "ARS" },
    "Multiestaciones":         { precio: 40000,  moneda: "ARS" },
    "Bancos Varios":           { precio:  5000,  moneda: "ARS" },
};

const PRECIOS_PRESUPUESTOS = {
    "Visita técnica para instalación + Mano de Obra":                               { precio: 160000, moneda: "ARS" },
    "Bateria Interna 6v 4Ah":                                                       { precio:  84600, moneda: "ARS" },
    "Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)":      { precio:    625, moneda: "USD" },
    "Cable Acero Importado Grueso con terminales":                                  { precio:     22, moneda: "USD" },
    "Cable Acero Nacional Grueso con terminales":                                   { precio:     18, moneda: "USD" },
    "Cable Acero Importado Fino con terminales":                                    { precio:     20, moneda: "USD" },
    "Cable Acero Nacional Fino con terminales":                                     { precio:     15, moneda: "USD" },
    "Litro de Lubricante":                                                          { precio:  92000, moneda: "ARS" },
    "Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)":                         { precio:    500, moneda: "USD" },
    "Tabla de Cinta":                                                               { precio:    500, moneda: "USD" },
    "Reparación Rodillos Delantero":                                                { precio: 235000, moneda: "ARS" },
    "Reparación Rodillos Trasero":                                                  { precio: 205000, moneda: "ARS" },
    "Correas de Motor":                                                             { precio: 149000, moneda: "ARS" },
    "Reparación Placas MCB":                                                        { precio: 600000, moneda: "ARS" },
    "Correa Motor Life Fitness":                                                    { precio: 178000, moneda: "ARS" },
    "Reparación Generador (Bicicleta/Elíptico)":                                    { precio: 380000, moneda: "ARS" },
    "Correas Bicicleta":                                                            { precio: 179000, moneda: "ARS" },
    "Cadenas Spinner 112L pro (Bicicleta)":                                         { precio:     44, moneda: "USD" },
    "Registro de doble acción":                                                     { precio:  42000, moneda: "ARS" },
    "Mosquetones":                                                                  { precio:  15000, moneda: "ARS" },
    "Correas Elíptico":                                                             { precio: 194000, moneda: "ARS" },
};

const PRECIOS_POR_CATEGORIA = {
    "🔧 Mano de Obra": {
        "Visita técnica para instalación + Mano de Obra": { precio: 160000, moneda: "ARS" },
    },
    "🎽 Cintas de Correr": {
        "Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)": { precio: 625,    moneda: "USD" },
        "Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)":                    { precio: 500,    moneda: "USD" },
        "Tabla de Cinta":                                                           { precio: 500,    moneda: "USD" },
        "Reparación Rodillos Delantero":                                            { precio: 235000, moneda: "ARS" },
        "Reparación Rodillos Trasero":                                              { precio: 205000, moneda: "ARS" },
    },
    "🔌 Cables de Acero": {
        "Cable Acero Imp. Grueso c/ terminales": { precio: 22, moneda: "USD" },
        "Cable Acero Nac. Grueso c/ terminales": { precio: 18, moneda: "USD" },
        "Cable Acero Imp. Fino c/ terminales":   { precio: 20, moneda: "USD" },
        "Cable Acero Nac. Fino c/ terminales":   { precio: 15, moneda: "USD" },
    },
    "⚙️ Correas": {
        "Correas de Motor":          { precio: 149000, moneda: "ARS" },
        "Correa Motor Life Fitness": { precio: 178000, moneda: "ARS" },
        "Correas Bici":              { precio: 179000, moneda: "ARS" },
        "Correas Elíptico":          { precio: 194000, moneda: "ARS" },
    },
    "🔬 Electrónica": {
        "Reparación Placas MCB":                { precio: 600000, moneda: "ARS" },
        "Reparación Generador (Bici/Elíptico)": { precio: 380000, moneda: "ARS" },
        "Bateria Interna 6v 4Ah":               { precio:  84600, moneda: "ARS" },
    },
    "🧴 Consumibles": {
        "Litro de Lubricante":                  { precio:  92000, moneda: "ARS" },
        "Mosquetones":                          { precio:  15000, moneda: "ARS" },
        "Registro de doble acción":             { precio:  42000, moneda: "ARS" },
        "Cadenas Spinner 112L pro (Bicicleta)": { precio:     44, moneda: "USD" },
    },
    "🪡 Tapizados": {
        "Tapizado Chico (asiento/apoyo pequeño)":     { precio:  52500, moneda: "ARS" },
        "Tapizado Mediano (asiento/respaldo mediano)": { precio:  75000, moneda: "ARS" },
        "Tapizado Grande (respaldo grande)":           { precio:  97500, moneda: "ARS" },
        "Rodillos de apoya piernas/brazos":            { precio:  52500, moneda: "ARS" },
    },
};

// ── ESTADO GLOBAL DE LA APP ─────────────────────────────────────
// Variables de estado que comparten múltiples módulos.
// Se inicializan aquí para evitar que cada módulo las declare de nuevo.
window.listaAbonosBase        = [];
window.documentosGuardados    = [];
window.globalGymsOfertas      = [];
window.globalGymsPresupuestos = [];
window.modoApp                = 'ofertas';   // 'ofertas' | 'presupuestos'
window.tabActivo              = 'crear';     // 'crear' | 'creados' | 'reparaciones'
window.idEditando             = null;
window.sectorAbonoActual      = 'completado';

// ── FUENTES DEL DÓLAR ──────────────────────────────────────────
const FUENTES_DOLAR = [
    {
        url:   'https://dolarapi.com/v1/dolares/oficial',
        parse: d => ({ venta: d.venta, fecha: d.fechaActualizacion || null }),
    },
    {
        url:   'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial',
        parse: d => {
            const ultimo = Array.isArray(d) ? d[d.length - 1] : d;
            return { venta: ultimo.venta, fecha: ultimo.fecha || null };
        },
    },
    {
        url:   'https://api.bluelytics.com.ar/v2/latest',
        parse: d => ({ venta: d.oficial?.value_sell, fecha: d.last_update || null }),
    },
    {
        url:   'https://criptoya.com/api/dolar',
        parse: d => ({ venta: d.oficial?.ask, fecha: null }),
    },
    {
        url:   'https://dolarito.ar/api/quotes/ALL',
        parse: d => {
            const of = d?.oficial || d?.Oficial;
            return { venta: of?.sell || of?.venta, fecha: null };
        },
    },
];