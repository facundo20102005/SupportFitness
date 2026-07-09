# Support Fitness — Documentación completa del proyecto

## Descripción general

Support Fitness es una aplicación web orientada a la operación técnica de gimnasios y al manejo de documentos comerciales. El sistema combina:

- registro de visitas técnicas
- gestión de mantenimiento y reparaciones
- panel de jefatura con métricas y calendario
- módulo de informes para presupuestos, ofertas y abonos
- una vista institucional con tienda y formulario de contacto
- soporte offline con sincronización posterior

La app está pensada para funcionar desde un navegador moderno y se comunica con Google Apps Script como backend.

---

## Estructura del proyecto

```text
www/
├── index.html              # Página principal del formulario de visitas
├── app.js                  # Lógica principal de registro, offline y UI
├── style.css               # Estilos globales de la app
├── nav.js                  # Barra de navegación compartida entre páginas
├── sw.js                   # Service Worker para PWA/offline
├── vercel.json             # Configuración de despliegue en Vercel
├── assets/                 # Imágenes y recursos visuales
├── Institucional/          # Landing institucional + tienda
├── Jefatura/               # Panel administrativo y calendario
└── Informes/               # Módulo de documentos y presupuestos
```

---

## Páginas y módulos

### 1) Página principal — index.html + app.js

Esta es la pantalla central de operación técnica.

#### Qué incluye
- formulario para registrar visitas técnicas
- selección de técnico, gimnasio, motivo y observaciones
- opción de marcar reparación y/o tapizado
- carga de fotos y archivos adjuntos
- envío online o almacenamiento local si no hay conexión
- historial de visitas y panel de apoyo visual

#### Lógica principal de app.js
- comunicación con Google Apps Script mediante fetch
- almacenamiento local con IndexedDB para modo offline
- sincronización automática cada cierto tiempo
- indicador de conexión en la navegación
- validación de acceso para secciones protegidas
- manejo de alertas, confirmaciones y mensajes de estado

#### Funciones clave
- `llamarAPI()` para enviar acciones al backend
- `initDB()` y `guardarOfflineBD()` para el almacenamiento local
- `sincronizarOffline()` para reenviar registros pendientes
- `cargarPanelHistorial()` y `renderizarCalendario()` para la vista de seguimiento

---

### 2) Vista institucional — Institucional/index.html + Institucional/app.js

Esta sección funciona como portal institucional y comercial.

#### Qué incluye
- presentación de la marca y los servicios
- hero visual con diseño moderno
- catálogo de productos o repuestos
- carrito de compras básico
- formulario de contacto vía Formspree
- acceso a la sala técnica mediante contraseña

#### Lógica de Institucional/app.js
- obtención del dólar oficial desde DolarAPI
- carga de productos desde el backend
- cálculo de precios con IVA
- renderizado del catálogo
- gestión del carrito en almacenamiento local
- validación de acceso técnico y envío del formulario de contacto

#### Uso principal
Sirve tanto para mostrar la empresa como para exhibir productos y abrir el flujo técnico desde una experiencia más institucional.

---

### 3) Panel de jefatura — Jefatura/index.html + Jefatura/jefatura.js

Esta vista está destinada a la supervisión operativa y al seguimiento del negocio.

#### Qué incluye
- acceso protegido mediante contraseña
- KPIs mensuales y anuales
- calendario de visitas por día
- métricas de actividad por técnico y zona
- exportación de clientes a Excel
- sincronización de historial hacia hojas de zona

#### Lógica de jefatura.js
- autenticación contra el backend
- consulta de datos de calendario y cronograma
- carga de historial y documentos
- cálculo de ingresos y estadística mensual
- renderización del calendario y visualización de días con actividad

#### Característica destacada
La vista está diseñada para que un responsable pueda ver de forma rápida qué pasó en un mes, qué zonas tuvieron más actividad y qué ingresos se registraron.

---

### 4) Módulo de informes — Informes/Informes-index.html

Este módulo concentra la generación y administración de documentos comerciales.

#### Qué incluye
- creación de ofertas de mantenimiento
- generación de presupuestos de reparación
- carga de documentos guardados
- vista de abonos mensuales
- asesor de reparaciones
- cálculo de montos, IVA y cotización del dólar

#### Archivos del módulo
- `Informes/Informes-index.html`: estructura principal de la interfaz
- `Informes/inf-config.js`: constantes, URL de API y valores base
- `Informes/inf-api.js`: funciones de conexión, sesión y autenticación
- `Informes/inf-ui.js`: control de la interfaz y modos de visualización
- `Informes/inf-docs.js`: gestión de documentos, items y PDF
- `Informes/inf-abonos.js`: manejo de abonos mensuales
- `Informes/inf-reparaciones.js`: lógica del asesor de reparaciones

#### Objetivo
Centralizar la operación comercial para que la creación de contratos, presupuestos y documentos sea más rápida y consistente.

---

### 5) Navegación compartida — nav.js

Este archivo define la barra superior y la navegación inferior reutilizada por las distintas páginas.

#### Qué hace
- detecta la página actual
- resuelve rutas correctamente entre folders
- construye la navegación global
- maneja el modo oscuro
- permite moverse entre formulario, institucional, informes y jefatura

Es una pieza central para mantener una experiencia uniforme en toda la app.

---

### 6) PWA y despliegue — sw.js + vercel.json

#### sw.js
Implementa un Service Worker para:
- habilitar funcionamiento offline
- precargar activos estáticos
- actualizar cachés al deployar cambios
- manejar fetch con estrategia adecuada según el recurso

#### vercel.json
Configura headers de caché y reglas de publicación para que la app se sirva correctamente en Vercel.

---

## Tecnologías utilizadas

- HTML5 para la estructura de las páginas
- CSS3 con diseño responsive y temas visuales
- JavaScript moderno para la lógica de negocio y UI
- Google Apps Script como backend
- IndexedDB para almacenamiento offline
- localStorage para datos de sesión y preferencias
- fetch API para comunicación con el servidor
- Formspree para el formulario de contacto
- DolarAPI para cotizaciones del dólar

---

## Flujo de uso general

1. El usuario ingresa a la app desde la página principal.
2. Puede registrar una visita técnica o navegar a institucional, informes o jefatura.
3. Si hay conexión, los datos se envían al backend.
4. Si no hay conexión, se guardan localmente y se sincronizan luego.
5. Los responsables pueden consultar estadísticas y documentos desde el panel de jefatura o informes.

---

## Requisitos para correr el proyecto

- navegador moderno
- conexión a internet para sincronización con el backend
- acceso a Google Apps Script configurado con las funciones necesarias

### Ejecución local

Puedes abrir la carpeta principal desde VS Code y ejecutar la app con Live Server o simplemente abrir el archivo principal en el navegador.

```text
www/index.html
```

---

## Configuración recomendada

Los puntos más importantes para dejar la app funcionando son:

- definir correctamente la URL del backend en los archivos de configuración
- asegurar que el service worker se actualice cuando haya cambios en producción
- revisar las credenciales de acceso para las secciones protegidas
- confirmar que las funciones del backend existan para:
  - registrar visitas
  - verificar contraseña
  - obtener historial
  - obtener documentos y abonos
  - devolver stock/productos si la vista institucional lo requiere

---

## Notas importantes

- la app está pensada para operar tanto online como offline
- la experiencia de navegación está dividida por módulos para separar operación técnica, administración y documentación
- el proyecto está preparado para crecer con nuevas vistas o nuevas integraciones sin reescribir toda la lógica

---

## Resumen rápido

- Página principal: registro y seguimiento de visitas
- Institucional: presentación, tienda y acceso técnico
- Jefatura: control operativo y métricas
- Informes: documentos, presupuestos y abonos
- Navegación: compartida entre todas las páginas
- PWA: soporte offline y despliegue más robusto

---

## Autor y mantenimiento

Proyecto desarrollado para Support Fitness con enfoque en operación técnica, documentación y gestión comercial.

**Uso Privado** — Support Fitnes © 2026. Todos los derechos reservados.