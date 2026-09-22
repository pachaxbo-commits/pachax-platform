# Continuidad del proyecto PACHAX

## Checkpoint vigente: PACHAX Studio Canónico e Integración Canónica de Distribución (22/09/2026)

Rama `fix/studio-canonical-preview`. Se refactorizó la arquitectura de PACHAX Studio para convertirlo en un visor fiel de las interfaces canónicas reales, eliminando implementaciones visuales paralelas y garantizando paridad 1:1.

### Realizado en esta fase

1. **Capa Canónica de Distribución (`DistributionExperience`)**:
   - Se extrajo `src/modules/distribution/views/DistributionExperience.tsx` como el único componente presentacional compartido.
   - `DistributionApp.tsx` (producción) conserva sus hooks reales (`useDistributionData`, `useSyncStatus`, `useBackButtonBridge`) y delega el renderizado a `DistributionExperience`.
   - `DistributionDemo.tsx` (Studio / Demos) inyecta `previewData`, estado de sincronización mockeado y sesión simulada directamente a `DistributionExperience`, sin llamar hooks ni repositorios productivos.
   - **Paridad absoluta**: Mismo header, misma barra lateral en desktop (`md:flex`), mismo `BottomNav` en móvil, mismo modal de "Más opciones", y mismos componentes operativos.

2. **Simulador Responsive con Iframe Aislado**:
   - Se reemplazó el contenedor `div` por un `<iframe>` aislado cuyas dimensiones físicas activan de manera auténtica las media queries CSS y breakpoints de Tailwind (`sm:`, `md:`):
     - `360×800` (Mobile compacto): activa BottomNav móvil, oculta sidebar de escritorio.
     - `390×844` (Mobile estándar): vista móvil estándar.
     - `768×1024` (Tablet): activa el breakpoint `md:` de forma natural (muestra sidebar lateral, oculta BottomNav).
     - `1366×768` (Laptop / Desktop compacto).
     - `Responsive`: 100% del espacio disponible.
   - Sin hacks de `transform: scale()` ni zoom que alteren el cálculo responsive.

3. **Comunicación Segura Studio ↔ Preview**:
   - Puente `postMessage` bidireccional con validación de origen (`window.location.origin`).
   - El iframe emite `PACHAX_PREVIEW_READY` al montarse, y StudioShell sincroniza en tiempo real rol (`PACHAX_STUDIO_SYNC`) y branding sin recargas forzadas del iframe.

4. **Branding Unificado y Carga de Logo Local**:
   - Se unificó el sistema de diseño sobre las variables canónicas de la aplicación: `--primary`, `--primary-hover`, `--primary-soft`, `--accent`, `--accent-soft`, `--background`, `--surface`, `--sidebar`.
   - `BrandingDrawer` incorpora la carga de **Logo de empresa** exclusivamente para formatos PNG, JPEG y WebP (máx. 300 KB), almacenado localmente en `localStorage` sin subir nada a Firebase.
   - La cabecera canónica muestra el logo y nombre de la empresa del cliente, con un discreto "Powered by PACHAX" secundario. Fallback seguro a `/brand/pachax-logo.png` si no se especifica logo.

5. **Patrón Arquitectónico para Próximas Plantillas**:
   ```
   interfaz real Restaurante / Comercio
          ↑
   datos reales / mock adapter
          ↑
   producción / Studio / demo pública
   ```
   - **Restaurante**: No fue modificado en esta fase (desarrollo paralelo en otra rama). Cuando se integre, adoptará este mismo patrón de extracción presentacional.
   - **Comercio / Venta rápida**: Se migrará a este patrón en su turno.

### Verificaciones y pruebas
- `npm run typecheck`: Aprobado (0 errores).
- `npm run test:platform`: 20/20 comprobaciones aprobadas.
- `npm run test:distribution`: 55/55 pruebas del motor de distribución aprobadas.
- `npm run build`: Compilación limpia de producción en 5.14s.
- Motores de negocio, repositorios, Firebase, Auth, Firestore Rules y Functions 100% intactos.
- Rama: `fix/studio-canonical-preview` (sin merge a `main`).

---

## Checkpoint anterior: PACHAX Studio & Demos Desacopladas (22/09/2026)

### Realizado en esta fase

1. **Entorno PACHAX Studio (`src/studio/`)**:
   - Acceso independiente mediante `npm run studio` o ruta `/studio` (`studio.html`).
   - Funciona localmente sin `.env.local` ni configuración remota.
   - Portada profesional con tres tarjetas: *Restaurante*, *Producción y distribución*, y *Comercio / Venta rápida*.
   - **Modo Equipo**: seleccionado por defecto con acceso completo a todos los módulos sin requerir autenticación ni cambio de usuario.
   - **Simular rol**: selector opcional por plantilla (Restaurante: Dueño, Admin, Caja, Mesero, Cocina, Inventario; Distribución: Admin, Almacén, Distribuidor; Comercio: Dueño, Admin, Caja, Ventas, Inventario).
   - **Simulador de viewports**: selector interactivo para pantallas móviles (360×800, 390×844), tablet (768×1024), laptop (1366×768) y escritorio.
   - **Personalización de Empresa (Branding)**: panel flotante en tiempo real con tokens visuales CSS (`--studio-primary`, `--studio-sidebar`, `--studio-accent`, `--studio-bg`, etc.), adaptable al formato canónico `Tenant.branding` y persistido localmente sin tocar Firebase.

2. **Demos Desacopladas (`src/demo/`)**:
   - Arquitectura separada: las plantillas y demos no dependen de `StudioShell`.
   - **Rutas públicas disponibles**: `/demo` (galería de las 3 soluciones), `/demo/restaurant` (Bistró Demo), `/demo/distribution` (Distribuidora Demo), `/demo/retail` (Amapola Demo).
   - Demos públicas limpias sin controles de desarrollo ni selector de viewport, con aviso discreto de *Demostración con datos ficticios* y botón CTA *Quiero una solución para mi negocio*.

3. **Plantillas integradas**:
   - **Restaurante (Bistró Demo)**: 14 módulos operativos con mock data (Inicio, POS/Caja, Pedidos, Mesas con plano de salón, Cocina KDS, Historial, Caja/Turnos, Inventario, Productos, Clientes, Usuarios, Reportes, Configuración, Impresoras térmicas). Desacoplado de Firebase mediante wrappers locales.
   - **Producción y distribución (Distribuidora Demo)**: Los 17 accesos completos navegables desde Modo Equipo reutilizando `previewData` y vistas de distribución sin alterar lógica financiera ni de inventario.
   - **Comercio / Venta rápida (Amapola Demo)**: Venta combinada en un mismo carrito de productos por peso (gramos) y por unidad. Reutilización estricta de `src/core/sales.ts` (`createSaleLine`, `saleTotal`, `validatePayments`, `cashClosure`). Módulos de inicio, POS, ventas, caja, inventario en gramos/unidades, productos, clientes, usuarios, reportes y configuración.
   - Contratos intactos: nombre visible *Comercio / Venta rápida*, manteniendo el ID técnico interno `gelateria_weight_cafe`.

4. **Compatibilidad y Protección Vercel**:
   - Flag `VITE_ENABLE_TEAM_STUDIO`: activo en local/dev y en Vercel Preview (`VITE_ENABLE_TEAM_STUDIO=true`), bloqueado en Production. Las rutas `/demo/...` permanecen públicas con mocks.
   - Rewrites en `vercel.json` y middleware dev en `vite.config.ts` para `/studio` y `/demo`.
   - `docs/TEAM-SETUP.md` actualizado para clonar desde `main` y utilizar `npm run studio`.

### Verificaciones y pruebas
- `npm run typecheck`: Aprobado (0 errores).
- `npm run test:platform`: 20/20 comprobaciones aprobadas.
- `npm run test:distribution`: 55/55 pruebas del motor de distribución aprobadas.
- `npm run build`: Generación correcta de artefactos `dist/index.html`, `dist/studio.html`, `dist/demo.html`, `dist/preview.html`.
- Reglas, Auth, Cloud Functions y Firestore Rules sin modificaciones.

---

## Checkpoint anterior: núcleo multiempresa (22/09/2026)

Rama `codex/pachax-platform`. El checkpoint solicitado quedó limitado a contexto activo, paths tenant, Functions, Rules y aislamiento A/B/C. **No continuar todavía con onboarding, `/platform`, Support View, conexión operativa de templates ni UI hasta nueva indicación.** No hubo merge, push, despliegue, Firebase real ni acceso a `G:/pachax-comandero`.

### Núcleo terminado

- Auth resuelve todas las memberships activas mediante `tenantGateway`; una cuenta puede pertenecer a varias empresas. La selección persistida y el perfil cacheado usan claves separadas por `uid + tenantId`.
- `ActiveTenantContext` es la fuente única de tenant, membership, rol, permisos, businessType, template, branding, branch y route. Cambiar empresa limpia contexto y repositorios antes de exponer el siguiente tenant.
- Distribución usa `tenants/{tenantId}/dist*`; la cola incluye `tenantId` y `branchId`. Los documentos producidos por Functions conservan el scope tenant. El adapter legacy `restaurants/pachax` permanece únicamente para las pruebas y consumidores históricos, con TODO explícito.
- `users/{uid}` contiene perfil global y `users/{uid}/tenantLinks/{tenantId}` permite descubrir memberships; los permisos efectivos viven en `tenants/{tenantId}/members/{uid}` y roles tenant.
- `tenantGateway` crea tenants de forma idempotente, lista/selecciona memberships, actualiza configuración y administra usuarios internos. Todas las mutaciones vuelven a verificar membership, estado, permiso, capability y tenant en servidor.
- Los triggers tenant de operaciones, créditos, clientes y mantenimiento apuntan a `tenants/{tenantId}`. Una operación valida actor, empresa, branch, tipo de negocio, permiso y estado antes de mutar inventario o finanzas.
- Firestore Rules bloquea escrituras directas de perfiles, memberships, roles y tenant; autoriza por membership activa, rol/permisos, branch y route. Las rutas Platform permanecen cerradas; su autorización real está pendiente.

### Evidencia del checkpoint

- `npm run test:tenant-core`: 21 comprobaciones aprobadas desde emuladores limpios `demo-pachax-platform` con Auth, Firestore y Functions. Crea Restaurante A, Distribuidora B y Heladería C; cada owner lee solo su tenant; actor A no muta B; miembro desactivado no lee; distribuidor lee su ruta y no otra; caja no lista/crea memberships; owner crea un usuario mediante callable; una operación tenant se confirma y conserva `tenantId`.
- La misma prueba se repitió con Functions ejecutándose en Node `22.23.2`: 21/21 aprobadas.
- Pruebas unitarias con Node 22: 20/20 de core/entorno/dominio y 55/55 de distribución. Suite legacy de reglas/operaciones: 56/56 con Node 22. Typecheck y build de emulador aprobados.
- ESLint global continúa con deuda heredada; el barrido focalizado también encuentra reglas React/lint anteriores en archivos de distribución no originadas por esta fase. No se declara lint global limpio.

### Pendiente después del checkpoint

- Autorización Platform server-side, bootstrap del primer Platform owner, Support View/read-only/elevación/auditoría Platform.
- Onboarding y selector visual de empresa; `/platform`; conexión operativa de `restaurant_pos` y `gelateria_weight_cafe`.
- Migrar los repositorios históricos de restaurante que todavía conservan `restaurantId`/`restaurants/*`; retirar el adapter y entrypoints `restaurants/pachax` solo después de migrar y repetir su suite.
- Storage de branding, índices finales, pruebas Android de este cambio y QA visual. Storage sigue fail-closed.

## Estado anterior y requisitos de referencia (21/09/2026)

Los documentos completos del propietario están conservados en docs/requirements/2026-09-21-producto.md y docs/requirements/2026-09-21-platform.md. **Reemplazan el orden anterior de esperar Firebase antes de desarrollar:** se autoriza avanzar localmente con la plataforma SaaS y consola interna, sin desplegar ni conectar recursos remotos. No pedir nuevamente autorización para continuar esas tareas. No están terminadas.

Rama: codex/pachax-platform, creada desde main limpio. Sin remoto ni proyecto Firebase seleccionado. No se accedió ni modificó G:/pachax-comandero; no hubo push, despliegue ni escrituras remotas. Toda escritura de pruebas fue a demo-pachax-platform.

### Realizado

- Auditoría inicial de conexiones, stack, Auth, módulos y mapa semántico restaurantId en docs/AUDITORIA-PLATAFORMA.md.
- Validación pura de Firebase compartida por Vite y runtime: producción sin configuración completa falla explícitamente; configuración parcial también falla en desarrollo; emuladores solo aceptan demo-pachax-platform; proyecto demo sin emuladores rechazado. `npm run build:emulator` permite compilar el artefacto aislado. `npm run build` sin variables debe fallar intencionalmente.
- Storage helper apunta al puerto 9295 en modo emulador. firebase/storage.rules niega todo mientras no se implemente branding con membresías. No afirmar que logos/uploads están habilitados. El comando emulators actual arranca Auth, Firestore y Functions; Storage requiere añadirlo explícitamente.
- Android/Capacitor, paquetes Java de plugins y prueba instrumental migrados coordinadamente a net.pachax.app. Nombre visible PACHAX.
- src/core/platform.ts, templates.ts, sales.ts y finance.ts definen contratos canónicos tenantId, tres businessTypes, módulos/capacidades/presets, autorización de UI Platform separada y sesiones de soporte conceptuales. **No constituyen autorización de servidor ni reemplazan todavía el esquema legacy.** El registry devuelve copias independientes; billingEnforcement=false, aiAssistant=false. El menú legado filtra Bot con el flag; sus archivos siguen disponibles.
- Dominio monetario en centavos y peso en gramos, BigInt para productos/intermedios y redondeo half-up por línea. Pruebas 250g/325g a Bs60 y carrito mixto Bs54; caja excluye QR. Aún no hay POS heladería conectado ni escrituras de estas ventas.
- Login rediseñado, claro crema/petróleo, composición desktop y login directo móvil; animación CSS de nodos con prefers-reduced-motion. Reemplazadas referencias PACHAX Flow en src, incluidos tickets de diagnóstico y componentes heredados.
- docs/SETUP-PACHAX.md y docs/research/amapola.md. La página oficial Facebook fue bloqueada por el proveedor (`Online fetch throttled`); no se usaron homónimos, no hay catálogo/precios/branding confirmados públicamente.

### Verificaciones de esta entrega parcial

- Typecheck aprobado; build de emulador aprobado, con advertencia heredada de bundles grandes.
- 16 pruebas nuevas de entorno/dominio/política UI: `npm run test:platform`. Son pruebas unitarias, **no pruebas de seguridad Platform en Firestore**.
- 55 pruebas de distribución y etiquetas de reportes aprobadas.
- 56 comprobaciones de reglas/operaciones existentes aprobadas mediante `npm run test:rules` con triggers del emulador. No certifican todavía aislamiento multiempresa del nuevo esquema.
- `npx cap sync android`, `:app:assembleDebug` y `:app:assembleDebugAndroidTest` aprobados. No ejecutados en hardware. Artefacto debug generado con configuración demo; no distribuir como producción.
- Login inspeccionado visualmente desktop/móvil; dimensiones sin overflow horizontal comprobadas en 360×640, 375×812, 390×844, 412×915, 768×1024, 1366×768 y 1920×1080. No se ha realizado QA responsive de las tres plantillas.
- ESLint focalizado en archivos nuevos/core/login/config/tests aprobado. ESLint global falla: 211 errores y 30 advertencias en código heredado y artefactos generados. No ocultar ni afirmar lint global aprobado. En la base actual eslint.config.js solo ignora dist; falta excluir correctamente productos de build Android y resolver deuda TS.
- Functions agotó el descubrimiento inicial (10s); iniciar con FUNCTIONS_DISCOVERY_TIMEOUT=60 resolvió. El CLI local usó Node24 aunque Functions declara Node22; falta repetir con el runtime objetivo. En PowerShell usar firebase.cmd y el argumento `--only "firestore,auth,functions"` entre comillas.

### Trabajo pendiente autorizado (no presentar como terminado)

1. Migrar Auth/membership, contexto, repositorios, triggers, mantenimiento, cachés, reglas e índices de restaurants/pachax a tenants/{tenantId}; comprobar aislamiento real y no hacer reemplazo textual global.
2. Implementar autorización Platform en servidor/colección protegida o claims, bootstrap seguro y tests negativos; los helpers src/core son solo contratos de UI.
3. Onboarding transaccional seguro, alta de owner/empresa, branding Storage y usuarios internos en servidor; selector de empresa.
4. /platform completo: directorio paginado, ficha, quick settings, auditoría, Support View con rol visual/identidad persistente, solo lectura efectiva, elevación con confirmación/motivo/expiración; Template Preview con datos ficticios. Nada de esto está conectado hoy.
5. Generalizar distribución conservando P0; integrar/rediseñar restaurante; conectar POS peso/unidad, inventario comercial y caja de heladería. Reutilizar un motor de impresión y uno offline. El registry no prueba que los módulos estén implementados; offlineOperations se deja vacío hasta validar adaptadores nuevos.
6. Completar QA de reglas y operaciones multiempresa/Platform, responsive de todas las plantillas, índices/paginación, contraste de branding y Android físico. Billing/finanzas solo preparados, sin datos reales ni pasarela.

Este párrafo describía el estado anterior fijo en `pachax`; el estado vigente está en el checkpoint superior. No vender ni describir esta entrega como SaaS multiempresa terminado.

## Solicitud y límites

El propietario quiere convertir el flujo de producción, almacenes, distribución, ventas y cobros en la primera categoría de PACHAX, y añadir posteriormente tiendas, restaurantes y otros negocios. El nombre de la aplicación es PACHAX. La marca visual actual es provisional; el rediseño se hará después de conectar el nuevo entorno.

Esta copia parte del estado de trabajo de la app del cliente al 11/09/2026, versión Android 1.2.5. Se copió el código actual, incluidos cambios sin commit, sin copiar el historial Git. El original está en G:/pachax-comandero y este proyecto en C:/PACHAX. Son proyectos independientes. La limpieza futura del código exclusivo del cliente pertenece al chat original y NO se hizo como parte de esta clonación.

## Categoría inicial: Producción y distribución

Pensada para fabricantes y distribuidores con productos, lotes, fechas de vencimiento, almacenes, rutas y cartera de clientes. El sistema maneja costos de producción, pero todavía no constituye un sistema industrial completo de recetas, órdenes de fabricación y consumo de materias primas.

## Funciones heredadas a conservar

- Administración: panel, ventas directas, clientes, productos con foto y costos, inventario, lotes, alertas, despachos, transferencias, gastos, créditos y cobros, confirmación QR, cambios/devoluciones, cierres, reportes y usuarios.
- Almacén: inventario y movimientos, despacho y retorno de productos, transferencias y conciliación física. Sin ventas financieras, clientes ni impresoras en su menú.
- Distribuidor: venta de su ruta, gastos, cobros y cierre propio. La cartera de créditos es compartida entre Administración y distribuidores; las ventas y cierres de otros distribuidores no deben quedar expuestos.
- Soporte: configuración técnica y proceso de limpieza con doble confirmación y respaldo restringido; sin acceso comercial ordinario.
- CI como identificador de cliente, fotos opcionales, crédito vencido que bloquea ventas, stock por lote y vencimiento, confirmación QR separada del efectivo.
- Historial general de inventario con PDF, Excel/PDF generales en español, estado de cuenta, tickets térmicos Bluetooth ESC/POS y configuraciones de impresión.
- Persistencia sin conexión y cola de operaciones con confirmación del servidor. Inicio de sesión requiere internet si se cerró la sesión.
- Merma por redondeo: NO inventar reglas. Quedó pendiente de definición comercial.

## Adaptación histórica realizada el 11/09/2026 (Android vigente: net.pachax.app)

- Identidad visible PACHAX; recursos nuevos y provisionales. Retirado logo térmico específico del cliente; el ticket conserva el nombre textual.
- Android com.pachax.app, versión 0.1.0, código 1. No reutilizar el identificador de la app original.
- Empresa técnica inicial `pachax`; frontend, funciones y reglas apuntan al mismo valor.
- Funciones renombradas a processPachaxOperation, refreshPachaxCredit, initializePachaxCredit y changePachaxMemberPassword, junto con sus llamadas cliente.
- Sin configuración Firebase de producción ni remoto Git. Emuladores ficticios demo-pachax-platform, con puertos propios.
- Excluidos datos descargados, informes, copias de seguridad, credenciales, binarios APK, cachés e historial Git originales. Ejemplos locales anonimizados; catálogo opcional de ejemplo genérico.

## Arquitectura y restricciones importantes

React + TypeScript + Vite; Capacitor Android; Firestore/Auth; Functions Node 22; impresión Bluetooth y TCP; ExcelJS y jsPDF.

La colección `restaurants` y el tipo `mobile_distribution` siguen siendo nombres internos del esquema. Se conservan para no romper referencias, permisos y operaciones. El nombre comercial de la categoría es Producción y distribución.

La app inicia directamente el módulo distribution. Permanecen módulos y servicios anteriores de restaurantes como material reutilizable y dependencias; NO están conectados como categorías terminadas. No borrarlos sin analizar imports y pruebas. El sistema actual opera una sola empresa técnica `pachax`: no usarlo aún para clientes independientes en el mismo Firebase. Multiempresa exige parametrizar frontend, triggers, mantenimiento, permisos y pruebas de aislamiento, no solamente añadir correos diferentes.

Las fotos del flujo distribution se comprimen y guardan en los documentos; hay un helper heredado para Storage. No dar por habilitado Storage hasta definir su uso y reglas. La configuración web conserva el campo del bucket por compatibilidad de inicialización.

## Orden acordado para continuar

1. Usuario entrega configuración web del NUEVO Firebase y URL del NUEVO repositorio GitHub.
2. Configurar servicios, primera cuenta administrativa, reglas/índices/funciones, pruebas y firma propia. Leer docs/CONFIGURACION.md.
3. Rediseñar la primera categoría para PACHAX, aprovechando el orden funcional existente.
4. Definir y desarrollar aislamiento multiempresa y catálogo de módulos; después otras categorías.

## Preferencias del propietario

Quiere trabajo autónomo, sin alterar funciones sin avisar; buen diseño en celular y tablet; menús legibles y formularios sencillos; pruebas reales en entorno aislado; resumen de cambios y pendientes; documentación que permita continuar desde otro chat. No prometer ausencia absoluta de errores: indicar qué se comprobó y qué falta probar con servicios/hardware reales.

## Cómo retomar en un chat nuevo

Abrir C:/PACHAX como proyecto y pedir: «Lee AGENTS.md y CONTEXTO.md, revisa el estado de las pruebas y continúa con la configuración independiente de PACHAX». No es necesario acceder al historial completo del chat original.

## Verificación de la copia (11/09/2026)

- Instalación reproducible con npm ci en frontend y functions, sin vulnerabilidades reportadas por npm en esa ejecución.
- Compilación TypeScript/Vite y sincronización Capacitor correctas.
- Android assembleDebug correcto con com.pachax.app. Firma debug únicamente.
- Compilación del APK de prueba instrumental de la app (`:app:assembleDebugAndroidTest`) correcta; no ejecutado en un dispositivo físico. El comando global assembleDebugAndroidTest también intenta compilar pruebas propias de dependencias y encontró versiones Kotlin duplicadas en capacitor-cordova-android-plugins. Usar el objetivo :app para las pruebas de esta aplicación; revisar esa dependencia antes de ampliar pruebas de plugins.
- 55 pruebas del motor de distribución y prueba de traducciones de reportes aprobadas.
- 50 comprobaciones de reglas y operaciones del servidor aprobadas en demo-pachax-platform, incluidas transacciones, concurrencia, créditos cruzados y permisos de soporte.
- Acceso desde Chrome a las cinco cuentas ficticias aprobado, sin error de permisos en sus pantallas iniciales. Esta prueba no reemplaza un simulacro exhaustivo de cada botón en el nuevo Firebase.
- Huellas de los 192 archivos fuente copiados contrastadas con el original: ninguno fue modificado en el proyecto original.
- Búsqueda en código activo sin nombre, identificador Firebase, identificador Android ni datos personales detectados del cliente original. Las referencias de procedencia solo quedan en documentación y en el manifiesto de huellas.
- Node local utilizado en estas pruebas: 24; Functions declara Node 22 para despliegue. Verificar nuevamente con ese runtime y el proyecto real al conectar servicios.
- No hubo despliegue, push a GitHub, migración de datos ni creación de usuarios reales.

Pendientes reales: configuración y permisos del nuevo Firebase, repositorio remoto, administrador real, firma de publicación, validación Bluetooth con dispositivo físico, rediseño de PACHAX y arquitectura multiempresa. No presentar esta preparación como una plataforma multiempresa ya lista para vender.

## Gestión administrativa de usuarios (11/09/2026)

- Administración puede editar el nombre y el correo de acceso de cada usuario. El cambio se coordina en Firebase Authentication, el perfil de miembro y el mapa interno del usuario; el correo nuevo se usa en el siguiente inicio de sesión.
- Administración puede desactivar, reactivar, cambiar la contraseña o eliminar el acceso. La eliminación conserva ventas, despachos y movimientos históricos porque esos registros guardan sus propios datos de auditoría.
- No se permite eliminar la propia cuenta ni desactivar, eliminar o cambiar de rol a la última cuenta administrativa activa.
- Las modificaciones y bajas pasan por `changePachaxMemberPassword`; las reglas bloquean cambios directos para que no se pueda evitar la protección del servidor.
- Validación local aprobada: TypeScript, ESLint, build web, 55 pruebas del motor, etiquetas de reportes en español, 56 comprobaciones de reglas/operaciones y prueba visual de gestión de usuarios a 360 x 800.
- `scripts/validate-user-management.cjs` es destructivo y se debe ejecutar únicamente contra `demo-pachax-platform` después de `npm run seed:demo`, con los emuladores y Vite activos. Puede necesitar `PLAYWRIGHT_MODULE` si Playwright no está instalado en el proyecto.
