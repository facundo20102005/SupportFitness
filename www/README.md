# Support Fitnes — Sistema Integral de Gestión Técnica

## 📋 Descripción General

**Support Fitnes** es una aplicación web completa para la gestión de visitas técnicas en gimnasios. Proporciona herramientas para:
- 📝 Registrar visitas y mantenimiento de equipos
- 💰 Generar presupuestos y ofertas de reparación
- 💺 Gestionar trabajos de tapizado
- 📊 Acceder a panel de jefatura con estadísticas
- 🌐 Presentación institucional del negocio

Funciona **en línea y offline** con sincronización automática de datos.

---

## 🏗️ Estructura de Carpetas

```
www/
├── index.html              # Página principal (formulario de visitas)
├── app.js                  # Lógica principal (DB local, API, UI)
├── style.css               # Estilos globales (variables CSS, diseño responsive)
├── README.md               # Este archivo
├── assets/                 # Imágenes del proyecto
│   ├── logo.jpeg
│   ├── logo2.jpeg
│   ├── logo4.jpeg
│   └── logo5.jpeg
└── Informes/               # Módulo de documentos
    ├── index.html          # Interfaz para ofertas y presupuestos
    ├── app.js              # Lógica de cálculo y gestión de informes
    ├── style.css           # Estilos locales (heredan de ../style.css)
    ├── text                # Archivo auxiliar
    └── README.md           # Documentación del módulo Informes
```

---

## 📄 Descripción de Archivos Principales

### **index.html** (Página Principal)
Estructura HTML con múltiples vistas:

1. **Vista Formulario** 
   - Captura datos de técnico, gimnasio, motivo, observaciones
   - Campos para reparación y tapizado
   - Opción de cargar archivos adjuntos
   - Botones para enviar en línea o guardar offline

2. **Vista Institucional**
   - Video de YouTube con metodología
   - Reseñas destacadas de clientes
   - Formulario de contacto vía Formspree

3. **Vista Jefatura** (protegida con contraseña)
   - Calendario interactivo con estadísticas
   - Gráficos de actividad mensual
   - Lista de gimnasios por zona
   - Control de presupuestos y pagos

4. **Vista Tapizados** (protegida con contraseña)
   - Gestión de trabajos de reupholstering
   - Carga de fotos antes/después
   - Estado de avance

5. **Vista Informes** (acceso desde `/Informes/index.html`)
   - Módulo separado para crear y gestionar ofertas y presupuestos

### **app.js** (Lógica Principal)

Estructura y funcionalidades:

#### 📡 Comunicación con API
```javascript
const API_URL = "https://script.google.com/macros/s/[ID_SCRIPT]/exec";
const VERSION_APP = 8;

async function llamarAPI(accionObj) {
  // POST a Google Apps Script
  // Returna { status: "success", data: {...} }
}
```

#### 🗄️ Base de Datos Local (IndexedDB)
```javascript
- DB_NAME: "SupportFitnesDB"
- Tabla: "pendientes" - guarda visitas offline
- Métodos: initDB(), guardarOfflineBD(), obtenerPendientesBD(), eliminarPendienteBD()
```

**Funcionalidad**: Si no hay conexión, los datos se guardan localmente y se sincronizan cuando hay internet.

#### 🔐 Indicador de Conexión
```javascript
actualizarDotConexion() // Dot rojo si offline, verde si online
navega cada 4 segundos para detectar cambios
```

#### 📋 Datos Principales

**Lista de Gimnasios** (80+ clientes)
```javascript
gimnasios = ["46 PLAZA PILAR", "Always Club 1", "Banco Galicia", ...]
```

**Cronograma de Zonas** (5 zonas geográficas)
```javascript
cronogramaZonas = [
  { zona: "Zona 1", clientes: [{nombre: "...", freq: "Mensual"}, ...] },
  ...
]
```

#### 🎨 Funciones de UI
- `cerrarVistas()` - Alterna entre vistas
- `abrirInicio()` - Abre vista institucional
- `intentarAbrirJefatura()`, `intentarAbrirTapizados()`, `intentarAbrirInformes()` - Acces con autenticación
- `verificarPassword()` - Valida contraseña contra API
- `mostrarLista()`, `mostrarAlerta()`, `mostrarConfirmacion()` - Modales personalizados

#### 📤 Envío de Datos
```javascript
async function registrarVisita() {
  // Recopila datos del formulario
  // Genera timestamp
  // Llama API con accionObj { accion: "registrarVisita", payload: {...} }
  // Guarda offline si falla
}
```

#### 🔄 Sincronización Offline
```javascript
async function sincronizarOffline() {
  // Si hay conexión:
  // - Obtiene registros locales pendientes
  // - Los envía a la API uno por uno
  // - Elimina de la BD local al éxito
}
```

#### 📅 Historial y Calendario
```javascript
cargarPanelHistorial() - Obtiene visitas registradas
renderizarCalendario() - Pinta calendario interactivo por año
obtenerEstadisticasDelMes() - Calcula métricas mensuales
```

#### 🛡️ Versionado
```javascript
verificarVersion() - Comprueba si hay versión más nueva
Si VERSION_APP < versionActual → muestra modal de descarga APK
```

### **style.css** (Estilos Globales)

**Variables CSS personalizadas**:
```css
--azul: #1a73e8
--verde: #0f9d58
--rojo: #d93025
--amarillo: #f9ab00
--gris-fondo: #f0f2f5
--nav-h: 60px
--bottom-nav-h: 68px
--transition: 0.2s cubic-bezier(...)
```

**Componentes principales**:
- `.top-nav` - Barra de navegación superior (sticky)
- `.nav-status-dot` - Indicador online/offline
- `.pendientes-badge` - Badge de tareas pendientes con animación pulse
- `.btn-jefe`, `.btn-submit`, `.btn-volver` - Botones estilizados
- `.card` - Contenedor de contenido con sombra
- `.modal-overlay`, `.modal-content` - Modales personalizados
- `.bottom-nav` - Navegación inferior para móvil
- `.grid-resenas`, `.resena-card` - Grid layout para reseñas
- Media queries para responsive design

**Animaciones**:
- `@keyframes pulse` - Pulsación del badge
- `@keyframes parpadeo` - Parpadeo del dot offline
- `@keyframes mostrar` - Fade in de modales

### **Informes/index.html & app.js**
Ver [Informes/README.md](Informes/README.md) para documentación específica.

---

## 🔧 Características Principales

### ✅ Funcionalidades

1. **Registro de Visitas Técnicas**
   - Selección de técnico, gimnasio, motivo
   - Carga de fotos adjuntas
   - Campo de observaciones
   - Opción: reparación + tapizado

2. **Almacenamiento Offline**
   - IndexedDB para guardar datos sin conexión
   - Sincronización automática cada 4 segundos
   - Indicador visual del estado de conexión

3. **Autenticación por Rol**
   - Contraseña para jefatura acceso exclusivo
   - Acceso diferenciado a informes
   - Gestión de sesión con localStorage

4. **Panel de Jefatura**
   - Calendario interactivo por mes/año
   - Estadísticas de visitas por zona
   - Historial de trabajos completados

5. **Gestión de Tapizados**
   - Registro de trabajos de reupholstering
   - Carga de fotos antes/después
   - Seguimiento de estado

6. **Módulo Informes**
   - Creación de ofertas de mantenimiento (con frecuencia)
   - Creación de presupuestos de reparación (con IVA y factura)
   - Búsqueda y edición de documentos guardados
   - Integración con cotización oficial del dólar

7. **Página Institucional**
   - Presentación de servicios
   - Reseñas de clientes
   - Formulario de contacto vía Formspree
   - Embedded video YouTube

---

## 🛠️ Tecnologías Utilizadas

| Tecnología | Uso |
|-----------|-----|
| **HTML5** | Estructura semántica con `header`, `nav`, `main`, `section`, `article`, `footer` |
| **CSS3** | Flexbox, CSS Grid, Media Queries, variables CSS, animaciones |
| **JavaScript (ES6+)** | Manipulación del DOM, fetch API, IndexedDB, gestión de eventos |
| **Google Apps Script** | Backend para leer/escribir en Google Sheets |
| **Google Fonts** | Fuente "Nunito" para tipografía |
| **Formspree** | Manejo de formulario de contacto por email |
| **DolarAPI** | Obtención de cotización oficial (en módulo Informes) |
| **IndexedDB** | Base de datos local del navegador |
| **localStorage** | Almacenamiento de autenticación y datos de usuario |

---

## 🚀 Requisitos e Instalación

### Requisitos
- Navegador moderno con soporte ES6+ (Chrome, Firefox, Safari, Edge)
- Conexión a internet (para sincronización; funciona offline)
- Acceso a Google Apps Script (para backend)

### Instalación

1. **Cloná el repositorio**:
   ```bash
   git clone https://github.com/TU-USUARIO/support-fitnes.git
   cd support-fitnes/www
   ```

2. **Abrí `index.html`**:
   - Opción A: Doble clic en `index.html`
   - Opción B: Usa Live Server en VS Code
   - Opción C: Hospedá en GitHub Pages o servidor web

3. **Configura Google Apps Script**:
   - Reemplazá `API_URL` en `app.js` con tu URL de Google Apps Script
   - Asegúrate que el script tenga:
     - Función `registrarVisita()` para guardar datos en Sheets
     - Función `verificarPassword()` para autenticación
     - Función `verificarVersion()` para chequear versión

4. **Configura Formspree** (opcional):
   - En `index.html`, reemplazá `TU_CODIGO_AQUI` con tu Form ID de Formspree
   - Obtené el ID en https://formspree.io

---

## 📊 Flujo de Datos

```
[Usuario relena formulario]
         ↓
[Clic en "Enviar"]
         ↓
¿Hay conexión?
    ↙        ↘
   SÍ        NO
   ↓         ↓
 API      IndexedDB
(Google)  (Local)
   ↓         ↓
 ✅        Guarda
Respuesta  offline
   ↓         ↓
Vista     [Intenta
actualiza  sincronizar
          cada 4s]
          ↓
        [Si hay conexión]
          ↓
         API
          ↓
        ✅ Sincroniza
```

---

## 🔒 Autenticación y Seguridad

### Contraseña para Jefatura/Tapizados
- Se valida contra Google Apps Script
- Se guarda en `localStorage` como `auth_jefatura` o `auth_tapizados`
- Cierra sesión si se recarga la página

### URLs Protegidas
```javascript
// En index.html, parámetro ?vista=
- ?vista=jefatura → Requiere password
- ?vista=tapizados → Requiere password
- Informes/ → Requiere password
```

---

## 🎯 Casos de Uso

### 1. Técnico registra una visita (Sin conexión)
1. Abre la app (offline mode)
2. Completa el formulario
3. Toca "Enviar"
4. Datos se guardan en IndexedDB
5. Recupera conexión → sincroniza automáticamente

### 2. Jefe revisa estadísticas del mes
1. Abre la app → toca botón "Jefatura"
2. Ingresa contraseña
3. Ve calendario interactivo con visitas
4. Consulta estadísticas por zona

### 3. Operador crea un presupuesto
1. Entra a "Informes"
2. Selecciona "Presupuestos Reparación"
3. Agrega ítems con precios
4. Calcula automáticamente IVA
5. Guarda y genera número de factura

### 4. Cliente consulta servicios
1. Entra desde el link de bienvenida
2. Ve "Institucional"
3. Revisa reseñas, video, servicios
4. Completa formulario de contacto vía Formspree

---

## 📱 Diseño Responsivo

- **Desktop**: Layout completo con navegación horizontal
- **Tablet**: Ajustes de grid y espaciado
- **Móvil**: Navegación inferior, stack vertical, botones grandes

**Breakpoints CSS**:
- `@media (max-width: 1024px)` - Tablet
- `@media (max-width: 768px)` - Móvil

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| No aparece el dot de estado | Verifica `nav-dot` en HTML |
| Contraseña no funciona | Revisa API_URL y función `verificarPassword` en Google Apps Script |
| Datos no se sincronizan | Comprueba conexión de internet y API_URL |
| Formulario no guarda | Asegúrate que IndexedDB está habilitado en el navegador |
| Modal de actualización no cierra | Limpia `localStorage` |

---

## 📝 Versión

- **App Version**: 8
- **Fecha de actualización**: Marzo 2026
- **Autor**: Support Fitness

---

## 📞 Contacto y Soporte

- **Email**: facundo20102005@gmail.com
- **Teléfono**: Mi numero
- **Ubicación**: Buenos Aires, Argentina

---

## 📄 Licencia

**Uso Privado** — Support Fitnes © 2026. Todos los derechos reservados.