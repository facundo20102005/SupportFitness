// ════════════════════════════════════════════════════════════════
//  SUPPORT FITNESS — Backend.js  v3.2  COMPLETO
//  Google Apps Script — API para el panel web
//
//  FIXES v3.2 (respecto a la versión anterior):
//  ① Eliminadas funciones duplicadas buscarColumna() y
//    obtenerOCrearCarpeta() — causaban errores de compilación
//    silenciosos que abortaban TODO el script.
//  ② procesarYGuardarTodo(): motivos soporta array Y string.
//  ③ Subida de fotos con try/catch individual por foto.
//  ④ Guardado del registro no depende del éxito de Drive.
//  ⑤ Logger.log en puntos clave para debugging.
//  ⑥ sincronizarFacturacionForm4 movida al router doPost
//    (antes no era alcanzable desde el frontend).
//  ⑦ Eliminado bloque de comentario incompleto que dejaba
//    el cierre del try de registrarEnHistorialAnual fuera
//    de su función en versiones anteriores.
//  ⑧ actualizarPlantillaYExportarPDF: lock.releaseLock()
//    duplicado en el bloque inner-catch eliminado para evitar
//    "Lock already released" que causaba error 500 al frontend.
// ════════════════════════════════════════════════════════════════

// ── CONSTANTES DE HOJAS ───────────────────────────────────────
const ID_PLANILLA          = "1NnEQh_ZxdljdreZih1ClSUEHdwOAm3MAtOsXpKy55mw";
const PLANILLA_ABONOS      = "Base Abonos";
const PLANILLA_PRESUPUESTO = "Plantilla_Presupuesto";
const PLANILLA_EMITIDOS    = "Presupuestos_Emitidos";

// ── VERIFICACIÓN DE ACCESO ────────────────────────────────────
function verificarPasswordServidor(pass, destino) {
  const props        = PropertiesService.getScriptProperties();
  const passJefe     = props.getProperty("PASS_JEFE");
  const passTapicero = props.getProperty("PASS_TAPICERO");
  if (!passJefe || !passTapicero) {
    return { ok: false, isJefe: false,
             error: "Contraseñas no configuradas. Apps Script → Propiedades del script." };
  }
  if (destino === "jefatura") {
    return { ok: pass === passJefe, isJefe: pass === passJefe };
  }
  if (destino === "tapizados") {
    if (pass === passJefe)     return { ok: true, isJefe: true  };
    if (pass === passTapicero) return { ok: true, isJefe: false };
  }
  return { ok: false, isJefe: false };
}

// ── FIX ①: UNA SOLA declaración ───────────────────────────────
function buscarColumna(headers, nombreAprox) {
  if (!headers || !Array.isArray(headers)) return -1;
  const target = String(nombreAprox).toLowerCase().trim();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().trim().includes(target)) return i;
  }
  return -1;
}

let _ss;
function getSpreadsheet()   { return _ss || (_ss = SpreadsheetApp.openById(ID_PLANILLA)); }
function getHojaPrincipal() { return getSpreadsheet().getSheets()[0]; }

function normalizarTexto(str) {
  return str
    ? str.toLowerCase().normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .replace(/[<>:"/\\|?*]+/g, "")
         .replace(/\s+/g, " ").trim()
    : "";
}
function sanitizarNombre(str) {
  return str ? str.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, " ").trim() : "";
}

function parseDateSeguro(fechaRaw) {
  if (!fechaRaw) return null;
  if (fechaRaw instanceof Date) return fechaRaw;
  if (typeof fechaRaw === 'number') return new Date(Math.round((fechaRaw - 25569) * 86400 * 1000));
  const str    = String(fechaRaw).trim();
  const partes = str.split(" ")[0].split("/");
  if (partes.length === 3) {
    const d = new Date(parseInt(partes[2],10), parseInt(partes[1],10)-1, parseInt(partes[0],10));
    if (!isNaN(d.getTime())) return d;
  }
  const d2 = new Date(str);
  return isNaN(d2.getTime()) ? null : d2;
}

function aplicarDiseñoHoja(sheet) {
  const rango = sheet.getDataRange();
  rango.setBorder(true,true,true,true,true,true,'#cccccc',SpreadsheetApp.BorderStyle.SOLID);
  rango.setVerticalAlignment("middle");
  sheet.getRange(1,1,1,sheet.getLastColumn())
       .setBackground("#1a73e8").setFontColor("white")
       .setFontWeight("bold").setHorizontalAlignment("center");
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

// ── FIX ①: UNA SOLA declaración ───────────────────────────────
function obtenerOCrearCarpeta(parent, nombre) {
  const folders = parent.getFoldersByName(nombre);
  return folders.hasNext() ? folders.next() : parent.createFolder(nombre);
}

// ════════════════════════════════════════════════════════════════
//  REEMPLAZO de procesarYGuardarTodo() — versión con foto robusta
//  Reemplaza la función COMPLETA en Backend_v3.2_COMPLETO.js
// ════════════════════════════════════════════════════════════════
function procesarYGuardarTodo(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet          = getHojaPrincipal();
    const spreadsheet    = getSpreadsheet();
    const fecha          = new Date();
    const gimnasioLimpio = sanitizarNombre(data.gimnasio || "Sin Gimnasio");

    // FIX ②: motivo como array O string
    let motivoMuestra = "";
    const motivoRaw   = data.motivos !== undefined ? data.motivos
                      : data.motivo  !== undefined ? data.motivo : "";
    if (Array.isArray(motivoRaw)) {
      motivoMuestra = motivoRaw.filter(m => m && String(m).trim()).join(" + ");
    } else {
      motivoMuestra = String(motivoRaw).trim();
    }
    const otroRaw = String(data.otroMotivo || "").trim();
    if (otroRaw) motivoMuestra = motivoMuestra ? motivoMuestra + " + " + otroRaw : otroRaw;
    if (!motivoMuestra) motivoMuestra = "Sin especificar";

    Logger.log("MOTIVO: " + motivoMuestra);
    Logger.log("GIMNASIO: " + gimnasioLimpio);
    Logger.log("TÉCNICO: " + (data.tecnico || "—"));
    Logger.log("FOTOS RECIBIDAS: " + (Array.isArray(data.archivos) ? data.archivos.length : "data.archivos no es array → " + typeof data.archivos));

    // Número de remito
    const props  = PropertiesService.getScriptProperties();
    let numero   = Number(props.getProperty("contador_remitos")) || 0;
    if (numero < 1) numero = Math.max(sheet.getLastRow(), 1);
    const remitoGenerado = "R-" + ("0000" + numero).slice(-4);
    props.setProperty("contador_remitos", numero + 1);
    Logger.log("REMITO: " + remitoGenerado);

    // Leer headers ANTES de armar la fila
    const headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log("HEADERS: " + JSON.stringify(headers));

    const nuevaFila = new Array(headers.length).fill("");
    function setVal(col, val) {
      const idx = buscarColumna(headers, col);
      if (idx !== -1) nuevaFila[idx] = val;
      else Logger.log("COLUMNA NO ENCONTRADA: '" + col + "'");
    }

    setVal("marca temporal", fecha);
    setVal("técnico",        data.tecnico   || "");
    setVal("gimnasio",       gimnasioLimpio);
    setVal("motivo",         motivoMuestra);
    setVal("remito",         remitoGenerado);
    setVal("reparación",     data.reparacion || "No");
    setVal("tapizado",       data.tapizado   || "No");
    setVal("ubicación",      (data.lat && data.lng) ? `${data.lat}, ${data.lng}` : "");
    setVal("facturado",      "Pendiente");
    setVal("pagado",         "Pendiente");

    // Drive: carpeta
    let linkPrimeraFoto   = "";
    let nombrePrimeraFoto = "";
    let linksTodasLasFotos = [];
    const tz      = Session.getScriptTimeZone();
    const añoStr  = Utilities.formatDate(fecha, tz, "yyyy");
    const mesesEsp = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const mesStr  = Utilities.formatDate(fecha, tz, "MM") + "-" + mesesEsp[fecha.getMonth()];

    let carpetaGimnasio = null;
    try {
      const carpetaPrincipal = obtenerOCrearCarpeta(DriveApp, "Fotos Gimnasios");
      carpetaGimnasio = obtenerOCrearCarpeta(
        obtenerOCrearCarpeta(obtenerOCrearCarpeta(carpetaPrincipal, añoStr), mesStr),
        gimnasioLimpio
      );
      Logger.log("CARPETA DRIVE: " + carpetaGimnasio.getName() + " | ID: " + carpetaGimnasio.getId());
    } catch(errCarpeta) {
      Logger.log("ERROR creando carpeta: " + errCarpeta.message);
    }

    // PDF de visita
    if (carpetaGimnasio) {
      try {
        const fechaStr = Utilities.formatDate(fecha, tz, "dd/MM/yyyy HH:mm");
        const htmlPDF  = `<div style="font-family:Arial,sans-serif;color:#333;padding:20px;">
          <h1 style="color:#1a73e8;">Informe de Visita: ${remitoGenerado}</h1>
          <p><b>Fecha:</b> ${fechaStr}</p>
          <p><b>Gimnasio:</b> ${gimnasioLimpio}</p>
          <p><b>Técnico:</b> ${data.tecnico || "—"}</p>
          <p><b>Motivo:</b> ${motivoMuestra}</p>
        </div>`;
        const blobPDF = Utilities.newBlob(htmlPDF, MimeType.HTML).getAs(MimeType.PDF);
        blobPDF.setName(`${remitoGenerado}.pdf`);
        carpetaGimnasio.createFile(blobPDF);
        Logger.log("PDF de visita OK");
      } catch(errPDF) {
        Logger.log("ERROR PDF: " + errPDF.message);
      }
    }

    // Subir fotos
    if (carpetaGimnasio && Array.isArray(data.archivos) && data.archivos.length > 0) {
      Logger.log("Subiendo " + data.archivos.length + " foto(s)...");
      data.archivos.forEach((archivo, i) => {
        try {
          if (!archivo.base64Data || !archivo.mimeType || !archivo.name) {
            Logger.log("Foto " + i + " inválida: faltan campos"); return;
          }
          const bytes     = Utilities.base64Decode(archivo.base64Data);
          const extension = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
          
          // MEJORA: Asignamos el nombre final directamente al blob antes de crearlo.
          const nombre    = `${remitoGenerado} - ${gimnasioLimpio} - ${i + 1}.${extension}`;
          const blob      = Utilities.newBlob(bytes, archivo.mimeType, nombre);
          
          const file      = carpetaGimnasio.createFile(blob);
          const url       = file.getUrl();
          linksTodasLasFotos.push(url);
          if (i === 0) { linkPrimeraFoto = url; nombrePrimeraFoto = nombre; }
          Logger.log("Foto " + (i+1) + " SUBIDA OK → " + url);
        } catch(errFoto) {
          Logger.log("ERROR foto " + i + ": " + errFoto.message);
        }
      });
    } else {
      Logger.log("Sin archivos adjuntos para subir a Drive.");
    }

    // ── Encontrar columna de foto (FIX: múltiples nombres + crear si no existe) ──
    let idxFotos = -1;
    const nombresColumnaFoto = ["foto", "fotos", "link", "imagen", "picture", "archivo"];
    for (const nombre of nombresColumnaFoto) {
      idxFotos = buscarColumna(headers, nombre);
      if (idxFotos !== -1) {
        Logger.log("Columna foto encontrada: '" + headers[idxFotos] + "' en col " + (idxFotos+1));
        break;
      }
    }
 
    // Si no existe ninguna columna de foto, agregar una al final
    if (idxFotos === -1) {
      Logger.log("ADVERTENCIA: No se encontró columna de foto. Agregando al final...");
      idxFotos = headers.length; // índice 0-based de la nueva columna
      // Escribir el header en la fila 1, columna nueva
      sheet.getRange(1, idxFotos + 1).setValue("Foto");
      // Extender la fila nueva para que tenga esa columna
      while (nuevaFila.length <= idxFotos) nuevaFila.push("");
    }
 
    if (linkPrimeraFoto) {
      nuevaFila[idxFotos] = linkPrimeraFoto;
      Logger.log("Link primera foto asignado a col " + (idxFotos+1) + ": " + linkPrimeraFoto);
    } else {
      Logger.log("Sin link de foto para guardar (fotos vacías o Drive falló)");
    }

    // ── Insertar fila ────────────────────────────────────────────
    sheet.appendRow(nuevaFila);
    const filaInsertada = sheet.getLastRow();
    Logger.log("Fila insertada en: " + filaInsertada);
 
    // ── RichText del link (doble seguridad: ya está como texto plano arriba) ──
    if (linkPrimeraFoto && nombrePrimeraFoto) {
      try {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(nombrePrimeraFoto)
          .setLinkUrl(linkPrimeraFoto)
          .build();
        sheet.getRange(filaInsertada, idxFotos + 1).setRichTextValue(rich);
        Logger.log("RichText aplicado OK en fila " + filaInsertada + ", col " + (idxFotos+1));
      } catch(errRich) {
        // Si falla el RichText, el link de texto plano ya está guardado arriba
        Logger.log("RichText falló (no crítico, link plano ya guardado): " + errRich.message);
      }
    }

    // Tapizados
    if (data.reparacion === "Si" && data.tapizado === "Si") {
      try {
        verificarYCrearPestañaTapizados(spreadsheet);
        const sheetTap   = spreadsheet.getSheetByName("Tapizados");
        const headersTap = sheetTap.getDataRange().getValues()[0];
        const filaTap    = new Array(headersTap.length).fill("");
        const setTV      = (col, val) => { const idx = buscarColumna(headersTap, col); if (idx !== -1) filaTap[idx] = val; };
        setTV("remito",           remitoGenerado);
        setTV("fecha",            fecha);
        setTV("gimnasio",         gimnasioLimpio);
        setTV("técnico",          data.tecnico || "");
        setTV("fotos originales", linksTodasLasFotos.join(","));
        setTV("estado",           "Pendiente");
        sheetTap.appendRow(filaTap);
        Logger.log("Tapizados OK");
      } catch(errTap) { Logger.log("ERROR Tapizados: " + errTap.message); }
    }

    CacheService.getScriptCache().remove("historial_visitas_turbo");
    registrarEnHistorialAnual(fecha, gimnasioLimpio, data.tecnico || "", motivoMuestra, remitoGenerado);
    try { aplicarDiseñoHoja(sheet); } catch(e) {}

    const msg = `Remito ${remitoGenerado} creado ✅` +
      (linksTodasLasFotos.length > 0 ? ` (${linksTodasLasFotos.length} foto(s) en Drive)` : " (sin fotos en Drive)");
    Logger.log(msg);
    return msg;

  } catch(error) {
    Logger.log("ERROR CRÍTICO procesarYGuardarTodo: " + error.message + "\n" + error.stack);
    throw new Error("Error al guardar: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

// ── HISTORIAL TURBO ───────────────────────────────────────────
function obtenerRegistroHistorico(payload) {
  const cache = CacheService.getScriptCache();
  if (payload && payload.forzar) {
    cache.remove("historial_visitas_turbo");
  } else {
    const cd = cache.get("historial_visitas_turbo");
    if (cd) return JSON.parse(cd);
  }
  try {
    const sheet        = getHojaPrincipal();
    const datos        = sheet.getDataRange().getValues();
    if (datos.length < 2) return [];
    const headers      = datos[0];
    const idxFecha     = buscarColumna(headers, "marca temporal");
    const idxGym       = buscarColumna(headers, "gimnasio");
    const idxMotivo    = buscarColumna(headers, "motivo");
    const idxFacturado = buscarColumna(headers, "facturado");
    const historial    = [];
    const zona         = Session.getScriptTimeZone();
    for (let i = 1; i < datos.length; i++) {
      const fechaObj = parseDateSeguro(datos[i][idxFecha]);
      if (!fechaObj) continue;
      const facturado = idxFacturado !== -1 ? String(datos[i][idxFacturado]).trim() : "";
      if (facturado === "." || facturado.toLowerCase() === "si") continue;
      historial.push({
        gym:      normalizarTexto(String(datos[i][idxGym])),
        año:      Number(fechaObj.getFullYear()),
        mes:      Number(fechaObj.getMonth()),
        dia:      Number(fechaObj.getDate()),
        fechaStr: Utilities.formatDate(fechaObj, zona, "dd/MM/yyyy"),
        motivo:   idxMotivo !== -1 ? String(datos[i][idxMotivo]) : ""
      });
    }
    cache.put("historial_visitas_turbo", JSON.stringify(historial), 21600);
    return historial;
  } catch(e) { return []; }
}

// ── CALENDARIO WEB ────────────────────────────────────────────
function obtenerDatosCalendarioWeb() {
  try {
    const sheet   = getHojaPrincipal();
    const datos   = sheet.getDataRange().getValues();
    if (datos.length < 2) return [];
    const headers    = datos[0];
    const idxFecha   = buscarColumna(headers, "marca temporal");
    const idxTecnico = buscarColumna(headers, "técnico");
    const idxGym     = buscarColumna(headers, "gimnasio");
    const resultado  = [];
    const zona       = Session.getScriptTimeZone();
    for (let i = 1; i < datos.length; i++) {
      const dateObj = parseDateSeguro(datos[i][idxFecha]);
      const tecnico = String(datos[i][idxTecnico] || "").trim();
      const gym     = idxGym !== -1 ? String(datos[i][idxGym]).trim() : "Gimnasio";
      if (!dateObj || !tecnico) continue;
      resultado.push({
        año:     Number(dateObj.getFullYear()),
        mes:     Number(dateObj.getMonth()),
        dia:     Number(dateObj.getDate()),
        hora:    Utilities.formatDate(dateObj, zona, "HH:mm"),
        tecnico: tecnico.charAt(0).toUpperCase() + tecnico.slice(1).toLowerCase(),
        gym:     gym
      });
    }
    return resultado;
  } catch(e) { return []; }
}

// ── TAPIZADOS — CREAR PESTAÑA ─────────────────────────────────
function verificarYCrearPestañaTapizados(spreadsheet) {
  let sheet = spreadsheet.getSheetByName("Tapizados");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("Tapizados");
    const headers = ["Remito","Fecha","Gimnasio","Técnico","Fotos Originales","Fotos Cotizadas",
                     "Detalle (Cantidades)","Precios Unitarios","Subtotales",
                     "Total Tapicero","Total Cliente","Estado"];
    sheet.appendRow(headers);
    sheet.getRange("A1:L1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ── FACTURACIÓN (utilidad interna) ────────────────────────────
function sincronizarFacturacionForm4(gymLimpio, fechaStr, nuevoEstado) {
  try {
    const sheet = getHojaPrincipal();
    const datos = sheet.getDataRange().getValues();
    const headers = datos[0];
    const idxFecha = buscarColumna(headers, "marca temporal");
    const idxGym = buscarColumna(headers, "gimnasio");
    const idxFacturado = buscarColumna(headers, "facturado");
    if (idxFacturado === -1) return false;
    const zona = Session.getScriptTimeZone();
    const gymNorm = normalizarTexto(gymLimpio || "");
    const soloGym = !fechaStr || String(fechaStr).trim() === "";
    let modificados = 0;
    for (let i = 1; i < datos.length; i++) {
      const gRow = normalizarTexto(String(datos[i][idxGym] || ""));
      if (gRow !== gymNorm) continue;
      if (!soloGym) {
        const dateObj = parseDateSeguro(datos[i][idxFecha]);
        if (!dateObj) continue;
        const fStr = Utilities.formatDate(dateObj, zona, "dd/MM/yyyy");
        if (fStr !== fechaStr) continue;
      }
      sheet.getRange(i + 1, idxFacturado + 1).setValue(nuevoEstado);
      modificados++;
      if (!soloGym) break;
    }
    Logger.log("sincronizarFacturacionForm4: " + modificados + " filas actualizadas");
    return modificados > 0;
  } catch (e) {
    Logger.log("ERROR sincronizarFacturacionForm4: " + e.message);
    return false;
  }
}
function verificarYCrearPestañaGenerica(spreadsheet, nombreHoja) {
  let sheet = spreadsheet.getSheetByName(nombreHoja);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(nombreHoja);
    const headers = ["ID","Fecha","Gimnasio","Atributo Extra","Total",
                     "Items (JSON)","Estado","Pagado","CUIT","Fecha Visita","Nº Factura"];
    sheet.appendRow(headers);
    sheet.getRange("A1:K1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(6, 400);
  }
  return sheet;
}

// ── DOCUMENTOS BD ────────────────────────────────────────────
function guardarDocumentoBD(payload) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(payload.hoja);
  if (!sheet) throw new Error("No se encontró la hoja: " + payload.hoja);
  const d        = payload.datos;
  const itemsStr = typeof d.items === 'string' ? d.items : JSON.stringify(d.items || []);
  const fila = [d.id, d.fecha||"", d.cliente||"", d.atributoExtra||"",
                d.total||0, itemsStr, d.estado||"Pendiente", d.pagado||"Pendiente",
                d.cuit||"", d.fechaVisita||"", d.numFactura||""];
  const data     = sheet.getDataRange().getValues();
  let modificado = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(d.id)) {
      sheet.getRange(i+1,1,1,fila.length).setValues([fila]);
      modificado = true; break;
    }
  }
  if (!modificado) sheet.appendRow(fila);
  return "Guardado exitoso";
}

function obtenerDocumentosBD(payload) {
  try {
    const sheet = getSpreadsheet().getSheetByName(payload.hoja);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const docs = [];
    for (let i = 1; i < data.length; i++) {
      let parsedItems = [];
      try { parsedItems = JSON.parse(data[i][5] || "[]"); }
      catch(e) { parsedItems = [{tipo:"Error",desc:"Datos ilegibles",cant:1,precio:0}]; }
      docs.push({
        id: data[i][0], fecha: data[i][1], cliente: data[i][2],
        atributoExtra: data[i][3], total: data[i][4], items: parsedItems,
        estado: data[i][6]||"Pendiente", pagado: data[i][7]||"Pendiente",
        cuit: data[i][8]||"", fechaVisita: data[i][9]||"", numFactura: data[i][10]||""
      });
    }
    return docs.reverse();
  } catch(e) { return []; }
}

function eliminarDocumentoBD(payload) {
  try {
    const sheet = getSpreadsheet().getSheetByName(payload.hoja);
    if (!sheet) return "No hay hoja";
    const data  = sheet.getDataRange().getValues();
    const idStr = String(payload.id);
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === idStr) { sheet.deleteRow(i+1); return "Eliminado 🗑️"; }
    }
    return "No encontrado";
  } catch(e) { throw new Error(e.message); }
}

// ── TRIGGERS ─────────────────────────────────────────────────
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['recordatorioFacturacionMensual','alertaPresupuestosSinRespuesta','enviarResumenVisitas']
        .includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recordatorioFacturacionMensual').timeBased().onMonthDay(4).atHour(8).create();
  ScriptApp.newTrigger('alertaPresupuestosSinRespuesta').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  ScriptApp.newTrigger('enviarResumenVisitas').timeBased().everyHours(2).create();
  Logger.log('✅ Triggers configurados.');
}

function recordatorioFacturacionMensual() {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName(PLANILLA_ABONOS);
    if (!sheet) return;
    const zona      = Session.getScriptTimeZone();
    const hoy       = new Date();
    const mesActual = hoy.getMonth();
    const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const periodoStr = nombresMeses[mesActual] + ' ' + hoy.getFullYear();
    const maxRows    = Math.max(sheet.getLastRow(), 1);
    const data       = sheet.getRange(1,1,maxRows,22).getValues();
    const bgs        = sheet.getRange(1,1,maxRows,22).getBackgrounds();
    const pendientes = [], yaFacturados = [];
    for (let i = 0; i < data.length; i++) {
      if (!data[i][0] || String(data[i][0]).toLowerCase().includes('orden')) continue;
      const col     = 10 + mesActual;
      const factura = String(data[i][col]  || '').trim();
      const colorBg = String(bgs[i][col]   || '').toLowerCase();
      const enviado = colorBg.includes('93c47d') || colorBg.includes('6aa84f');
      if (!factura && !enviado) pendientes.push({ gym: String(data[i][1]).trim(), tipo: String(data[i][2]).trim() });
      else yaFacturados.push({ gym: String(data[i][1]).trim(), factura });
    }
    const lineas = ['RECORDATORIO DE FACTURACION — ' + periodoStr, '',
                    'PENDIENTES (' + pendientes.length + '):', ''];
    pendientes.forEach((a,i)  => lineas.push((i+1) + '. ' + a.gym + ' — ' + a.tipo));
    lineas.push('', 'YA FACTURADOS (' + yaFacturados.length + '):', '');
    yaFacturados.forEach((a,i) => lineas.push((i+1) + '. ' + a.gym + (a.factura ? ' — ' + a.factura : '')));
    lineas.push('', 'Panel: https://supporfitness.vercel.app/Informes/');
    MailApp.sendEmail({ to: 'support_fitness@hotmail.com',
      subject: 'Facturacion ' + periodoStr + ' — ' + pendientes.length + ' pendientes',
      body: lineas.join('\n') });
    Logger.log('Recordatorio mensual OK. Pendientes: ' + pendientes.length);
  } catch(e) { Logger.log('recordatorioFacturacionMensual ERROR: ' + e.toString()); }
}

function alertaPresupuestosSinRespuesta() {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName('Presupuestos de Reparacion');
    if (!sheet) return;
    const data      = sheet.getDataRange().getValues();
    const headers   = data[0];
    const hoy       = new Date();
    const zona      = Session.getScriptTimeZone();
    const colFecha   = buscarColumna(headers, 'fecha');
    const colCliente = buscarColumna(headers, 'gimnasio');
    const colEstado  = buscarColumna(headers, 'estado');
    const colTotal   = buscarColumna(headers, 'total');
    const viejos     = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colEstado]||'').trim() !== 'Pendiente') continue;
      const fechaObj = parseDateSeguro(data[i][colFecha]);
      if (!fechaObj) continue;
      const dias = Math.floor((hoy - fechaObj) / (1000*60*60*24));
      if (dias < 7) continue;
      viejos.push({ cliente: String(data[i][colCliente]||'—'), dias,
                    total: Number(data[i][colTotal]||0),
                    fecha: Utilities.formatDate(fechaObj, zona, 'dd/MM/yyyy') });
    }
    if (!viejos.length) { Logger.log('alertaPresupuestos: ninguno +7 dias.'); return; }
    viejos.sort((a,b) => b.dias - a.dias);
    const lineas = ['PRESUPUESTOS SIN RESPUESTA — ' + Utilities.formatDate(hoy, zona, 'dd/MM/yyyy'),
                    'Presupuestos con mas de 7 dias en estado Pendiente:', ''];
    viejos.forEach((p,i) => {
      lineas.push((i+1) + '. ' + p.cliente);
      lineas.push('   Enviado: ' + p.fecha + ' (' + p.dias + ' dias sin respuesta)');
      lineas.push('   Monto: ' + (p.total > 0 ? '$' + Math.round(p.total).toLocaleString() : '—'));
      lineas.push('');
    });
    lineas.push('Panel: https://supporfitness.vercel.app/Informes/');
    MailApp.sendEmail({ to: 'support_fitness@hotmail.com',
      subject: viejos.length + ' presupuesto(s) sin respuesta hace +7 dias',
      body: lineas.join('\n') });
    Logger.log('Alerta semanal OK. Viejos: ' + viejos.length);
  } catch(e) { Logger.log('alertaPresupuestosSinRespuesta ERROR: ' + e.toString()); }
}

// ── ENDPOINTS ─────────────────────────────────────────────────
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok", mensaje: "Support Fitness API v3.2 funcionando.",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    const peticion = JSON.parse(e.postData.contents);
    const accion   = peticion.accion;
    const payload  = peticion.payload;
    let resultado;
    if      (accion === "verificarPassword")              resultado = verificarPasswordServidor(payload.pass, payload.destino);
    else if (accion === "obtenerRegistroHistorico")        resultado = obtenerRegistroHistorico(payload);
    else if (accion === "obtenerDatosCalendarioWeb")       resultado = obtenerDatosCalendarioWeb();
    else if (accion === "procesarYGuardarTodo")            resultado = procesarYGuardarTodo(payload);
    else if (accion === "guardarDocumentoBD")              resultado = guardarDocumentoBD(payload);
    else if (accion === "obtenerDocumentosBD")             resultado = obtenerDocumentosBD(payload);
    else if (accion === "eliminarDocumentoBD")             resultado = eliminarDocumentoBD(payload);
    else if (accion === "sincronizarConBaseARCA")          resultado = sincronizarConBaseARCA();
    else if (accion === "obtenerAbonosBD")                 resultado = obtenerAbonosBD();
    else if (accion === "actualizarFacturaAbono")          resultado = actualizarFacturaAbono(payload);
    else if (accion === "actualizarPrecioDesde")           resultado = actualizarPrecioDesde(payload);
    else if (accion === "eliminarPrecioDesde")             resultado = eliminarPrecioDesde(payload);
    else if (accion === "verificarVersion")                resultado = verificarVersion();
    else if (accion === "obtenerHistorialAnual")           resultado = obtenerHistorialAnual(payload);
    else if (accion === "obtenerCronogramaDesdeSheet")     resultado = obtenerCronogramaDesdeSheet();
    else if (accion === "sincronizarHistorialEnZonas")     resultado = sincronizarHistorialEnZonas();
    else if (accion === "obtenerTapizadosPendientes")      resultado = obtenerTapizadosPendientes();
    else if (accion === "guardarCotizacionDetallada")      resultado = guardarCotizacionDetallada(payload);
    else if (accion === "obtenerPresupuestosArmados")      resultado = obtenerPresupuestosArmados();
    else if (accion === "actualizarEstadoPresupuesto")     resultado = actualizarEstadoPresupuesto(payload);
    else if (accion === "enviarCorreoAbono")               resultado = enviarCorreoAbono(payload);
    else if (accion === "guardarPresupuestoEmitido")       resultado = guardarPresupuestoEmitido(payload);
    else if (accion === "actualizarPlantillaYExportarPDF") resultado = actualizarPlantillaYExportarPDF(payload);
    // FIX ⑥: sincronizarFacturacionForm4 ahora también es alcanzable desde el frontend
    else if (accion === "sincronizarFacturacionForm4")     resultado = sincronizarFacturacionForm4(payload.gym, payload.fecha, payload.estado);
    else throw new Error("Acción no reconocida: " + accion);
    output.setContent(JSON.stringify({ status: "success", data: resultado }));
  } catch(error) {
    Logger.log("ERROR doPost: " + error.message);
    output.setContent(JSON.stringify({ status: "error", message: error.message }));
  }
  return output;
}

// ── NOTIFICACIONES ────────────────────────────────────────────
function enviarResumenVisitas() {
  const sheet              = getHojaPrincipal();
  const ultimaFilaActual   = sheet.getLastRow();
  const props              = PropertiesService.getScriptProperties();
  let ultimaFilaNotificada = Number(props.getProperty("ULTIMA_FILA_NOTIFICADA"));
  if (!ultimaFilaNotificada) {
    props.setProperty("ULTIMA_FILA_NOTIFICADA", ultimaFilaActual); return;
  }
  if (ultimaFilaActual <= ultimaFilaNotificada) return;
  const cantNuevas  = ultimaFilaActual - ultimaFilaNotificada;
  const datosNuevos = sheet.getRange(ultimaFilaNotificada+1,1,cantNuevas,sheet.getLastColumn()).getValues();
  const headers     = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const idxTecnico  = buscarColumna(headers, "técnico");
  const idxGym      = buscarColumna(headers, "gimnasio");
  const idxMotivo   = buscarColumna(headers, "motivo");
  let cuerpoEmail = `<div style="font-family:Arial,sans-serif;color:#3c4043;padding:20px;
    border:1px solid #dadce0;border-radius:8px;max-width:600px;">
    <h2 style="color:#1a73e8;margin-top:0;">Nuevos Registros en Support Fitness</h2>
    <p>Hola Facundo, se registraron <b>${cantNuevas}</b> visita(s):</p>
    <ul style="background:#f8f9fa;padding:15px 15px 15px 35px;border-radius:8px;border-left:4px solid #34a853;">`;
  for (let i = 0; i < datosNuevos.length; i++) {
    cuerpoEmail += `<li style="margin-bottom:10px;"><b>${datosNuevos[i][idxGym]||'—'}</b>
      — Técnico: ${datosNuevos[i][idxTecnico]||'—'}
      <br><i style="color:#5f6368;font-size:13px;">Motivo: ${datosNuevos[i][idxMotivo]||'—'}</i></li>`;
  }
  cuerpoEmail += `</ul><p style="color:#999;font-size:12px;border-top:1px solid #eee;
    padding-top:10px;margin-top:20px;">Sincronizado desde la App de Visitas.</p></div>`;
  MailApp.sendEmail({ to: "duranfacundo20102005@gmail.com",
    subject: `🔔 Support Fitness: ${cantNuevas} nuevas visitas`, htmlBody: cuerpoEmail });
  props.setProperty("ULTIMA_FILA_NOTIFICADA", ultimaFilaActual);
}

function activarAlarmaDeNotificaciones() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "enviarResumenVisitas") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("enviarResumenVisitas").timeBased().everyHours(2).create();
}

// ── ABONOS BD ─────────────────────────────────────────────────
function obtenerAbonosBD() {
  const ss          = getSpreadsheet();
  const sheet       = ss.getSheetByName(PLANILLA_ABONOS);
  if (!sheet) return [];
  const maxRows     = Math.max(sheet.getLastRow(), 1);
  const range       = sheet.getRange(1,1,maxRows,22);
  const data        = range.getValues();
  const backgrounds = range.getBackgrounds();
  const abonos      = [];
  for (let i = 0; i < data.length; i++) {
    const ordenVal = String(data[i][0]||"").trim();
    if (!ordenVal) continue;
    if (ordenVal.toLowerCase().includes("orden") || ordenVal.toLowerCase().includes("abono")) continue;
    let historialObj = {};
    try { historialObj = JSON.parse(data[i][9]||"{}"); } catch(e) {}
    const coloresMeses  = [];
    const facturasMeses = [];
    for (let m = 0; m < 12; m++) {
      coloresMeses.push(String(backgrounds[i][10+m]));
      facturasMeses.push(String(data[i][10+m]||""));
    }
    abonos.push({
      orden: data[i][0], gym: data[i][1], tipoFact: data[i][2],
      cuit:  data[i][3], precio: data[i][4],
      pideRemito: String(data[i][5]).trim().toUpperCase() === "SI",
      pideOC:     String(data[i][6]).trim().toUpperCase() === "SI",
      mesIncrem: data[i][7], correo: data[i][8],
      historial: historialObj, preciosHistorial: historialObj.precios||[],
      coloresMeses, facturasMeses
    });
  }
  return abonos;
}

function actualizarFacturaAbono(payload) {
  if (!payload || !payload.orden) return "ERROR";
  const sheet = getSpreadsheet().getSheetByName("Base Abonos");
  if (!sheet) return "ERROR";
  const data     = sheet.getDataRange().getValues();
  const mesNum   = parseInt((payload.mesAnio||"1/2026").split("/")[0], 10);
  const colIndex = 10 + mesNum - 1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.orden)) {
      const cell = sheet.getRange(i+1, colIndex+1);
      if (payload.datosMes.factura !== undefined) cell.setValue(payload.datosMes.factura);
      if (payload.datosMes.enviado === true)  cell.setBackground("#93c47d");
      if (payload.datosMes.enviado === false) cell.setBackground("#ffffff");
      return "OK";
    }
  }
  return "ERROR: Orden no encontrada.";
}

function actualizarPrecioDesde(payload) {
  if (!payload || !payload.orden || !payload.desde || payload.precio == null)
    return "ERROR: datos incompletos";
  const sheet = getSpreadsheet().getSheetByName("Base Abonos");
  if (!sheet) return "ERROR";
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.orden)) {
      let h = {};
      try { h = JSON.parse(data[i][9]||"{}"); } catch(e) {}
      if (!h.precios) h.precios = [];
      h.precios = h.precios.filter(e => e.desde !== payload.desde);
      h.precios.push({ desde: payload.desde, precio: Number(payload.precio) });
      h.precios.sort((a,b) => {
        const [am,ay] = a.desde.split('/').map(Number);
        const [bm,by] = b.desde.split('/').map(Number);
        return (ay*12+am) - (by*12+bm);
      });
      sheet.getRange(i+1,10).setValue(JSON.stringify(h));
      return "OK: precio registrado";
    }
  }
  return "ERROR: orden no encontrada";
}

function eliminarPrecioDesde(payload) {
  if (!payload || !payload.orden || !payload.desde) return "ERROR: datos incompletos";
  const sheet = getSpreadsheet().getSheetByName("Base Abonos");
  if (!sheet) return "ERROR";
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.orden)) {
      let h = {};
      try { h = JSON.parse(data[i][9]||"{}"); } catch(e) {}
      if (h.precios) h.precios = h.precios.filter(e => e.desde !== payload.desde);
      sheet.getRange(i+1,10).setValue(JSON.stringify(h));
      return "OK";
    }
  }
  return "ERROR: orden no encontrada";
}

// ── ARCA ──────────────────────────────────────────────────────
function sincronizarConBaseARCA() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Sincronización en curso. Esperá unos segundos.");
  try {
    const ss          = getSpreadsheet();
    const sheetPresup = ss.getSheetByName("Presupuestos de Reparacion");
    const sheetARCA   = ss.getSheetByName("Base ARCA");
    const sheetAbonos = ss.getSheetByName("Base Abonos");
    if (!sheetARCA) throw new Error("No se encontró la pestaña 'Base ARCA'.");

    function esMesActivo(c) {
      if (!c) return true;
      c = String(c).toLowerCase();
      return c==='#ffffff'||c.includes('fff')||c==='#6aa84f'||c==='#93c47d'||
             c==='#34a853'||c==='#0f9d58'||c==='#b6d7a8';
    }
    function detectarFrecuenciaBackend(coloresMeses) {
      const colores = coloresMeses || Array(12).fill("#ffffff");
      let primerActivo = -1;
      for (let i = 0; i < 12; i++) { if (esMesActivo(colores[i])) { primerActivo=i; break; } }
      if (primerActivo === -1) return "Mensual";
      let negros = 0;
      for (let i = primerActivo+1; i < 12; i++) {
        if (!esMesActivo(colores[i])) negros++; else break;
      }
      if (negros >= 2) return "Trimestral";
      if (negros === 1) return "Bimestral";
      return "Mensual";
    }

    let dictAbonosNro = {};
    if (sheetAbonos) {
      const maxRows = Math.max(sheetAbonos.getLastRow(),1);
      const rangeAb = sheetAbonos.getRange(1,1,maxRows,22);
      const dataAb  = rangeAb.getValues();
      const bgAb    = rangeAb.getBackgrounds();
      for (let i = 0; i < dataAb.length; i++) {
        if (!dataAb[i][0] || String(dataAb[i][0]).toLowerCase().includes("orden") ||
            String(dataAb[i][0]).toLowerCase().includes("abono")) continue;
        const gymName = dataAb[i][1];
        const colores = [];
        for (let m = 0; m < 12; m++) colores.push(String(bgAb[i][10+m]));
        for (let m = 0; m < 12; m++) {
          const numF = String(dataAb[i][10+m]).trim();
          if (numF) dictAbonosNro[numF.slice(-4)] = { gym: gymName, mesNum: m+1, colores };
        }
      }
    }

    const datosPresup = sheetPresup.getDataRange().getValues();
    const headersP    = datosPresup[0];
    const datosARCA   = sheetARCA.getDataRange().getValues();
    const headersA    = datosARCA[0];

    const colFechaA = buscarColumna(headersA,"fecha");
    const colTipoA  = buscarColumna(headersA,"tipo");
    const colCuitA  = buscarColumna(headersA,"cuit");
    const colTotalA = buscarColumna(headersA,"importe");
    const colNroA   = buscarColumna(headersA,"número")!==-1 ? buscarColumna(headersA,"número") : buscarColumna(headersA,"numero");
    const colIdP    = buscarColumna(headersP,"id")!==-1      ? buscarColumna(headersP,"id")      : 0;
    const colFechaP = buscarColumna(headersP,"fecha")!==-1   ? buscarColumna(headersP,"fecha")   : 1;
    const colClienteP = buscarColumna(headersP,"gimnasio")!==-1 ? buscarColumna(headersP,"gimnasio") : 2;
    const colTotalP = buscarColumna(headersP,"total")!==-1   ? buscarColumna(headersP,"total")   : 4;
    const colItemsP = buscarColumna(headersP,"item")!==-1    ? buscarColumna(headersP,"item")    : 5;
    const colEstadoP = buscarColumna(headersP,"estado")!==-1 ? buscarColumna(headersP,"estado")  : 6;
    const colPagadoP = buscarColumna(headersP,"pagado")!==-1 ? buscarColumna(headersP,"pagado")  : 7;
    const colCuitP  = buscarColumna(headersP,"cuit")!==-1    ? buscarColumna(headersP,"cuit")    : 8;
    const colFacturaP = buscarColumna(headersP,"factura")!==-1 ? buscarColumna(headersP,"factura") : 10;

    const arcaValida = [];
    for (let j = 1; j < datosARCA.length; j++) {
      const cuit    = String(datosARCA[j][colCuitA]).replace(/\D/g,"");
      const importe = Math.round(Number(datosARCA[j][colTotalA]));
      const tipoRaw = String(datosARCA[j][colTipoA]).trim().toUpperCase();
      const nroStr  = String(datosARCA[j][colNroA]).trim();
      const fechaRaw = datosARCA[j][colFechaA];
      if (!cuit || isNaN(importe) || importe===0 || !nroStr) continue;
      let fechaObj = new Date(0);
      if (fechaRaw instanceof Date) { fechaObj = fechaRaw; }
      else {
        const partes = String(fechaRaw).split("/");
        if (partes.length===3) fechaObj = new Date(partes[2], partes[1]-1, partes[0]);
      }
      let letra = "C";
      if (tipoRaw.includes(" A")) letra="A";
      else if (tipoRaw.includes(" B")) letra="B";
      const isNC = tipoRaw.includes("NOTA DE")||tipoRaw.includes("CRÉDITO")||tipoRaw.includes("CREDITO");
      arcaValida.push({ cuit, importe, tipoOriginal: tipoRaw,
        nroFinal: (isNC?"NC ":"")+letra+"-"+nroStr.slice(-4),
        fechaObj, fechaStr: fechaRaw, utilizada: false, isNC });
    }

    const notasCredito = arcaValida.filter(a => a.isNC);
    const facturas     = arcaValida.filter(a => !a.isNC);
    for (const nc of notasCredito) {
      const posibles = facturas.filter(f => !f.utilizada && f.cuit===nc.cuit && f.importe===nc.importe);
      if (posibles.length > 0) {
        posibles.sort((a,b) => Math.abs(a.fechaObj-nc.fechaObj) - Math.abs(b.fechaObj-nc.fechaObj));
        posibles[0].utilizada = true; nc.utilizada = true;
      }
    }

    const facturasFinales       = facturas.filter(f => !f.utilizada);
    let vinculados              = 0;
    const nuevasFilas           = [];
    const facturasYaExistentes  = new Set();
    const mapPresupPendientes   = new Map();

    for (let i = 1; i < datosPresup.length; i++) {
      const cP = String(datosPresup[i][colCuitP]).replace(/\D/g,"");
      const tP = Math.round(Number(datosPresup[i][colTotalP]));
      const fP = String(datosPresup[i][colFacturaP]||"").trim();
      if (fP) { facturasYaExistentes.add(fP); }
      else if (cP && tP) {
        const key = `${cP}_${tP}`;
        if (!mapPresupPendientes.has(key)) mapPresupPendientes.set(key,[]);
        mapPresupPendientes.get(key).push(i);
      }
    }

    const currentTime = Date.now();
    for (let index = 0; index < facturasFinales.length; index++) {
      const f = facturasFinales[index];
      if (facturasYaExistentes.has(f.nroFinal)) continue;
      const keyExacta    = `${f.cuit}_${f.importe}`;
      let matchIndex     = -1;
      const posiblesKeys = [keyExacta, `${f.cuit}_${f.importe+1}`, `${f.cuit}_${f.importe-1}`];
      for (const k of posiblesKeys) {
        if (mapPresupPendientes.has(k) && mapPresupPendientes.get(k).length > 0) {
          matchIndex = mapPresupPendientes.get(k).shift(); break;
        }
      }
      if (matchIndex !== -1) {
        datosPresup[matchIndex][colEstadoP]  = "Facturado / Aprobado";
        datosPresup[matchIndex][colFacturaP] = f.nroFinal;
        vinculados++; facturasYaExistentes.add(f.nroFinal);
      } else {
        let fStr = f.fechaStr;
        if (f.fechaObj.getTime() > 0 && !(f.fechaStr instanceof Date)) {
          fStr = Utilities.formatDate(f.fechaObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else if (f.fechaStr instanceof Date) {
          fStr = Utilities.formatDate(f.fechaStr, Session.getScriptTimeZone(), "dd/MM/yyyy");
        }
        let itemDesc      = "Pendiente de edición...";
        let nombreCliente = "⚠️ IMPORTADO ARCA";
        let abonoMatch    = dictAbonosNro[(f.nroFinal.split("-")[1]||f.nroFinal).slice(-4)];
        if (!abonoMatch && f.cuit && sheetAbonos) {
          const maxRows2 = Math.max(sheetAbonos.getLastRow(),1);
          const dataAb2  = sheetAbonos.getRange(1,1,maxRows2,22).getValues();
          const bgAb2    = sheetAbonos.getRange(1,1,maxRows2,22).getBackgrounds();
          for (let i = 0; i < dataAb2.length; i++) {
            if (!dataAb2[i][0] || String(dataAb2[i][0]).toLowerCase().includes("orden")) continue;
            const cuitAbono = String(dataAb2[i][3]).replace(/\D/g,"");
            if (cuitAbono && cuitAbono === f.cuit) {
              const cols = [];
              for (let mm = 0; mm < 12; mm++) cols.push(String(bgAb2[i][10+mm]));
              abonoMatch = { gym: dataAb2[i][1], mesNum: f.fechaObj.getMonth()+1, colores: cols };
              break;
            }
          }
        }
        if (abonoMatch) {
          const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                         "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
          let mIdx = abonoMatch.mesNum-1;
          let periodo = meses[mIdx];
          const frec  = detectarFrecuenciaBackend(abonoMatch.colores);
          if (frec==="Bimestral")  periodo += " - " + meses[(mIdx+1)%12];
          if (frec==="Trimestral") periodo += " - " + meses[(mIdx+1)%12] + " - " + meses[(mIdx+2)%12];
          const anio = f.fechaObj.getFullYear() > 2000 ? f.fechaObj.getFullYear() : new Date().getFullYear();
          itemDesc      = `Mantenimiento preventivo del gimnasio correspondiente al periodo ${periodo} ${anio}.`;
          nombreCliente = abonoMatch.gym;
        }
        const filaNueva = new Array(Math.max(headersP.length,11)).fill("");
        filaNueva[colIdP]       = currentTime + index;
        filaNueva[colFechaP]    = fStr;
        filaNueva[colClienteP]  = nombreCliente;
        filaNueva[colTotalP]    = f.importe;
        filaNueva[colItemsP]    = JSON.stringify([{tipo:f.tipoOriginal,desc:itemDesc,cant:1,precio:f.importe}]);
        filaNueva[colEstadoP]   = "Facturado / Aprobado";
        filaNueva[colPagadoP]   = "Pendiente";
        filaNueva[colCuitP]     = f.cuit;
        filaNueva[colFacturaP]  = f.nroFinal;
        nuevasFilas.push(filaNueva);
        facturasYaExistentes.add(f.nroFinal);
      }
    }
    if (vinculados > 0) sheetPresup.getRange(1,1,datosPresup.length,datosPresup[0].length).setValues(datosPresup);
    if (nuevasFilas.length > 0) sheetPresup.getRange(sheetPresup.getLastRow()+1,1,nuevasFilas.length,nuevasFilas[0].length).setValues(nuevasFilas);
    return `ARCA Analizada: Se vincularon ${vinculados} y se importaron ${nuevasFilas.length} nuevas. 🚀`;
  } finally { lock.releaseLock(); }
}

// ── TAPIZADOS ─────────────────────────────────────────────────
function obtenerTapizadosPendientes() {
  const sheet = getSpreadsheet().getSheetByName("Tapizados");
  if (!sheet) return [];
  const data       = sheet.getDataRange().getValues();
  const pendientes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][11]).trim() !== "Pendiente") continue;
    const fotosArr = String(data[i][4]).split(",").filter(f => f.trim());
    const fObj     = data[i][1];
    const fStr     = (fObj instanceof Date)
      ? Utilities.formatDate(fObj, Session.getScriptTimeZone(), "dd/MM/yyyy")
      : String(fObj);
    pendientes.push({ fila:i+1, remito:data[i][0], fecha:fStr,
                      gym:data[i][2], tecnico:data[i][3], fotos:fotosArr });
  }
  return pendientes;
}

function guardarCotizacionDetallada(payload) {
  const sheet = getSpreadsheet().getSheetByName("Tapizados");
  if (!sheet) return "No hay hoja";
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.remito)) {
      sheet.getRange(i+1,6).setValue(payload.urls.join(", "));
      sheet.getRange(i+1,7).setValue(payload.descripciones.join("\n"));
      sheet.getRange(i+1,8).setValue(payload.precios.join("\n"));
      sheet.getRange(i+1,9).setValue(payload.subtotales.join("\n"));
      sheet.getRange(i+1,10).setValue(payload.totalT);
      sheet.getRange(i+1,11).setValue(payload.totalC);
      sheet.getRange(i+1,12).setValue("Cotizado");
      return "Cotización Guardada ✅";
    }
  }
  return "Remito no encontrado";
}

function obtenerPresupuestosArmados() {
  const sheet = getSpreadsheet().getSheetByName("Tapizados");
  if (!sheet) return [];
  const data    = sheet.getDataRange().getValues();
  const armados = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][11]).trim() !== "Cotizado") continue;
    const fObj = data[i][1];
    const fStr = (fObj instanceof Date)
      ? Utilities.formatDate(fObj, Session.getScriptTimeZone(), "dd/MM/yyyy")
      : String(fObj);
    armados.push({ fila:i+1, remito:data[i][0], fecha:fStr, gym:data[i][2],
      detalle:     String(data[i][6]).split("\n"),
      precios:     String(data[i][7]).split("\n"),
      subtotales:  String(data[i][8]).split("\n"),
      totalTapicero: data[i][9], totalCliente: data[i][10] });
  }
  return armados;
}

function actualizarEstadoPresupuesto(payload) {
  const sheet = getSpreadsheet().getSheetByName("Tapizados");
  if (!sheet) return "No hay hoja";
  if (payload.accion === "enviar") {
    sheet.getRange(payload.fila,12).setValue("Enviado al Cliente");
    return "Marcado como enviado";
  }
  if (payload.accion === "actualizar") {
    sheet.getRange(payload.fila,11).setValue(payload.nuevoPrecio);
    return "Precio actualizado ✅";
  }
  return "Acción inválida";
}

// ── ZONAS ─────────────────────────────────────────────────────
function sincronizarHistorialEnZonas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return "⚠️ Sincronización en curso. Esperá y reintentá.";
  try {
    const ss             = getSpreadsheet();
    const sheetPrincipal = getHojaPrincipal();
    const datos          = sheetPrincipal.getDataRange().getValues();
    if (datos.length < 2) return "Sin registros en la hoja principal.";
    const headers    = datos[0];
    const idxFecha   = buscarColumna(headers,"marca temporal");
    const idxGym     = buscarColumna(headers,"gimnasio");
    const idxMotivo  = buscarColumna(headers,"motivo");
    if (idxFecha===-1||idxGym===-1) return "❌ Columnas no encontradas.";
    const nombresZonas = ["Zona 1","Zona 2","Zona 3","Zona 4","Zona 5"];
    const COL_NOMBRE   = 1, COL_MES_INI = 2, FILA_DATOS = 3;
    const mapaGym      = {};
    nombresZonas.forEach(nombre => {
      const sheet = ss.getSheetByName(nombre);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow < FILA_DATOS) return;
      const vals = sheet.getRange(FILA_DATOS,1,lastRow-FILA_DATOS+1,14).getValues();
      for (let r = 0; r < vals.length; r++) {
        const nroStr    = String(vals[r][0]||"").trim();
        if (!nroStr||isNaN(nroStr)) continue;
        const nombreGym = String(vals[r][COL_NOMBRE]||"").trim();
        if (!nombreGym) continue;
        const gymNorm   = normalizarTexto(nombreGym);
        if (!mapaGym[gymNorm]) mapaGym[gymNorm] = { sheet, filaSheet: FILA_DATOS+r };
      }
    });
    const acumulado  = {};
    const añoActual  = new Date().getFullYear();
    for (let i = 1; i < datos.length; i++) {
      const fechaObj = parseDateSeguro(datos[i][idxFecha]);
      if (!fechaObj||fechaObj.getFullYear()!==añoActual) continue;
      const motivoRaw = idxMotivo!==-1 ? String(datos[i][idxMotivo]||"").toLowerCase() : "";
      if (!motivoRaw.includes("preventivo") && !motivoRaw.includes(" mp")) continue;
      const gymNorm = normalizarTexto(String(datos[i][idxGym]||"").trim());
      if (!mapaGym[gymNorm]) continue;
      const mesIdx = fechaObj.getMonth(), dia = fechaObj.getDate();
      if (!acumulado[gymNorm]) acumulado[gymNorm] = {};
      if (!acumulado[gymNorm][mesIdx]) acumulado[gymNorm][mesIdx] = new Set();
      acumulado[gymNorm][mesIdx].add(dia);
    }
    let celdasActualizadas = 0, celdasCorrectas = 0;
    for (const gymNorm in acumulado) {
      const { sheet, filaSheet } = mapaGym[gymNorm];
      for (const mesIdxStr in acumulado[gymNorm]) {
        const mesIdx     = parseInt(mesIdxStr,10);
        const diasNuevos = acumulado[gymNorm][mesIdx];
        const colSheet   = COL_MES_INI+1+mesIdx;
        const celda      = sheet.getRange(filaSheet,colSheet);
        const valorActual = String(celda.getValue()||"").trim();
        const diasActuales = new Set();
        if (valorActual && !["B","T","M"].includes(valorActual)) {
          valorActual.split(",").forEach(d => {
            const n = parseInt(d.trim(),10);
            if (!isNaN(n)&&n>=1&&n<=31) diasActuales.add(n);
          });
        }
        const diasUnion = new Set([...diasActuales,...diasNuevos]);
        if (diasUnion.size===diasActuales.size && [...diasNuevos].every(d=>diasActuales.has(d))) {
          celdasCorrectas++; continue;
        }
        celda.setValue([...diasUnion].sort((a,b)=>a-b).join(", "));
        celda.setBackground("#1a73e8").setFontColor("#ffffff").setFontWeight("bold");
        celdasActualizadas++;
      }
    }
    const cache = CacheService.getScriptCache();
    cache.remove("cronograma_zonas_v2");
    cache.remove("historial_visitas_turbo");
    return `✅ Sincronización completa.\n• Celdas actualizadas: ${celdasActualizadas}\n• Celdas ya correctas: ${celdasCorrectas}\n• Gimnasios reconocidos: ${Object.keys(acumulado).length}`;
  } catch(e) { return "❌ Error: " + e.message; }
  finally { lock.releaseLock(); }
}

function verificarVersion() {
  const props = PropertiesService.getScriptProperties();
  return {
    versionActual: parseFloat(props.getProperty("VERSION_ACTUAL")||"1.0"),
    linkDescarga:  props.getProperty("LINK_DESCARGA_APK")||"",
    mensaje:       props.getProperty("MENSAJE_ACTUALIZACION")||"Hay una nueva versión disponible."
  };
}

function obtenerHistorialAnual(payload) {
  try {
    const ss    = getSpreadsheet();
    let sheet   = ss.getSheetByName("Historial Anual");
    if (!sheet) {
      sheet = ss.insertSheet("Historial Anual");
      const headers = ["Fecha","Gimnasio","Técnico","Motivo","Remito","Año","Mes","Día"];
      sheet.appendRow(headers);
      sheet.getRange("A1:H1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
      return [];
    }
    const datos    = sheet.getDataRange().getValues();
    if (datos.length < 2) return [];
    const headers  = datos[0];
    const idxFecha = buscarColumna(headers,"fecha");
    const idxGym   = buscarColumna(headers,"gimnasio");
    const idxMotivo = buscarColumna(headers,"motivo");
    const idxAño   = buscarColumna(headers,"año");
    const idxMes   = buscarColumna(headers,"mes");
    const idxDia   = buscarColumna(headers,"día")!==-1 ? buscarColumna(headers,"día") : buscarColumna(headers,"dia");
    const zona     = Session.getScriptTimeZone();
    const historial = [];
    for (let i = 1; i < datos.length; i++) {
      const row = datos[i];
      if (idxAño!==-1&&idxMes!==-1&&idxDia!==-1&&row[idxAño]) {
        historial.push({
          gym:      normalizarTexto(String(row[idxGym]||"")),
          año:      Number(row[idxAño]),
          mes:      Number(row[idxMes])-1,
          dia:      Number(row[idxDia]),
          fechaStr: String(row[idxFecha]||""),
          motivo:   idxMotivo!==-1 ? String(row[idxMotivo]||"") : ""
        });
      } else if (idxFecha!==-1&&row[idxFecha]) {
        const fechaObj = parseDateSeguro(row[idxFecha]);
        if (!fechaObj) continue;
        historial.push({
          gym:      normalizarTexto(String(row[idxGym]||"")),
          año:      fechaObj.getFullYear(),
          mes:      fechaObj.getMonth(),
          dia:      fechaObj.getDate(),
          fechaStr: Utilities.formatDate(fechaObj, zona, "dd/MM/yyyy"),
          motivo:   idxMotivo!==-1 ? String(row[idxMotivo]||"") : ""
        });
      }
    }
    return historial;
  } catch(e) { Logger.log("ERROR obtenerHistorialAnual: " + e.message); return []; }
}

function obtenerCronogramaDesdeSheet() {
  try {
    const ss           = getSpreadsheet();
    const nombresZonas = ["Zona 1","Zona 2","Zona 3","Zona 4","Zona 5"];
    const COL_NOMBRE   = 1, COL_MES_INI = 2, FILA_DATOS = 2;
    const AÑO_GRILLA   = new Date().getFullYear();
    const zonas        = [], historial = [];

    function esNegro(colorHex) {
      if (!colorHex) return false;
      const c = String(colorHex).toLowerCase().trim();
      if (['#000000','#0d0d0d','#1c1c1c','#1a1a1a','#434343','#222222','#111111','#333333'].includes(c)) return true;
      if (c.startsWith('#') && c.length===7) {
        const r=parseInt(c.slice(1,3),16), g=parseInt(c.slice(3,5),16), b=parseInt(c.slice(5,7),16);
        if (!isNaN(r) && r<80 && g<80 && b<80) return true;
      }
      return false;
    }
    function detectarFrecuencia(coloresMes12) {
      let primerActivo = -1;
      for (let m=0; m<12; m++) { if (!esNegro(coloresMes12[m])) { primerActivo=m; break; } }
      if (primerActivo===-1) return { freq:"Mensual", mesInicio:0 };
      let negros = 0;
      for (let m=primerActivo+1; m<12; m++) { if (esNegro(coloresMes12[m])) negros++; else break; }
      return { freq: negros>=2?"Trimestral":negros===1?"Bimestral":"Mensual", mesInicio: primerActivo };
    }

    nombresZonas.forEach(nombreZona => {
      const sheet = ss.getSheetByName(nombreZona);
      if (!sheet) return;
      const lastRow = sheet.getLastRow();
      if (lastRow < 3) return;
      const cantFilas   = lastRow - FILA_DATOS;
      const range       = sheet.getRange(FILA_DATOS+1,1,cantFilas,14);
      const valores     = range.getValues();
      const colores     = range.getBackgrounds();
      const clientesZona = [];
      for (let r = 0; r < valores.length; r++) {
        const fila        = valores[r];
        const coloresFila = colores[r];
        const nroStr      = String(fila[0]||"").trim();
        if (!nroStr||isNaN(nroStr)) continue;
        const nombreGym   = String(fila[COL_NOMBRE]||"").trim();
        if (!nombreGym) continue;
        const coloresMeses = coloresFila.slice(COL_MES_INI, COL_MES_INI+12);
        const { freq, mesInicio } = detectarFrecuencia(coloresMeses);
        clientesZona.push({ nombre: nombreGym, freq, mesInicio });
        for (let m = 0; m < 12; m++) {
          const cellVal = String(fila[COL_MES_INI+m]||"").trim();
          if (!cellVal||["B","T","M"].includes(cellVal)||esNegro(coloresMeses[m])) continue;
          cellVal.split(",").forEach(p => {
            const dia = parseInt(p.trim(),10);
            if (!isNaN(dia)&&dia>=1&&dia<=31) {
              historial.push({ gym: normalizarTexto(nombreGym), año: AÑO_GRILLA,
                               mes:m, dia, fechaStr:"", motivo:"mantenimiento preventivo" });
            }
          });
        }
      }
      if (clientesZona.length > 0) zonas.push({ zona: nombreZona, clientes: clientesZona });
    });

    const cache     = CacheService.getScriptCache();
    const resultado = { zonas, historial };
    try {
      const json = JSON.stringify(resultado);
      if (json.length < 90000) cache.put("cronograma_zonas_v2", json, 3600);
    } catch(ec) {}
    return resultado;
  } catch(e) {
    Logger.log("obtenerCronogramaDesdeSheet ERROR: " + e.message);
    return { zonas:[], historial:[] };
  }
}

// ── FIX ⑦: registrarEnHistorialAnual limpio ───────────────────
function registrarEnHistorialAnual(fecha, gimnasio, tecnico, motivo, remito) {
  try {
    const ss       = getSpreadsheet();
    const zona     = Session.getScriptTimeZone();
    const año      = fecha.getFullYear();
    const mes      = fecha.getMonth()+1;
    const dia      = fecha.getDate();
    let sheetH     = ss.getSheetByName("Historial Anual");
    if (!sheetH) {
      sheetH = ss.insertSheet("Historial Anual");
      sheetH.appendRow(["Fecha","Gimnasio","Técnico","Motivo","Remito","Año","Mes","Día"]);
      sheetH.getRange("A1:H1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
      sheetH.setFrozenRows(1);
    }
    sheetH.appendRow([Utilities.formatDate(fecha,zona,"dd/MM/yyyy HH:mm"), gimnasio, tecnico, motivo, remito, año, mes, dia]);
    const cache = CacheService.getScriptCache();
    cache.remove("historial_visitas_turbo");
    cache.remove("historial_anual_cache");
  } catch(e) { Logger.log("ERROR registrarEnHistorialAnual: " + e.message); }
}

// ── CORREOS Y PDF ─────────────────────────────────────────────
function gestionarPeticionWeb(e) {
  try {
    const params  = JSON.parse(e.postData.contents);
    const accion  = params.accion;
    const payload = params.payload;
    if (accion === "enviarCorreoAbono")
      return ContentService.createTextOutput(JSON.stringify(enviarMailAbonoMensual(payload))).setMimeType(ContentService.MimeType.JSON);
    if (accion === "enviarPresupuestoActivo")
      return ContentService.createTextOutput(JSON.stringify(generarYEnviarPDFPresupuesto(payload))).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function enviarMailAbonoMensual(payload) {
  const correoDestino = payload.correoCliente || "support_fitness@hotmail.com";
  const mesAnio       = payload.mesAnio || "Periodo Actual";
  const gimnasio      = payload.gimnasio || "Gimnasio Cliente";
  const asunto        = `Envío de Factura - Mantenimiento Preventivo ${gimnasio}`;
  const cuerpoTexto   = `Buenas tardes, Señores de administración.\n\nAdjunto factura por el mantenimiento preventivo del Gimnasio periodo ${mesAnio} y número de cuenta para realizar transferencia a la brevedad.\n\nPor favor, confirmar recepción.\n\nCordiales saludos.\nFacundo Durán\n\nSUPPORT FITNESS\nSERVICIO TÉCNICO PARA GIMNASIOS.\nCEL. 11 6117-7878.`;
  try {
    MailApp.sendEmail({ to: correoDestino, subject: asunto, body: cuerpoTexto });
    return { ok:true, mensaje:"Correo de Abono enviado a " + correoDestino };
  } catch(error) { return { ok:false, error:error.toString() }; }
}

function generarYEnviarPDFPresupuesto(payload) {
  const ss    = SpreadsheetApp.openById(ID_PLANILLA);
  const sheet = ss.getSheetByName(PLANILLA_PRESUPUESTO);
  if (!sheet) return { ok:false, error:"No se encontró la pestaña: " + PLANILLA_PRESUPUESTO };
  const datosFormulario = sheet.getDataRange().getValues();
  let cliente      = "Cliente";
  const tipoMensaje = payload.tipo || "Presupuesto";
  for (let i = 0; i < datosFormulario.length; i++)
    for (let j = 0; j < datosFormulario[i].length; j++)
      if (String(datosFormulario[i][j]).includes("CLIENTE :"))
        cliente = String(datosFormulario[i][j]).replace("CLIENTE :","").trim();
  const exportOptions = { exportFormat:'pdf',format:'pdf',size:'letter',portrait:'true',
    fitw:'true',gridlines:'false',printtitle:'false',sheetnames:'false',fzr:'false',
    gid: sheet.getSheetId() };
  const exportUrl = ss.getUrl().replace(/edit$/,'') + 'export?' +
    Object.entries(exportOptions).map(([k,v]) => k+'='+v).join('&');
  const response = UrlFetchApp.fetch(exportUrl, {
    headers:{'Authorization':'Bearer '+ScriptApp.getOAuthToken()}, muteHttpExceptions:true });
  const blob = response.getBlob().setName(`Presupuesto_${cliente}_${new Date().toLocaleDateString('es-AR')}.pdf`);
  let cuerpoTexto = tipoMensaje==="Reparacion"
    ? `Buenas tardes, Señores de administración.\n\nAdjunto presupuesto solicitado para realizar la reparación en el gimnasio. Esperamos su confirmación para hacerle su factura correspondiente.\n\nPor favor, confirmar recepción.\n\nCordiales saludos.\n\nFacundo Durán\nSUPPORT FITNESS\nSERVICIO TÉCNICO PARA GIMNASIOS.\nCEL. 11 6117-7878.`
    : `Buenas tardes, Señores de administración.\n\nAdjunto presupuesto solicitado para realizar reparaciones en los equipos del gimnasio, una vez aprobado emitiremos la factura correspondiente para su posterior transferencia.\n\nCordiales saludos.\nFacundo Durán\nSUPPORT FITNESS\nSERVICIO TÉCNICO PARA GIMNASIOS.`;
  const correoDestino = payload.correoCliente || "support_fitness@hotmail.com";
  try {
    MailApp.sendEmail({ to:correoDestino, subject:`Presupuesto Solicitado - SUPPORT FITNESS (${cliente})`,
                        body:cuerpoTexto, attachments:[blob] });
    return { ok:true, mensaje:`PDF enviado a ${correoDestino}` };
  } catch(err) { return { ok:false, error:err.toString() }; }
}

// ── FIX ⑧: lock.releaseLock() duplicado eliminado ────────────
function actualizarPlantillaYExportarPDF(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000))
    return { ok:false, error:"Otro PDF se está generando. Esperá e intentá de nuevo." };
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName(PLANILLA_PRESUPUESTO);
    if (!sheet) return { ok:false, error:"No se encontró la hoja '"+PLANILLA_PRESUPUESTO+"'." };

    const zona    = Session.getScriptTimeZone();
    const cliente = String(payload.cliente||"").toUpperCase();
    const cuit    = String(payload.cuit||"");
    const fecha   = String(payload.fecha||Utilities.formatDate(new Date(),zona,"dd/MM/yyyy"));
    const items   = payload.items || [];
    const total   = Number(payload.total||0);
    const sinIVA  = total > 0 ? total/1.21 : 0;
    const ivaVal  = total > 0 ? total-sinIVA : 0;
    const fmtARS  = n => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,".");

    let data = sheet.getDataRange().getValues();
    function updateCell(searchText, newValue) {
      for (let r=0; r<data.length; r++)
        for (let c=0; c<data[r].length; c++)
          if (String(data[r][c]).includes(searchText)) {
            sheet.getRange(r+1,c+1).setValue(newValue); return;
          }
    }

    updateCell("CLIENTE :", "CLIENTE : "+cliente+(cuit?"  ·  CUIT: "+cuit:""));
    updateCell("FECHA :",   "FECHA : "+fecha.replace(/\//g," / "));

    let headerRow = -1;
    for (let r=0; r<data.length; r++)
      for (let c=0; c<data[r].length; c++)
        if (String(data[r][c]).trim().toLowerCase().includes("cantidad")) { headerRow=r; break; }
    if (headerRow===-1) headerRow=4;

    let obsRow = -1;
    for (let r=headerRow+1; r<data.length; r++)
      for (let c=0; c<data[r].length; c++)
        if (String(data[r][c]).toLowerCase().includes("observaci")) { obsRow=r; break; }
    if (obsRow===-1) obsRow=headerRow+8;

    const firstItemRow = headerRow+1;
    const numItemRows  = obsRow-firstItemRow;
    if (numItemRows > 0) sheet.getRange(firstItemRow+1,3,numItemRows,5).clearContent();

    let curRow = firstItemRow+1;
    items.forEach((item, idx) => {
      if (curRow-1 >= obsRow) return;
      const cant     = Number(item.cant)||1;
      const precio   = Number(item.precio)||0;
      const subtotal = cant*precio;
      const descMarca = String(item.desc||"").trim();
      const tipoComp  = String(item.tipo||"").trim();
      const yaHablaDeCable = tipoComp.toLowerCase().includes("cable")||descMarca.toLowerCase().includes("cable");
      let sufijo = "";
      if (!yaHablaDeCable&&item.metros&&item.terminales) sufijo=" ("+item.metros+"m / "+item.terminales+" term.)";
      if (curRow-1 < obsRow) curRow++;
      if (descMarca && curRow-1 < obsRow) {
        const cm = sheet.getRange(curRow,4);
        cm.setValue(descMarca.replace(/:+$/,'') + ':');
        try { cm.setFontWeight("bold").setFontSize(12); } catch(e) {}
        curRow++;
      }
      if (tipoComp && curRow-1 < obsRow) {
        sheet.getRange(curRow,3).setValue(cant>1?"* "+cant:"1");
        sheet.getRange(curRow,4).setValue(tipoComp+sufijo);
        sheet.getRange(curRow,5).setValue("SI");
        if (cant>1&&precio>0) { const cf=sheet.getRange(curRow,6); cf.setNumberFormat("@"); cf.setValue(fmtARS(precio)); }
        if (subtotal>0) { const cg=sheet.getRange(curRow,7); cg.setNumberFormat("@"); cg.setValue(fmtARS(subtotal)+"+IVA"); }
        curRow++;
      }
      if (idx===items.length-1&&curRow-1<obsRow) curRow++;
    });

    const data2 = sheet.getDataRange().getValues();
    for (let r=0; r<data2.length; r++)
      for (let c=0; c<data2[r].length; c++) {
        const v = String(data2[r][c]).trim().toUpperCase();
        if (v==="SUBTOTAL") { const s=sheet.getRange(r+1,c+2); s.setNumberFormat("@"); s.setValue(fmtARS(sinIVA)); }
        else if (v.includes("IVA 21")) { const s=sheet.getRange(r+1,c+2); s.setNumberFormat("@"); s.setValue(fmtARS(ivaVal)); }
        else if (v==="TOTAL") { const s=sheet.getRange(r+1,c+2); s.setNumberFormat("@"); s.setValue(fmtARS(total)); }
      }

    SpreadsheetApp.flush();
    Utilities.sleep(1500);

    const exportUrl = "https://docs.google.com/spreadsheets/d/"+ID_PLANILLA+"/export?"+
      ["format=pdf","gid="+sheet.getSheetId(),"size=A4","portrait=false","fitw=true",
       "gridlines=false","printtitle=false","sheetnames=false","fzr=false",
       "top_margin=0.25","bottom_margin=0.25","left_margin=0.25","right_margin=0.25"].join("&");

    const response = UrlFetchApp.fetch(exportUrl, {
      headers:{"Authorization":"Bearer "+ScriptApp.getOAuthToken()}, muteHttpExceptions:true });
    if (response.getResponseCode() !== 200)
      return { ok:false, error:"Error exportando: HTTP "+response.getResponseCode() };

    const nombreArchivo = "Presupuesto_" +
      cliente.replace(/[^a-zA-Z0-9\s]/g,"").replace(/\s+/g,"_").substring(0,50) + ".pdf";
    const base64 = Utilities.base64Encode(response.getBlob().getBytes());

    try {
      let emitSheet = ss.getSheetByName(PLANILLA_EMITIDOS);
      if (!emitSheet) {
        emitSheet = ss.insertSheet(PLANILLA_EMITIDOS);
        emitSheet.appendRow(["Fecha","Cliente","CUIT","Fecha Doc","Total","N° Items","Tipo"]);
        emitSheet.getRange("A1:G1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
        emitSheet.setFrozenRows(1);
      }
      emitSheet.appendRow([Utilities.formatDate(new Date(),zona,"dd/MM/yyyy HH:mm"),
        payload.cliente||"", cuit, fecha, total, items.length, "Presupuesto"]);
    } catch(regErr) { Logger.log("No se pudo registrar en Emitidos: "+regErr.message); }

    return { ok:true, base64, nombre: nombreArchivo };

  } catch(e) {
    // FIX ⑧: solo un return de error, sin llamar lock.releaseLock() aquí
    // (el finally lo hace siempre, evita "Lock already released")
    Logger.log("ERROR actualizarPlantillaYExportarPDF: " + e.toString());
    return { ok:false, error:"Error generando PDF: " + e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(le) {}
  }
}

function enviarCorreoAbono(payload) {
  const correoDestino = payload.correoCliente || "support_fitness@hotmail.com";
  const gimnasio      = payload.gimnasio      || "Gimnasio Cliente";
  const periodo       = payload.periodo       || payload.mesAnio || "Periodo Actual";
  const factura       = payload.factura       ? "\nFactura N°: "+payload.factura : "";
  const precioNum     = Number(payload.precio||0);
  const precioStr     = precioNum>0 ? "\nImporte: $"+precioNum.toLocaleString() : "";
  const asunto        = "Factura Gimnasio - " + gimnasio;
  const cuerpo        = "Buenas tardes, Señores de administración.\n\nAdjunto la factura por el mantenimiento preventivo del gimnasio correspondiente al periodo "+periodo+"."+factura+precioStr+"\n\nJunto con los datos de cuenta para realizar la transferencia a la brevedad, con el fin de avanzar en las reparaciones.\n\nLas reparaciones quedarán confirmadas una vez se envíe el comprobante de pago correspondiente.\n\nPor favor Confirmar recepción.\n\nCordiales saludos.\nFacundo Durán\nSUPPORT FITNESS — SERVICIO TÉCNICO PARA GIMNASIOS\nCEL. 11 6117-7878 | support_fitness@hotmail.com";
  try {
    MailApp.sendEmail({ to:correoDestino, subject:asunto, body:cuerpo });
    try {
      const ss    = getSpreadsheet();
      let sheet   = ss.getSheetByName("Presupuestos_Emitidos");
      if (!sheet) {
        sheet = ss.insertSheet("Presupuestos_Emitidos");
        sheet.appendRow(["Fecha","Gimnasio","Factura","Periodo","Importe","Correo","Tipo"]);
        sheet.getRange("A1:G1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      const zona = Session.getScriptTimeZone();
      sheet.appendRow([Utilities.formatDate(new Date(),zona,"dd/MM/yyyy HH:mm"),
        gimnasio, payload.factura||"", periodo, precioNum, correoDestino, "Abono"]);
    } catch(regErr) { Logger.log("No se pudo registrar en Emitidos: "+regErr.message); }
    return { ok:true, mensaje:"Correo enviado a "+correoDestino };
  } catch(e) { return { ok:false, error:e.toString() }; }
}

function guardarPresupuestoEmitido(payload) {
  try {
    const ss  = getSpreadsheet();
    let sheet = ss.getSheetByName("Presupuestos_Emitidos");
    if (!sheet) {
      sheet = ss.insertSheet("Presupuestos_Emitidos");
      sheet.appendRow(["Fecha","Gimnasio","Factura","Periodo","Importe","Correo","Tipo"]);
      sheet.getRange("A1:G1").setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    const zona = Session.getScriptTimeZone();
    sheet.appendRow([Utilities.formatDate(new Date(),zona,"dd/MM/yyyy HH:mm"),
      payload.cliente||"", payload.factura||"", payload.periodo||payload.fecha||"",
      Number(payload.total||0), payload.correo||"", "Presupuesto"]);
    return { ok:true, mensaje:"Registrado en Presupuestos_Emitidos" };
  } catch(e) { return { ok:false, error:e.toString() }; }
}

// ════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO Y FIX — Link de fotos en Drive
//  Agregá estas funciones al backend y ejecutalas desde el editor.
// ════════════════════════════════════════════════════════════════

// ── DIAGNÓSTICO 1: Ver los headers reales de la hoja principal ──
// Ejecutar desde Apps Script → Ejecutar → diagnosticarHeaders
// Copiá el output del Logger y mandámelo.
function diagnosticarHeaders() {
  const sheet   = getHojaPrincipal();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log("=== HEADERS DE LA HOJA PRINCIPAL ===");
  headers.forEach((h, i) => {
    Logger.log("Col " + (i+1) + " [índice " + i + "]: '" + h + "'");
  });
  Logger.log("Total columnas: " + headers.length);

  // Buscar específicamente la columna de foto
  const idxFoto = headers.findIndex(h =>
    String(h).toLowerCase().includes("foto") ||
    String(h).toLowerCase().includes("link") ||
    String(h).toLowerCase().includes("imagen")
  );
  Logger.log("Columna de foto encontrada en índice: " + idxFoto +
             (idxFoto >= 0 ? " (nombre: '" + headers[idxFoto] + "')" : " (NO ENCONTRADA)"));
}

// ── DIAGNÓSTICO 2: Probar permisos de Drive ────────────────────
// Ejecutar desde Apps Script → Ejecutar → diagnosticarDrive
function diagnosticarDrive() {
  Logger.log("=== TEST DRIVE ===");
  try {
    const carpeta = obtenerOCrearCarpeta(DriveApp, "Fotos Gimnasios");
    Logger.log("✅ Carpeta raíz OK. ID: " + carpeta.getId());

    // Crear un archivo de prueba
    const testBlob = Utilities.newBlob("test foto", "text/plain", "test_drive.txt");
    const file     = carpeta.createFile(testBlob);
    Logger.log("✅ Archivo de prueba creado: " + file.getUrl());
    file.setTrashed(true); // borrar el test
    Logger.log("✅ Drive funciona correctamente. Permisos OK.");
  } catch(e) {
    Logger.log("❌ ERROR Drive: " + e.message);
    Logger.log("Solución: Apps Script → Servicios → Agregar Drive API");
  }
}

// ── DIAGNÓSTICO 3: Ver qué recibió el backend en la última ejecución ──
// Esto muestra las últimas 5 filas de la hoja para detectar si el link
// se guardó pero en otra columna, o si directamente no se guardó nada.
function diagnosticarUltimasFilas() {
  const sheet   = getHojaPrincipal();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = sheet.getLastRow();
  const desde   = Math.max(2, lastRow - 4);
  const datos   = sheet.getRange(desde, 1, lastRow - desde + 1, headers.length).getValues();

  Logger.log("=== ÚLTIMAS " + datos.length + " FILAS ===");
  datos.forEach((fila, r) => {
    Logger.log("--- Fila " + (desde + r) + " ---");
    fila.forEach((val, c) => {
      if (val !== "" && val !== null) {
        Logger.log("  [" + headers[c] + "]: " + String(val).substring(0, 100));
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════
//  FIX: Reemplazar la sección de "Guardar en la hoja" dentro de
//  procesarYGuardarTodo() por esta versión más robusta.
//
//  CAMBIOS:
//  1. Busca la columna de foto con múltiples nombres alternativos
//  2. Si no existe la columna, la CREA automáticamente
//  3. Guarda el link como texto plano Y como RichText (doble seguridad)
//  4. Logger detallado de cada paso
// ════════════════════════════════════════════════════════════════

// REEMPLAZAR dentro de procesarYGuardarTodo(), la sección
// "── Guardar en la hoja ──" por este bloque:

/*
    // ── Encontrar columna de foto (con fallback robusto) ─────────
    // Busca por varios nombres posibles que puede tener la columna
    let idxFotos = -1;
    const nombresColumnaFoto = ["foto", "fotos", "link", "imagen", "picture", "archivo"];
    for (const nombre of nombresColumnaFoto) {
      idxFotos = buscarColumna(headers, nombre);
      if (idxFotos !== -1) {
        Logger.log("Columna foto encontrada: '" + headers[idxFotos] + "' en col " + (idxFotos+1));
        break;
      }
    }

    // Si no existe ninguna columna de foto, agregar una al final
    if (idxFotos === -1) {
      Logger.log("ADVERTENCIA: No se encontró columna de foto. Agregando al final...");
      idxFotos = headers.length; // índice 0-based de la nueva columna
      // Escribir el header en la fila 1, columna nueva
      sheet.getRange(1, idxFotos + 1).setValue("Foto");
      // Extender la fila nueva para que tenga esa columna
      while (nuevaFila.length <= idxFotos) nuevaFila.push("");
    }

    if (linkPrimeraFoto) {
      nuevaFila[idxFotos] = linkPrimeraFoto;
      Logger.log("Link primera foto asignado a col " + (idxFotos+1) + ": " + linkPrimeraFoto);
    } else {
      Logger.log("Sin link de foto para guardar (fotos vacías o Drive falló)");
    }

    // ── Insertar fila en la hoja ────────────────────────────────
    sheet.appendRow(nuevaFila);
    const filaInsertada = sheet.getLastRow();
    Logger.log("Fila insertada en: " + filaInsertada);

    // ── RichText del link (doble seguridad: ya está como texto plano arriba) ──
    if (linkPrimeraFoto && nombrePrimeraFoto) {
      try {
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(nombrePrimeraFoto)
          .setLinkUrl(linkPrimeraFoto)
          .build();
        sheet.getRange(filaInsertada, idxFotos + 1).setRichTextValue(rich);
        Logger.log("RichText aplicado OK en fila " + filaInsertada + ", col " + (idxFotos+1));
      } catch(errRich) {
        // Si falla el RichText, el link de texto plano ya está guardado arriba
        Logger.log("RichText falló (no crítico, link plano ya guardado): " + errRich.message);
      }
    }
*/

// ════════════════════════════════════════════════════════════════
//  FIX ALTERNATIVO: si el problema es que data.archivos llega vacío
//  desde el frontend, verificar con esta función de test.
//
//  Ejecutar desde Apps Script → Ejecutar → testSubidaFotoManual
// ════════════════════════════════════════════════════════════════
function testSubidaFotoManual() {
  Logger.log("=== TEST SUBIDA FOTO MANUAL ===");
  try {
    // Simular una foto de 1x1 px en base64
    const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const bytes       = Utilities.base64Decode(pixelBase64);
    const blob        = Utilities.newBlob(bytes, "image/png", "test_foto.png");

    const carpetaPrincipal = obtenerOCrearCarpeta(DriveApp, "Fotos Gimnasios");
    const carpetaTest      = obtenerOCrearCarpeta(carpetaPrincipal, "_TEST");
    const file             = carpetaTest.createFile(blob).setName("foto_test_" + Date.now() + ".png");
    const url              = file.getUrl();

    Logger.log("✅ Foto de prueba subida OK");
    Logger.log("URL: " + url);
    Logger.log("Nombre: " + file.getName());

    // Ahora probar escribir el link en la hoja (sin insertar fila real)
    const sheet   = getHojaPrincipal();
    const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    let idxFotos  = buscarColumna(headers, "foto");
    if (idxFotos === -1) idxFotos = buscarColumna(headers, "link");
    Logger.log("Columna foto en hoja: índice " + idxFotos +
              (idxFotos >= 0 ? " (" + headers[idxFotos] + ")" : " → NO EXISTE"));

    // Limpiar el archivo de test
    file.setTrashed(true);
    Logger.log("✅ Archivo de prueba eliminado (era solo un test)");
    Logger.log("=== RESULTADO: Drive funciona ✅. El problema está en otra parte. ===");
  } catch(e) {
    Logger.log("❌ ERROR en test de foto: " + e.message);
    Logger.log("Causa probable: Drive no autorizado o error de permisos");
  }
}