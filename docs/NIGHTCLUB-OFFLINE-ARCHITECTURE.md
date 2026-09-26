# ADR: arquitectura offline de Nightclub

Estado: propuesta implementable, pendiente de decisión de hardware y plugin SQLite. Fecha: 25/09/2026.

## Decisión inmediata

La aplicación usa comandos con `operationId`, escritura durable local, outbox y ACK explícito. React no escribe Firestore. `NightclubRepository` separa consultas de piso, cuentas abiertas, Barra, turno, catálogo e inventario. Las operaciones monetarias pasan por `nightclubCommand` y transacciones server-side. Producción permanece cerrada hasta conectar el provider.

El adaptador IndexedDB incluido prueba el contrato web. Para Android/Capacitor se recomienda SQLite antes del go-live, después de validar mantenimiento, cifrado, backup, migraciones, soporte de Node/Capacitor y comportamiento ante kill/reinicio. No se agregó un plugin sin esa selección.

## Flujo

`acción local → transacción durable/proyección local → outbox pending → UI confirma local → sync → Function transaccional → ACK → confirmed`.

Nunca se muestra “sincronizado” durante `pending`, `syncing` o `failed`. Los estados son `pending`, `syncing`, `confirmed`, `conflict` y `failed`; se guardan operationId, tenantId, branchId, actorUid, tipo, payload mínimo, fecha, intentos y último error. El servidor liga cada `operationId` al actor y a una huella canónica de tipo, sucursal y payload: un retry idéntico recibe el mismo ACK y una colisión con datos distintos se rechaza.

## Conflictos

- Dos aperturas de la misma mesa: la transacción que obtiene el lock de mesa gana; la otra queda `conflict`.
- Dos rondas sobre una cuenta: ambas pueden confirmarse si la cuenta sigue abierta y hay inventario; cada una usa precios oficiales y operationId distinto.
- Caja cobra mientras llega una ronda offline: si el pago cerró primero, la ronda se rechaza y requiere atención. No se reabre automáticamente.
- Inventario: validación y descuento ocurren en la misma transacción; nunca last-write-wins.
- Retry de ronda/pago/movimiento: `nightclubOperations/{operationId}` devuelve el ACK ya guardado; el pago en efectivo conserva un solo movimiento de caja.
- Reconexión tras 30 minutos: procesa FIFO por dispositivo; un conflicto comercial no se reintenta ciegamente.

## Opción A: offline por dispositivo

Cada teléfono conserva su SQLite/outbox y sigue trabajando sobre su proyección local. Ventajas: menor infraestructura y operación aislada. Limitación crítica: sin Internet, teléfonos independientes no comparten inmediatamente mesas, pagos, rondas ni stock. Es aceptable solo con procedimientos que asignen cuentas/zonas por dispositivo o toleren conciliación y conflictos.

## Opción B: PACHAX Edge local

Un servicio dentro del club coordina teléfonos por LAN y sincroniza luego con la nube. Permite estado común durante caída WAN, pero introduce servidor, energía/UPS, red local, descubrimiento, certificados, actualizaciones, observabilidad, backup y recuperación. No se debe improvisar antes de definir hardware y soporte.

## Recomendación

Para un club grande con varios meseros y caja simultánea, elegir Edge si el negocio exige continuidad compartida durante una caída total. Device-only sirve como degradación controlada, no como consistencia multi-dispositivo. La decisión debe tomarse antes del piloto de dinero real midiendo duración/frecuencia de cortes, número de terminales, SLA y capacidad de soporte local.

## Coste cualitativo por venta típica

Con listeners acotados: catálogo cacheado; piso lee solo mesas/zonas activas; cuentas solo estados abiertos; Barra solo rondas activas; inventario solo roles autorizados. Una ronda típica produce 1 operation ACK, 1 round, 1 update de account, N updates de inventario, N movimientos y 1 audit; lee account, productos y N stocks dentro de la transacción. Un pago produce 1 ACK, 1 payment, 1 update de account, posible liberación de mesa y 1 audit. No se descarga un `NightclubDataset` gigante ni se relee historial cerrado en cada reconexión.

## Pendientes de go-live

Seleccionar/probar SQLite, cifrado y migraciones; implementar proyección local completa; conectar UI canónica; resolver clock/skew y orden causal; políticas de cortesías/void; autorización por monto; conciliación/alertas; pruebas de carga; observabilidad; Node 22; activar Blaze con aprobación; desplegar y validar el proyecto correcto; piloto con dispositivos y red real.
