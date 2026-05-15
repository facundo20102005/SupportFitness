# Informes — Support Fitnes

Esta sección de la aplicación está dedicada a la gestión de documentos técnicos para mantenimiento y reparación de gimnasios.

## Propósito

Esta página permite gestionar documentos técnicos de gimnasio: crear y guardar ofertas de mantenimiento y presupuestos de reparación, con cálculo de IVA, facturación y control del estado de cada registro.

## Cómo funciona

- El usuario elige entre dos modos: `Ofertas de Mantenimiento` o `Presupuestos de Reparación`.
- En `Crear Nuevo`, se completa la información del gimnasio, el detalle de los ítems y el valor total.
- En `Ver Guardados`, se cargan los documentos desde la base de datos en la nube y se pueden editar, facturar o eliminar.
- El app calcula subtotales, IVA y total final, y permite ingresar detalles de factura cuando se aprueba un presupuesto.

## Archivos principales

- `index.html` — interfaz de esta sección de informes.
- `app.js` — lógica para crear documentos, cálculo de precios, búsqueda y sincronización con la API.
- `../style.css` — estilos generales compartidos con el resto del proyecto.
- `text` — archivo auxiliar presente en la carpeta (puede contener notas o datos adicionales).

## Requisitos

- Navegador moderno con soporte ES6
- Conexión a internet para acceder a la API de Google Apps Script y al precio del dólar oficial

## Uso

1. Abrí `Informes/index.html` en el navegador.
2. Seleccioná un modo de trabajo:
   - `🛠️ Ofertas Mantenimiento`
   - `💰 Presupuestos Reparación`
3. En `Crear Nuevo`:
   - completá el gimnasio
   - agregá ítems con tipo, descripción, cantidad y precio
   - guardá el documento en la nube
4. En `Ver Guardados`:
   - buscá documentos por gimnasio
   - editá registros existentes
   - eliminá o facturá presupuestos según corresponda

## Integración

- El sistema usa `API_URL` en `app.js` para comunicarse con un backend de Google Apps Script.
- El cálculo de algunos costos en dólares se convierte usando la cotización oficial obtenida desde `https://dolarapi.com/v1/dolares/oficial`.

## Notas

- Los documentos se guardan en hojas separados: `Ofertas de Mantenimiento` y `Presupuestos de Reparacion`.
- El formulario de presupuesto solicita el número de factura cuando se marca como `Facturado / Aprobado`.
