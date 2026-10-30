# Documentos e Impresión Core V1

## Verificación focal de PR #13 — 29/10/2026

- Actualizada la aserción de Restaurante para la ruta canónica de embed `/demo?template=${templateId}&embed=studio`; 117/117 pruebas Restaurant.
- El efecto del `DemoRuntime` isolated embed activa temporalmente el contexto de documento demo para Restaurante, Hamburger y Nightclub. Una prueba ejercita la ruta común usada por Studio, genera un PDF por plantilla y confirma que (a) `tenant === null` continúa denegado fuera del embed, (b) un snapshot comercial con recibos deshabilitados continúa denegado aun dentro del contexto de demo, y (c) limpiar el embed cierra el acceso. Retail permanece fuera de la allowlist hasta disponer de adaptador de documentos. No se completó una inspección visual real de iframe: Computer Use terminó por no poder validar la URL de Chrome en Windows; queda pendiente confirmación visual manual y no se reporta como PASS.
- Node 22.23.4: PrintEngine 18/18, Documentos Core 10/10, Restaurante 117/117 + backend 57/57, Retail emulado 13 assertions, Nightclub 97/97 + backend 15 flujos, Distribución 59 pruebas + 21 assertions E2E, capacidades comerciales/Rules PASS; typecheck, build Functions, `build:emulator` y ESLint focal PASS. El build emitió la advertencia existente de chunks mayores a 500 kB; no se amplió el alcance para optimización.
- Compatibilidad de runtime demostrada comparando el validador de `origin/main` con el candidato: el anterior falla cerrado ante el snapshot de capacidades documentales al ajustar cuota de productos; el actual acepta ese mismo contrato. Matriz necesaria para publicar el contrato coherentemente: `platformGateway` (publicación/contratos/provisionamiento), `tenantGateway` (operaciones Restaurante/Hamburger/Retail/Nightclub y ajustes de producto) y `processTenantOperation` (operaciones Distribución y ajustes de producto). No desplegar antes de actualizar los tres. Rules/Storage no cambian por este bloque.

Rama de revisión: `codex/documents-printing-core-v1`, basada en `main` `97cd6bf3fc60f4ea1d6cdc64c9241c53b317ac8d`. Este bloque no está integrado ni desplegado.

## Contrato compartido

- `BusinessDocument` v1 guarda el sobre común de tipo, tenant, sucursal, referencia de origen, fecha, identidad y payload. Cada plantilla conserva su formato y cálculos de dominio.
- `resolveBusinessDocumentContext` compone `BusinessIdentity` con datos opcionales de sucursal y fallbacks de branding legacy.
- PDF/compartir recibos digitales y envío al motor compartido comprueban `commercialCapabilities` para tenants con enforcement. Tenants legacy conservan el comportamiento anterior.
- `PrintEngineService` es el motor único. Los trabajos automáticos de cocina/barra deben marcar `executionMode: 'automatic'`; esos trabajos requieren `printing.kitchenAutomatic`. Los demás trabajos manuales requieren `printing.manual`.
- Billing valida el snapshot y rechaza combinaciones de capacidades no soportadas por plantilla. Admin puede seleccionar únicamente las capacidades actualmente soportadas.

## Integración por plantilla

| Plantilla | Documentos conectados | Impresión |
|---|---|---|
| Restaurante Rápido (`hamburger_shop`) | Recibo digital y PDF tras la venta confirmada; branding del tenant | Diálogo del navegador o perfil compatible; comanda automática de cocina por el motor compartido y bajo capacidad contratada |
| Restaurante con salón (`restaurant_pos`) | Comprobante de pago y precuenta desde el flujo de mesa | Comanda de cocina y dispositivos existentes; impresión automática de cocina sujeta al snapshot |
| Distribución (`route_distribution`) | Mantiene recibos de venta y cobro de cartera y sus valores originales; usa el modal/servicio canónico existente para PDF/compartir | Continúa con `PrintEngineService` y payloads de distribución, sin cambiar cálculos, saldos ni costos |
| Nightclub (`nightclub_lounge`) | Recibo digital de cuenta | Recibo manual y comanda de barra por el motor compartido; no requiere ticket térmico |
| Comercio Rápido (`gelateria_weight_cafe`) | Recibo interno de venta rápida, PDF/compartir y nota no fiscal | Usa el mismo motor y el diálogo del navegador o perfil compatible |

Los reportes descargables no se implementan aquí: pertenecen al siguiente bloque Reports Core. `digital_report` queda tipado para ese contrato, pero no habilita una exportación. El comprobante de Retail explícitamente no es factura fiscal.

## Capacidades comerciales

La matriz de soporte del servidor (`functions/commercialCapabilities.cjs`) permite `receipts.digital` e `printing.manual` en las cinco plantillas. `printing.kitchenAutomatic` se admite en Restaurante con salón, Restaurante Rápido y Nightclub (cocina/barra); se rechaza para Distribución y Comercio Rápido. Admin no permite marcar esa capacidad en estas últimas.

Para tenants con `billingEnforcement`, los controles de UI y los servicios cliente comprueban el snapshot de capacidades escrito por Billing; un snapshot ausente cierra el acceso a documentos/impresión. Los tenants legacy no se migran ni quedan bloqueados. La impresión física es una acción local del dispositivo: este control de cliente organiza la experiencia según el plan, pero no es una barrera antifraude que pueda impedir que un operador modifique JavaScript local o use otra aplicación.

## Dispositivos y límites

- El navegador puede abrir el diálogo de impresión y usar impresoras instaladas por Windows/macOS/Linux y sus drivers.
- Los adaptadores registrados actualmente incluyen diálogo web, Android Bluetooth SPP y Android Network TCP. Este bloque no demuestra compatibilidad con todo modelo USB, WebUSB, RawBT, Bluetooth LE, iOS ni impresión silenciosa.
- USB puede funcionar mediante el driver del sistema y el diálogo web cuando el navegador lo expone. RawBT requiere un adaptador/intención disponible en el dispositivo y no se declara soportado por esta entrega.
- No se probaron impresoras, lectores, Android físico, RawBT ni periféricos reales; requieren QA en los equipos objetivo. El resultado depende de navegador, sistema operativo, driver, permisos y configuración local.
- El esquema actual de operación utilizado por estas experiencias expone principalmente la sucursal `main`/principal. El contrato acepta branchId e identidad de sucursal, pero no se afirma que todas las plantillas carguen aún los metadatos de sucursales adicionales.

## Correcciones focales de revisión PR #13 (29/10/2026)

- Los tres fallos observados en `src/services/printing/__tests__/printEngine.test.ts` también reproducían sobre el `main` base, por lo que eran fallos heredados y no regresiones de Documentos Core. Los escenarios de lease/recovery compartían estado porque el helper reutilizaba un singleton que conserva la primera instancia de storage; el test de logo esperaba bytes ESC/POS que el contrato actual no genera desde una URL. La suite ahora crea motores aislados por prueba, comprueba el raster mediante `EscPosBuilder.rasterImage()` y verifica el logo/branding en el HTML del diálogo web. Resultado: 18/18 PASS en Node 22.
- Capacidad documental: `tenant === null` ahora falla cerrado fuera del contexto explícito de demos aisladas. Las experiencias autenticadas exigen tenant activo y `submitPrintRequest` deriva tenant/sucursal del contexto activo, rechaza IDs contradictorios y valida la impresora contra ese mismo alcance. Es control local del cliente; no se afirma que bloquee a quien manipule JavaScript local. Las operaciones de dominio, permisos y capacidades comerciales siguen siendo la frontera servidor.
- Restaurante con salón: la vista, PDF/texto compartido e impresión marcan `PRECUENTA — PENDIENTE DE PAGO` antes del cobro; el comprobante posterior dice `PAGO CONFIRMADO`. Son etiquetas documentales, no factura fiscal, y no cambian totales ni registros financieros.
- Reimpresión: únicamente un documento con pago confirmado puede salir como `COPIA`; genera otro trabajo de impresión con clave única y no vuelve a invocar venta/cobro. El modal ya no informa impresión física completada por el mero hecho de abrir el diálogo del navegador.
- Nightclub: los nuevos planes parten con recibo digital habilitado e impresión manual/automática deshabilitada. Impresión automática de barra no es beneficio predeterminado. La matriz del servidor todavía admite la capacidad para contratos legacy/selecciones explícitas validadas; no se deshabilitó ningún flujo operativo existente.
- Build de emulador completo, typecheck, ESLint focal y las suites indicadas en el checkpoint de `CONTEXTO.md` pasaron. No se probó hardware real; impresoras, Android/periféricos y confirmación física siguen pendientes de pruebas en equipos objetivo.

## Pruebas y pendientes de revisión

- `npm run test:documents-printing-core`: pruebas del contrato, identidad, compatibilidad legacy, gates de capabilities, mapping de importes y clasificación manual/automática.
- `npm run test:commercial-capabilities`: emulador Firestore, validación por plantilla, rechazo de combinaciones no soportadas, límites concurrentes/idempotencia cubiertos por la suite existente.
- Typecheck, build de Functions, build aislado de demos y regresiones de las plantillas relevantes ejecutados localmente; los resultados exactos del cierre quedan en el informe de entrega/CONTEXTO.
- La suite focal de PrintEngine quedó en 18/18; recovery de lease y raster lógico tienen pruebas reproducibles, pero no equivalen a certificación de hardware físico.
- ESLint focal de los archivos nuevos y de Admin/Retail pasó. El lint del conjunto modificado también encuentra deuda heredada de tipos/`catch` en `receiptService`, `NightclubExperience` y `printOrchestratorService`; no se amplió este bloque para refactorizarla.
- No se creó Preview ni se modificó Production, Firebase, Rules, IAM, facturación, demos publicadas o código de Encomiendas.
