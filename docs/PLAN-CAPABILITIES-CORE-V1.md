# PACHAX Planes y Capacidades Core V1

## Alcance

Esta entrega establece un contrato versionado de capacidades comerciales entre Admin, Billing, aprovisionamiento asistido y operaciones del tenant. No añade otro motor de Billing, impresión, recibos ni reportes; tampoco habilita el plan Free, el alta pública ni cobros automáticos.

## Contrato `capabilitiesV1`

Cada snapshot incluye `version: 1`, `businessType`, límites `activeUsers`, `activeProducts`, `activeBranches` y capacidades booleanas para reportes (`basic`, `detailed`, `export`), recibos (`digital`), impresión (`manual`, `kitchenAutomatic`) y `adsRequired`. La plantilla debe coincidir exactamente con la empresa/plan.

En esta versión `reports.basic` es un beneficio base obligatorio: Admin no lo puede desactivar, porque las plantillas aún no separan de forma uniforme las lecturas operativas de las lecturas que alimentan reportes. Los informes detallados y exportaciones se rechazan. Los límites máximos verificables son 100 usuarios activos, 200 productos activos y una sucursal. Publicar un plan sin capacidades válidas, con Free o con una capacidad todavía no conectada de extremo a extremo se rechaza en servidor. Las ampliaciones de extras solo admiten usuarios/productos y no pueden superar esos máximos.

## Persistencia y enforcement

- Al guardar una cotización se conserva la versión inmutable de capacidades del plan y los ajustes de extras solicitados.
- El contrato y la suscripción aceptados conservan el snapshot aprobado. Editar después el catálogo no cambia contratos ya emitidos.
- El alta asistida copia las capacidades contratadas al tenant y crea `commercialUsage/active` en la misma transacción de aprovisionamiento.
- La creación, desactivación y reactivación de miembros actualiza el contador dentro de la transacción que modifica la membresía. Al exceder el límite se rechaza antes de dejar una cuenta Auth huérfana.
- Las altas/archivos de productos en Restaurant, Nightclub, Retail y Distribution actualizan el contador en la misma operación que guarda el producto. Distribution enruta el guardado por `tenantGateway`; Rules niega escrituras directas de productos a clientes con enforcement, conservando la ruta legacy.
- Las operaciones protegidas fallan cerradas si el contador contratado falta o es inconsistente. No se eliminan datos al bajar un límite; las altas posteriores permanecen bloqueadas hasta que el uso vuelva a estar dentro del contrato.
- Solo el permiso explícito `reports.read` queda sujeto a `reports.basic` para tenants con `billingEnforcement: true`. La integración de permisos más detallados y la consulta de reportes por plantilla queda pendiente de Reports Core.
- Los tenants sin `billingEnforcement: true` conservan el comportamiento legacy y no reciben migraciones ni cambios de datos.

## Compatibilidad por plantilla

El contrato conserva `businessType` y evita introducir dependencias de UI específicas en Core. Restaurant, Nightclub, Retail y Distribution consumen los límites comunes de producto; `tenants.cjs` aplica el límite de usuarios. El límite de sucursales queda validado como parte del contrato, pero el aprovisionamiento/alta transaccional de sucursales todavía no tiene adaptador completo y por eso la capacidad máxima publicable es uno.

La impresión manual, recibos digitales, impresión automática de cocina, reportes detallados/exportaciones y capacidades específicas de plantilla se declaran en el esquema, pero el servidor rechaza habilitarlas hasta contar con integración real, permisos, Rules y pruebas. Encomiendas queda fuera de esta entrega; su demo y código de Gemini no se modifican.

## Plan Free y límites de producto

El contrato puede representar `adsRequired`, pero no existe contratación Free, publicidad real ni alta pública en V1. Admin bloquea publicar Free. El máximo de 200 productos refleja la capacidad actualmente verificable de Retail. La propuesta comercial de 500 productos para Pro no se puede publicar hasta completar paginación/búsqueda y validar rendimiento; no se cambia el límite para acomodar una oferta no probada.

## Validación

`npm run test:commercial-capabilities` cubre la normalización del contrato, identidad de plantilla, rechazo de capacidades aún no soportadas, ajustes de extras, compatibilidad legacy, concurrencia sobre cuotas y escritura directa de productos en Rules. `npm run test:billing-core` y `npm run test:assisted-tenant-onboarding` validan el snapshot contratado, idempotencia y el aprovisionamiento inicial. Los contadores de concurrencia usan Firestore Emulator con proyecto y puertos aislados.

## Integración pendiente en bloques separados

- **Restaurante Rápido y Comercio:** usar `capabilitiesV1` y `commercialUsage/active` para productos/usuarios. Paginación de Retail antes de elevar productos por encima de 200; recibos, impresión y reportes avanzados requieren adaptadores propios.
- **Distribución:** ya aplica el límite común de productos; completar cualquier flujo de usuarios mediante `tenants.cjs`. Merma, lotes y demás capacidades por rubro siguen gobernadas por sus permisos de plantilla.
- **Restaurante con salón:** límite común de productos y usuarios; reportes, recetas/inventario y recibos deben conservar permisos de dominio y conectarse en sus entregas específicas.
- **Nightclub:** límite común de productos y usuarios, preservando permisos por caja; reportes y comisiones no se vuelven accesibles por el hecho de tener plan.
- **Encomiendas:** futura integración por adaptador después de validar su tenant real. No activar ni alterar la demo de Gemini.

## Release

Esta rama es una PR independiente basada en `origin/main`. No se ha desplegado a Firebase Production, no se han publicado Rules/Functions/índices y no se ha modificado ningún tenant real. Free permanece inactivo; formulario público y altas autónomas siguen cerrados.
