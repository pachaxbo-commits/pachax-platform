# Auditoría PACHAX — 21/09/2026

Estado inicial inspeccionado en C:/PACHAX, rama main limpia y sin remotos. No se accedió a G:/pachax-comandero. El nuevo trabajo vive en codex/pachax-platform. Los dos documentos entregados el 21/09 sustituyen el orden anterior: trabajar localmente antes de crear infraestructura remota.

## Conexiones antes de cambios

| Componente | Actualmente apunta a | Riesgo | Acción |
|---|---|---|---|
| .env / .env.local / .env.production | No existen | Configuración parcial se trataba como modo local | Validación explícita en build y runtime |
| .env.emulator | demo-pachax-platform | Solo Auth/Firestore/Functions estaban conectados a emuladores | Storage conectado localmente al puerto 9295, reglas cerradas hasta implementar membresías |
| .env.example | Variables vacías | Ningún destino | Conservar configuración genérica |
| .firebaserc | projects vacío | Sin destino por defecto | No seleccionar proyecto remoto |
| firebase.json | Reglas, índices, functions locales, hosting dist | Comando manual con --project podría desplegar | No desplegar; revisar destino explícitamente al conectar |
| Firebase init | Variables VITE_FIREBASE_* | No hay fallback de credenciales; configuración incompleta aceptada | Rechazar configuración incompleta en producción |
| Auth domain / bucket / projectId | Solo valores demo en .env.emulator | Storage no conectado al emulador al inicio | Helper aislado y reglas deny-all; uploads tenant siguen pendientes |
| Vercel | Sin .vercel ni vercel.json | No hay proyecto vinculado | Crear posteriormente por el propietario |
| Google Services Android | No hay google-services.json | SDK Web de Capacitor | No añadir credenciales nativas |
| Android / Capacitor | com.pachax.app / PACHAX | Diferente del identificador objetivo | Migrar a net.pachax.app, incluidos plugins y prueba instrumental |
| Git | main, sin remoto | Sin destino de push | Rama codex/pachax-platform; sin push |
| URLs de cliente | No encontradas en src/functions/scripts | Bot conserva localhost:3010 | Mantener IA desactivada |

## Stack y autenticación

React 19, TypeScript 6, Vite 8, Tailwind 3, Firebase Web 12, Functions CommonJS con runtime Node 22, Capacitor 8 Android, impresión ESC/POS Bluetooth/TCP. Firestore conserva la cola offline; el servidor procesa operaciones idempotentes.

Auth usa correo/contraseña y membresía en restaurants/pachax/members/{uid}. authStore fuerza mobile_distribution y App exige pachax. No hay autorización Platform. El perfil local de desarrollo usa admin; no es autorización de servidor. users permite modificar el propio mapa legado: debe endurecerse al migrar. El alta de miembros se hace con Auth secundario y escrituras cliente; modificaciones/bajas pasan por callable. El onboarding nuevo debe ser transaccional en servidor.

## Mapa semántico previo a migración

| restaurantId actual | Significado | Campo objetivo | Archivos afectados |
|---|---|---|---|
| FirebaseContext.restaurantId | Empresa activa | tenantId | src/lib/firebase.ts, repositorios |
| AuthState.restaurantId / CachedProfile | Empresa autenticada y caché | tenantId, caché por uid/tenant | src/store/authStore.ts |
| TenantContext.restaurantId | Empresa, NO sucursal | tenantId | src/services/tenantService.ts, src/store/tenantStore.ts |
| Branch.restaurantId | Empresa dueña de sucursal | tenantId; conservar branchId | src/types.ts, servicios de sucursales |
| restaurants/{restaurantId} | Raíz de empresa | tenants/{tenantId} | firebase/firestore.rules, índices, servicios, seeds |
| restaurants/pachax | Empresa fija | tenant del evento validado | functions/index.cjs, operations.cjs, maintenance.cjs |
| Dist*.restaurantId | Empresa de operación | tenantId | src/modules/distribution/types.ts y data/ |
| defaultRestaurantId / restaurants[] | Selector de empresa legado | defaultTenantId / membresías | users, Auth, bootstrap y gestión de usuarios |
| principal / main | principal es fallback de empresa; main es sucursal | Eliminar empresa implícita; conservar sucursal explícita | tenantService, tenantStore, repositorios heredados |
| Impresoras y cachés | Preferencias por empresa | Claves con tenantId | src/services/printing, stores |

No se trata de renombrar un restaurante físico: la sucursal ya dispone de branchId. La migración debe coordinar campos, paths, triggers, mantenimiento, tests, cachés y seeds; no migrar datos reales ni borrar el legado antes de probar sustitutos.

## Restaurante: inventario inicial

| Función | Mantener | Simplificar | Ocultar | Motivo |
|---|---|---|---|---|
| CajaView / catálogo / carrito | Sí | Sí | Hasta integrar plantilla | Base reutilizable, no conectada en App actual |
| CocinaView / pedidos | Sí | Configurable | Si kitchen está apagado | No todo negocio requiere cocina |
| HistorialView | Sí | Paginar y revisar consultas | No | Ventas y reimpresión |
| CashSessionView | Sí | Revisar contrato monetario | Hasta pruebas | Separación efectivo/QR necesaria |
| AdminView | Parcial | Separar catálogo, ajustes y usuarios | Funciones no validadas | Componente concentra varias responsabilidades |
| BotView / botApi | Conservar archivos | Feature flag aiAssistant=false | Sí | Fuera del alcance comercial |
| Impresión / diagnóstico | Sí | Motor común | No | Integraciones compartidas con Android |
| Registro / personalización legacy | Como referencia | Reemplazar alta cliente por callable | Sí | No constituye onboarding multiempresa seguro |

## Distribución

Conservar inventario/lotes, despachos y aumentos, venta/crédito, cobros, clientes, gastos, retornos, cierres, QR, transferencias, devoluciones, reportes, usuarios, impresión y cola idempotente. Están conectados para una empresa. Hay cantidades y supuestos kg que deben revisarse antes de afirmar unidades genéricas. Las pruebas existentes deben seguir pasando durante la migración.

## Deuda crítica / orden

1. Entorno validado y Android independiente.
2. Contratos canónicos y registry central; no conceder permisos por defecto.
3. Auth/membresías y alta segura; paths/triggers/reglas coordinados y aislamiento real.
4. Platform separado con autorización server-side, sesiones de soporte auditadas y solo lectura efectiva.
5. Onboarding, shells y tres plantillas operativas; reutilización de impresión/offline.
6. QA de reglas, operaciones, responsive y dispositivo físico. Billing siempre desactivado.

Esta auditoría no certifica que restaurante, heladería o multiempresa estén terminados.
