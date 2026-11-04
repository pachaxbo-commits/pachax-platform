# Billing Core Manual 2.0

Estado: candidata local para revisión. Rama `codex/billing-manual-2-20261104`, desde `origin/main` `72acc1649d781702fa8536061b3bdf3bdf49d24b`. Sin push, merge ni despliegue.

## Flujo y controles

Se extiende el Billing Core existente; no hay un segundo sistema de facturación. El recorrido compatible es solicitud/WhatsApp → cotización versionada → aceptación → contrato y cargo → referencia externa → conciliación manual → alta asistida o extensión de período. Una referencia nunca representa un pago confirmado. Solo Platform Owner o Finance pueden conciliar; Platform Admin no confirma pagos. El tenant Owner ve únicamente la suscripción de su empresa, sus cargos, pagos y métodos configurados. Los empleados no reciben acceso a facturación. Las colecciones internas permanecen cerradas por Firestore Rules y se consultan mediante gateways autorizados.

Los importes permanecen en unidades menores enteras y moneda explícita. No se convierten USD/BOB implícitamente. La cotización mensual puede dejar la anualidad vacía; se conservan precio y condiciones acordados en snapshots. Los descuentos requieren autorización y motivo. Las referencias duplicadas, operaciones repetidas y dobles confirmaciones se protegen con idempotencia/transacciones.

## Períodos, renovaciones y acceso

- Zona de cálculo: `America/La_Paz`. La aritmética conserva el día ancla en meses cortos, fin de mes y año bisiesto.
- Períodos permitidos: prepago mensual de 1, 2, 3, 6 o 12 meses; prepago anual de 1, 2, 3 o 5 años. Otros valores se rechazan.
- Pago anticipado o exactamente al vencimiento conserva el tiempo ya pagado. El pago durante los 7 días de gracia también se suma desde el vencimiento. Tras agotarse la gracia, el nuevo plazo comienza en el instante de regularización para no asignar fechas ya vencidas.
- La gracia no requiere una tarea programada: Functions, Rules, Admin y la interfaz derivan el estado de las fechas persistidas. Durante gracia las operaciones siguen disponibles; tras ella, una suscripción con enforcement queda restringida, conservando datos e historial y dejando el portal de regularización accesible al propietario.
- `pending`, `suspended` y `cancelled` no dan acceso operativo. Un pago recibido no reactiva suspensiones administrativas ni contratos cancelados; la reactivación excepcional exige Platform Owner, cargo renovado ya conciliado, motivo y auditoría.
- Un cambio de plan se aplica al próximo período pagado y no reescribe el snapshot contractual histórico.
- Si se rechaza una referencia de renovación, se libera el saldo reservado y el puntero a cargo pendiente cuando corresponde; pagos, referencias y auditoría permanecen para historial.

El bloqueo de acceso se activa solo para tenants con `billingEnforcement: true`. Los siete tenants legacy sin ese indicador no se migran ni reciben cambios de datos ni enforcement. No se alteran rutas de login ni se borran datos cuando una suscripción vence.

## Administración y portal del cliente

Facturación en Admin incorpora consulta paginada, búsqueda/filtros sobre registros cargados, saldos y resumen rotulado como parcial cuando corresponde, creación de renovaciones/prepagos, revisión de referencias, conciliación, rechazo, estados y reactivación autorizada. Los métodos de pago se configuran desde Owner; Finance tiene lectura. Notas internas están aisladas de los clientes, paginables, idempotentes y auditadas. Las correcciones solo modifican cargos aún no conciliados ni reservados, conservan importe original y requieren motivo; pagos parciales/confirmados no se editan ni eliminan.

`Mi empresa → Suscripción y pagos` se comparte entre Hamburger, Comercio, Restaurante con salón, Distribución y Nightclub. El backend devuelve solo el contexto del propietario activo. Se muestran estado, ciclo, precio acordado, fechas, gracia, saldo, cargos/pagos, instrucciones y contacto. La referencia se puede reportar, pero no confirma el ingreso. El acceso limitado de regularización evita exponer pantallas operativas después del fin de gracia. Los avisos 7/3/0 días se ocultan a empleados y el cierre del aviso informativo se conserva durante la sesión.

## QR, transferencia y límites comerciales

La plataforma admite configurar una imagen QR bancaria oficial, datos de transferencia y WhatsApp institucional desde Admin; la configuración requiere autorización y validación. **En esta candidata no se configuró ni inventó un QR ni una cuenta bancaria real.** El recorrido de navegador usa datos ficticios del emulador y una transferencia QA; se verificó que queda `pending_review`, reserva el importe y no se presenta como conciliada. La prueba no realiza una transferencia real. No hay checkout, pasarela, webhook, cobro automático ni integración WhatsApp Cloud.

Los registros internos de cargos/pagos no son facturas fiscales. No existe integración con SIN, autorización fiscal ni generación de factura fiscal. El tratamiento de pagos, moneda/tipo de cambio y documentos fiscales debe seguir la política aprobada con contabilidad; no se cambia moneda ni se calcula conversión automática.

## Seguridad y auditoría

El servidor deriva identidad, tenant, rol, permisos, estado, importes y extensiones. Firestore Rules deniega lectura/escritura directa del cliente a las colecciones privadas de Billing. Cada mutación valida autorización, estado, solicitud idempotente y relación entre contrato, cargo, pago y tenant dentro de transacción. Los eventos relevantes registran actor y tiempo: cotización/contrato, cargos, referencias, confirmación/rechazo, renovación, suspensión/reactivación, cambio de plan, métodos y correcciones.

No se modifica App Check, IAM, Secret Manager, Rules productivas ni datos reales. El cierre de formulario público y de registro autónomo se conserva.

## Validación local

Node `v22.23.4`, rama aislada y emuladores `demo-pachax-platform`:

- Billing policy: fechas de La Paz, meses de 29/30/31, año bisiesto, estados activo/gracia/vencido/suspendido, inicio de renovación anticipada/en gracia/expirada y fallos cerrados. PASS.
- `commercialBilling.test.cjs`: **29 comprobaciones PASS** en Auth/Firestore Emulator. Incluye el flujo completo sin plan publicado para las cinco plantillas: contacto interno, cotización mensual, aceptación, referencia ficticia pendiente, conciliación, alta asistida y acceso inicial del propietario. También cubre cotización mensual sin anualidad, extras sin plan, pagos parciales/completos, cuotas, compatibilidad legacy, estados, permisos, renovaciones/prepagos, competencia Owner/Finance, idempotencia, notas/correcciones privadas, rechazo de referencias y Rules.
- `platformSecurity.test.mjs`: **77 comprobaciones PASS**, con valor secreto ficticio temporal del emulador; el archivo temporal se eliminó. App Check en Functions Emulator se registra como MISSING porque el emulador no lo simula; esto no cambia enforcement ni configuración de Production.
- Chrome autenticado en emuladores: UI Admin Owner modifica nota privada y aplica corrección permitida, que persiste con auditoría; Facturación en 390×844 y 1440×900 sin overflow. En cinco plantillas, el portal muestra el estado ficticio en ambos viewports; Retail registra una referencia de transferencia ficticia como pendiente y Firestore confirma `pending_review` sin conciliar. Hamburger conserva listener de caja y ajustes de configuración; Restaurante con salón llega a su configuración de impresoras.
- El test de integración de Billing completa cotización mensual, aceptación, cargo, referencia pendiente, conciliación manual, aprovisionamiento asistido, vínculo de suscripción y configuración de acceso del propietario en las cinco plantillas sin plan publicado. Se valida login y `settings.manage` desde el propietario en Auth Emulator. Estas altas y referencias son efímeras y locales; no son ventas ni pagos reales.
- Runner repetible de UI: `npm run test:billing-browser-emulator`. Usa `firebase.billing-browser-test.json`, `demo-pachax-platform` explícito y puertos aislados. Comprueba el aviso previo al vencimiento para propietarios, dimensiones, persistencia y referencia pendiente; Vite hereda automáticamente los puertos locales del emulador. Así evita colisionar con servicios activos de otros worktrees sin detenerlos.
- `test:platform`: **302/302 PASS**. `build:functions-core`, `build:rules`, `typecheck`, `build:emulator` y ESLint focal de los archivos modificados: PASS. El build emulador generó 96 assets aislados, 0 sourcemaps y 0 referencias prohibidas.

La app compilada en modo emulador solo hace requests hacia hosts locales; los tests con datos se fijan al proyecto `demo-pachax-platform`. No se crean empresas, usuarios, contratos o pagos ficticios en Production.

## Limitaciones antes de publicar

1. Se requiere revisión/aprobación de esta candidata y luego un release coordinado de código, Functions y Rules; no desplegar parcialmente.
2. El propietario debe proporcionar y aprobar QR, datos bancarios, instrucciones y número oficial; no transferir a valores de QA.
3. No se probó con dinero real, bancos, QR real, impresora física, servicios fiscales ni una pasarela externa.
4. Los registros de historial son paginados y el resumen de cobranza representa los registros cargados, no un agregado ilimitado de todas las páginas.
5. La corrección de un cargo pagado o parcialmente pagado no está habilitada: requiere una futura operación compensatoria aprobada, no una edición destructiva.
6. Deben aprobarse los términos comerciales, avisos de vencimiento/cobro y tratamiento contable/fiscal con el responsable correspondiente. El formulario público continúa cerrado.

## Release y reversión

No hay cambio de fuente Firestore Rules en esta candidata; el archivo de índices recibe tres índices compuestos aditivos para consultas de cargos, pagos y notas por contrato. Antes de publicar, respaldar configuración de índices y registrar las revisiones vigentes. Crear únicamente esos índices y esperar READY; después, desde el mismo SHA, actualizar `platformGateway` (Admin Billing/conciliación/alta asistida) y `tenantGateway` (portal y referencias del propietario), confirmar ambas ACTIVE y finalmente publicar el frontend. `processTenantOperation`, Storage, Rules, otros gateways y triggers no cambian en este diff. Mantener pausadas las nuevas altas durante la transición. Verificar con lecturas no destructivas; no crear ni confirmar operaciones reales como smoke test.

Reversión: preferir corrección hacia delante si ya se escribieron entidades Billing V2. El frontend puede volver a un deployment anterior solo si conserva compatibilidad con el backend vigente. Functions se revierten a una revisión previa únicamente si el contrato de datos existente sigue siendo legible; las Rules nunca deben restaurarse a un ruleset más permisivo ni a uno que bloquee tenants con enforcement. No cambiar ni borrar contratos, pagos o historial durante rollback.
