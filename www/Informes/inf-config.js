// ── inf-config.js — Constantes y configuración global ──────────
// Modificar solo aquí para cambiar API o nombres de hojas.

// --- Js de Informes   ---
const API_URL = "https://script.google.com/macros/s/AKfycbz3m7DoeDccCaL5oChb7dL9dz0fbs2DdAWXaEt_wEXAGn6R-U-15Jm3nomOAbQteIWN/exec"; 

const PRECIOS_OFERTAS = {
    "Cintas": { precio: 50000, moneda: "ARS" },
    "Elípticos": { precio: 40000, moneda: "ARS" },
    "Bicicleta RB - UB": { precio: 35000, moneda: "ARS" },
    "Spinner": { precio: 20000, moneda: "ARS" },
    "Máquina de Musculación": { precio: 20000, moneda: "ARS" },
    "Multiestaciones": { precio: 40000, moneda: "ARS" },
    "Bancos Varios": { precio: 5000, moneda: "ARS" }
};

const PRECIOS_PRESUPUESTOS = {
    "Visita técnica para instalación + Mano de Obra": { precio: 160000, moneda: "ARS" }, 
    "Bateria Interna 6v 4Ah": { precio: 84600, moneda: "ARS" },
    "Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)": { precio: 625, moneda: "USD" },
    "Cable Acero Imp. Grueso c/ terminales": { precio: 22, moneda: "USD" },
    "Cable Acero Nac. Grueso c/ terminales": { precio: 18, moneda: "USD" },
    "Cable Acero Imp. Fino c/ terminales": { precio: 20, moneda: "USD" },
    "Cable Acero Nac. Fino c/ terminales": { precio: 15, moneda: "USD" },
    "Litro de Lubricante": { precio: 92000, moneda: "ARS" },
    "Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)": { precio: 500, moneda: "USD" },
    "Tabla de Cinta": { precio: 500, moneda: "USD" },
    "Reparación Rodillos Delantero": { precio: 235000, moneda: "ARS" },
    "Reparación Rodillos Trasero": { precio: 205000, moneda: "ARS" },
    "Correas de Motor": { precio: 149000, moneda: "ARS" },
    "Reparación Placas MCB": { precio: 600000, moneda: "ARS" },
    "Correa Motor Life Fitness": { precio: 178000, moneda: "ARS" },
    "Reparación Generador (Bici/Elíptico)": { precio: 380000, moneda: "ARS" },
    "Correas Bici": { precio: 179000, moneda: "ARS" },
    "Correas Elíptico": { precio: 194000, moneda: "ARS" }
};

const PRECIOS_POR_CATEGORIA = {
 
    // ── 🔧 MANO DE OBRA ────────────────────────────────────────────
    // Agregar nuevas visitas o servicios aquí ↓
    "🔧 Mano de Obra": {
        "Visita técnica para instalación + Mano de Obra": { precio: 160000, moneda: "ARS" },
        // EJEMPLO PARA AGREGAR MÁS:
        // "Visita técnica urgente": { precio: 220000, moneda: "ARS" },
    },
 
    // ── 🎽 CINTAS (Repuestos) ──────────────────────────────────────
    // Bandas, tablas y rodillos para cintas de correr ↓
    "🎽 Cintas de Correr": {
        "Banda Cinta Importadas (Star Trac, Technogym, Uranium, Impulse, Precor)": { precio: 625,  moneda: "USD" },
        "Banda de Cinta Nacional (Kip Machine, Olmo, Semikon)":                    { precio: 500,  moneda: "USD" },
        "Tabla de Cinta":                                                           { precio: 500,  moneda: "USD" },
        "Reparación Rodillos Delantero":                                            { precio: 235000, moneda: "ARS" },
        "Reparación Rodillos Trasero":                                              { precio: 205000, moneda: "ARS" },
        // AGREGAR MÁS REPUESTOS DE CINTAS AQUÍ ↓
    },
 
    // ── 🔌 CABLES DE ACERO ─────────────────────────────────────────
    // Cables para máquinas de musculación ↓
    "🔌 Cables de Acero": {
        "Cable Acero Imp. Grueso c/ terminales": { precio: 22, moneda: "USD" },
        "Cable Acero Nac. Grueso c/ terminales": { precio: 18, moneda: "USD" },
        "Cable Acero Imp. Fino c/ terminales":   { precio: 20, moneda: "USD" },
        "Cable Acero Nac. Fino c/ terminales":   { precio: 15, moneda: "USD" },
        // AGREGAR NUEVOS CABLES AQUÍ ↓
    },
 
    // ── ⚙️ CORREAS ─────────────────────────────────────────────────
    // Correas para bicicletas, elípticos y motores ↓
    "⚙️ Correas": {
        "Correas de Motor":            { precio: 149000, moneda: "ARS" },
        "Correa Motor Life Fitness":   { precio: 178000, moneda: "ARS" },
        "Correas Bici":                { precio: 179000, moneda: "ARS" },
        "Correas Elíptico":            { precio: 194000, moneda: "ARS" },
        // AGREGAR NUEVAS CORREAS AQUÍ ↓
    },
 
    // ── 🔬 ELECTRÓNICA / REPARACIONES ──────────────────────────────
    // Placas, generadores y componentes electrónicos ↓
    "🔬 Electrónica": {
        "Reparación Placas MCB":                 { precio: 600000, moneda: "ARS" },
        "Reparación Generador (Bici/Elíptico)":  { precio: 380000, moneda: "ARS" },
        // AGREGAR NUEVAS REPARACIONES ELECTRÓNICAS AQUÍ ↓
    },
 
    // ── 🧴 CONSUMIBLES ──────────────────────────────────────────────
    // Lubricantes, baterías y elementos descartables ↓
    "🧴 Consumibles": {
        "Bateria Interna 6v 4Ah": { precio: 84600,  moneda: "ARS" },
        "Litro de Lubricante":    { precio: 92000,  moneda: "ARS" },
        "Mosquetones":     { precio: 15000,   moneda: "ARS" },
        "Registro de doble acción": { precio: 42000,  moneda: "ARS" },
        "Cadenas Spinner 112L pro (Bicicleta)": { precio: 44, moneda: "USD" },
        // AGREGAR NUEVOS CONSUMIBLES AQUÍ ↓
    },
};

let modoApp = 'ofertas'; 
const HOJA_OFERTAS = "Ofertas de Mantenimiento";
const HOJA_PRESUPUESTOS = "Presupuestos de Reparacion";

let documentosGuardados = [];
let idEditando = null;
let valorDolarOficial = 1000; 

let globalGymsOfertas = [];
let globalGymsPresupuestos = [];

let listaAbonosBase = [];
let sectorAbonoActual = 'completado';
let tabActivo = 'crear'; // Estado del tab activo (no chequear CSS)

// =============================================================================
// 💱 DÓLAR OFICIAL — 5 fuentes en paralelo, toma el valor MÁS RECIENTE
// =============================================================================

const FUENTES_DOLAR = [
    // 1. DolarAPI — más usada, actualización cada ~15 min
    {
        url: 'https://dolarapi.com/v1/dolares/oficial',
        parse: (d) => ({ venta: d.venta, fecha: d.fechaActualizacion || null })
    },
    // 2. Argentina Datos — agrega datos del BCRA
    {
        url: 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial',
        parse: (d) => {
            // Devuelve array; el último elemento es el más reciente
            const ultimo = Array.isArray(d) ? d[d.length - 1] : d;
            return { venta: ultimo.venta, fecha: ultimo.fecha || null };
        }
    },
    // 3. Bluelytics — fuente independiente
    {
        url: 'https://api.bluelytics.com.ar/v2/latest',
        parse: (d) => ({ venta: d.oficial?.value_sell, fecha: d.last_update || null })
    },
    // 4. CriptoYa — agrega datos del mercado en tiempo real
    {
        url: 'https://criptoya.com/api/dolar',
        parse: (d) => ({ venta: d.oficial?.ask, fecha: null })
    },
    // 5. Dolarito — otra fuente independiente
    {
        url: 'https://dolarito.ar/api/quotes/ALL',
        parse: (d) => {
            const of = d?.oficial || d?.Oficial;
            return { venta: of?.sell || of?.venta, fecha: null };
        }
    }
];