# Hotfix C1 — disponibilidad del catálogo público

Fecha: 28/10/2026

## Causa comprobada

La consulta productiva observada respondió `429 RESOURCE_EXHAUSTED` con App Check válido. La lectura agregada de contadores, sin registrar ni exportar IP, mostró el límite diario del catálogo agotado (`300`); el contador del minuto de esa solicitud estaba por debajo de `20`. No hay evidencia suficiente para atribuir individualmente los 429 anteriores de otro minuto.

El catálogo compartía una cuota estricta por IP con visitas de lectura: `20/minuto` y `300/día`. La transacción se ejecutaba antes de leer el snapshot y escribía contadores en cada vista, por lo que redes móviles, oficinas o NAT compartidos podían bloquear a visitantes legítimos. El formulario de interés tiene un contador HMAC separado de hasta 8 envíos diarios y no comparte esta política.

El frontend protegía llamadas solapadas mediante un booleano, pero no compartía la promesa entre hooks ni filtraba/debouncía todos los eventos `storage`; eso permitía reconsultas redundantes en ciertos cambios de almacenamiento.

## Cambio

- `getCatalog` ya no consume ni depende de la cuota por IP ni del secreto antispam. App Check, la proyección de solo contenido publicado, los límites de tamaño del catálogo y el rechazo de revisiones inconsistentes permanecen activos.
- Cada instancia reutiliza en memoria el snapshot público ya sanitizado mientras la revisión en `publicCommercialCatalogMeta` coincida. La lectura del marcador verifica la revisión antes de devolver caché; publicar o retirar contenido cambia la revisión y fuerza una lectura transaccional nueva. No hay fallback local ante una respuesta válida vacía ni una caché por tiempo que pueda conservar ofertas retiradas.
- La callable ya no resuelve el secreto para `getCatalog`. El secreto continúa ligado a `publicCommercialGateway` y accesible para el flujo de envío, que conserva su límite HMAC y el cierre servidor-side.
- El cliente comparte solicitudes concurrentes, no repite una consulta ya lista en cada montaje y consolida eventos `storage` al cambio de la clave comercial. Un cambio publicado en otra pestaña fuerza una nueva lectura de revisión.
- La entrada de caché pendiente incluye explícitamente `pendingRevision`, usado para compartir una misma transacción mientras se inicializa en frío o se valida la misma revisión.

## Verificación

- Firestore Emulator, proyecto demo aislado: consultas iniciales concurrentes, 64 lecturas repetidas/concurrentes representando visitantes tras NAT compartida, caché estable sin transacciones adicionales, ausencia de escrituras de cuota de catálogo, publicación y retirada con invalidación, reparación del único estado parcial conocido y rechazo de revisiones inconsistentes: PASS.
- Ocho llamadas simultáneas durante la inicialización vacía comparten exactamente una invocación de `runTransaction`; la aserción cubre explícitamente `pendingRevision` y la inicialización: PASS.
- `createSingleFlight`: llamadas superpuestas comparten una ejecución y el reintento tras éxito/error funciona: 2/2 PASS.
- Cierre server-side de recepción comercial: PASS.
- Platform Security con Auth/Firestore/Functions Emulator: 77/77 PASS. Los límites estrictos de envíos por IP siguen pasando; el catálogo permite las 64 consultas; el límite de tamaño para contenido publicado excesivo sigue rechazando.
- `build:functions-core`, `build:rules`, `typecheck`, `build:emulator`, ESLint focal y `git diff --check`: PASS. Build conserva la advertencia existente de chunks grandes; Vite empaquetó las demos con 0 sourcemaps y 0 referencias prohibidas.
- La máquina tiene Node 24.13.0; el runtime Functions del proyecto declara Node 22, por lo que Emulator usó Node 24 y emitió la advertencia de diferencia de versión.

No se modificaron datos de producción, secretos, IAM, App Check, Rules ni Functions desplegadas. Los contadores históricos antispam no se borraron. La publicación se registra en el checkpoint vigente de `CONTEXTO.md`.
