# Billing Core Manual V1

Estado: implementación local para revisión; no integrada ni desplegada.

## Flujo comercial

1. Platform Owner registra un contacto llegado por WhatsApp en `platformCommercialIntents`. El formulario público permanece cerrado. La referencia de solicitud es determinista por operador e `requestId`; repetirla con los mismos datos devuelve el registro existente y cambiar el payload se rechaza.
2. Owner/Admin prepara una cotización en centavos enteros. El plan y los extras se guardan como snapshots; solo se aceptan extras publicados para la plantilla. El descuento requiere Platform Owner y motivo. Una oferta no se puede editar hasta retirarla; después de una aceptación no se puede cambiar.
3. El operador ofrece la cotización y registra una evidencia de aceptación identificable. Solo entonces se crea un contrato, una suscripción pendiente y un cargo inicial. El contrato conserva los términos aceptados; cambios posteriores de catálogo no alteran esa instantánea.
4. Owner/Finance registra una referencia externa de transferencia o QR. La referencia queda reservada y no equivale a pago. Owner/Finance verifica directamente el ingreso y confirma cada abono. Los pagos parciales se concilian, pero no activan.
5. Solo un cargo inicial totalmente conciliado cambia el contrato a `ready_for_activation`. La alta asistida vuelve a leer el contrato y su cargo pagado dentro de las transacciones, antes de completar la empresa. No acepta alta gratuita ni una plantilla cuyo aprovisionamiento no esté disponible.
6. Si la identidad es nueva, se crea deshabilitada y se habilita tras la transacción que activa empresa, membresía, contrato y suscripción. El propietario recibe un enlace de un solo uso para establecer su contraseña; las cuentas existentes conservan su método actual.
7. La renovación se emite dentro de los 30 días previos al período siguiente. Una referencia de renovación solo extiende el acceso cuando Owner/Finance la concilia. Un cambio de plan queda programado para esa renovación y no cambia el contrato histórico ni el plan activo antes de pagar el nuevo ciclo.

## Estados y controles

- Contrato: `pending_payment` → `ready_for_activation` → `provisioning` → `active`.
- Cargo: `due`, `under_review`, `partial`, `paid`.
- Pago: `pending_review`, `confirmed` o `rejected`; una referencia bancaria no confirma el ingreso.
- Suscripción: `pending`, `active`, `overdue`, `suspended`, `cancelled`.
- Operaciones y referencias tienen claves idempotentes. Una referencia bancaria no puede reutilizarse, incluso después de rechazarla.
- Solo Platform Owner y Finance pueden registrar/revisar pagos. Platform Admin puede gestionar solicitudes y cotizaciones, pero no confirmar ni rechazar pagos.
- Los documentos Billing Core son de servidor: Firestore Rules niegan lecturas y escrituras directas. Las Functions validan rol, plantilla, estado, pertenencia y saldo.
- Las siete empresas legacy no reciben migraciones ni campo de enforcement. Solo tenants nuevos ligados a un contrato llevan `billingEnforcement: true`; se bloquean en Functions y Rules cuando su suscripción no está activa. Los entitlements comerciales continúan vacíos; la capa no concede capacidades de marketing ni módulos no implementados.

## Colecciones privadas

`platformContracts`, `platformBillingCharges`, `platformBillingPayments`, `platformSubscriptions`, `platformPaymentReferenceClaims`, `platformBillingOperations` y `platformCommercialOperations`. Solicitudes y cotizaciones continúan en `platformCommercialIntents`, gestionadas por el flujo existente. No contienen credenciales de proveedor ni datos bancarios de PACHAX.

## Contrato para pasarela futura

Una implementación futura debe conformar operaciones privadas `createOrder`, `createCheckoutSession`, `verifyAndNormalizeNotification`, `reconcileStatus` y `requestRefund`. Cada llamada acepta un idempotency key y devuelve identificadores/estados canónicos; las notificaciones deben verificar firma sobre el cuerpo original, unicidad de evento, moneda, monto y relación con el cargo antes de actualizar una suscripción. Los secretos viven solo en Secret Manager. El mecanismo manual actual escribe sobre las mismas entidades canónicas de contrato/cargo/pago/suscripción. **No hay adaptador automático, checkout, webhook ni endpoint público de pago activo en esta entrega.** Los reembolsos automáticos quedan para la integración del proveedor.

## Activación y renovación

La activación únicamente se reserva para las tres plantillas cuyo aprovisionamiento ya está disponible. `hamburger_shop` y `gelateria_weight_cafe` pueden conservarse en catálogo/solicitudes, pero no se puede emitirles un contrato activable hasta completar la segunda entrega. No hay cobro prorrateado de cambios de plan: se aplican al próximo ciclo pagado. Los extras se conservan desde el snapshot del contrato.

## Acceso, vencimiento y compatibilidad

- Un contrato pagado inicia un período mensual/anual y persiste `billingAccessUntil`: fin del período más 7 días de gracia. La renovación íntegramente conciliada calcula y persiste el próximo límite; no hay Function programada.
- Durante el período y la gracia, los estados `active` y `overdue` conservan acceso. Al vencer `billingAccessUntil`, o si el estado es `pending`, `suspended` o `cancelled`, Functions y Firestore Rules deniegan operaciones/read paths de tenant. Login e identificación de membresías siguen disponibles.
- Admin calcula `effectiveStatus` al consultar suscripciones: `grace` durante la gracia y `expired` al agotarla; no se altera el historial ni depende de una tarea programada.
- El control aplica solo si `billingEnforcement == true`. Las empresas existentes sin ese campo no se migran y conservan sus permisos históricos. Si un tenant nuevo enforcement-enabled carece de fecha válida, el acceso falla cerrado.
- `createManualCommercialIntent` conserva extras aunque `planId` sea null. No se publican ni activan suscripciones como resultado de crear una solicitud.

## Pruebas locales

`npm run test:billing-core` construye los artefactos Functions y usa solo `demo-pachax-billing-v1`, Firestore/Auth emulados y puertos aislados 8285/9295. La suite cubre ingreso manual, idempotencia, roles, extras sin plan (uno y varios), cotización, aceptación, pago parcial/total, rechazo sin cargo pagado, alta pagada, acceso inicial del propietario, aislamiento, compatibilidad legacy, estados activo/gracia/vencido/suspendido/cancelado/pendiente por Rules y Functions, acceso al worker de Distribución, detección de expiración en Admin, cambio de plan diferido, renovación y denegación por Rules. En esta corrección pasó con 14 aserciones.

No se modificó Firebase Production, Vercel, IAM ni datos de empresas existentes. Esta rama no debe desplegarse hasta aprobar la PR y programar el release de backend, reglas y frontend de forma coordinada.
