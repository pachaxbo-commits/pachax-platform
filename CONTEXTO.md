# Continuidad del proyecto PACHAX

## Solicitud vigente y avance del 21/09/2026

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

El App vigente continúa operando distribución para pachax. No vender ni describir esta entrega como SaaS multiempresa terminado.

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

## Adaptación realizada

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
