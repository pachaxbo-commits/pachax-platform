# Continuidad del proyecto PACHAX

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
