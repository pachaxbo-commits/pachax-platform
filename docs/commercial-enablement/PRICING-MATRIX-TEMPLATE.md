# Matriz comercial para aprobación — PACHAX

**ESTADO: BORRADOR INTERNO NO VINCULANTE.** No es una oferta, tarifa ni autorización para publicar planes. Todos los importes están pendientes de decisión expresa del propietario.

Billing Core Manual 2.0 (PR #22), el rediseño público (PR #23) y la corrección de unidad anual (PR #25) están publicados. Esta matriz no constituye contenido público aprobado. La publicación efectiva de planes depende del estado administrado y confirmado en el catálogo; estos documentos no publican ofertas.

## Campos que admite el sistema

- Plan pagado por plantilla, con hasta tres niveles publicados. Cada nivel contiene nombre, perfil de cliente, características incluidas, capacidades técnicas, límites de usuarios/productos/sucursales, moneda `USD` o `BOB`, campos de precio mensual y anual y estado de aprobación/publicación.
- El servidor exige precio positivo para el ciclo cotizado y conserva una copia de condiciones/capacidades en la cotización y contrato. Free permanece fuera de este ejercicio y no debe publicarse.
- La plantilla admite un precio base de implementación expresado en USD; la cotización comercial admite un importe único de implementación en moneda del contrato.
- El validador compartido actualmente limita cada snapshot a **100 usuarios activos, 200 productos activos y 1 sucursal**. El valor concreto de cada plan puede ser menor; no se debe ofrecer una segunda sucursal mediante un extra ni texto comercial mientras ese máximo técnico siga en 1.
- Extras tienen modalidad recurrente, pago único o cotización personalizada; pueden aplicar a plantillas concretas o a todas y solo ampliar límites técnicos permitidos. Sus importes reales se fijan al cotizar.
- El descuento de una cotización es un importe, no porcentaje automático. Solo Platform Owner puede autorizarlo y debe registrar el motivo. No hay una tabla de promociones que se deba asumir.
- Las capacidades V1 pueden reflejar límites de usuarios, productos y sucursales; reportes básicos/detallados/exportables; recibos digitales; impresión manual/automática compatible y publicidad. Solo se deben marcar capacidades ya implementadas y comprobadas para la plantilla.

## Unidad técnica del precio anual y aprobación de importes

La convención publicada por PR #25 establece que el importe de ciclo anual es el **total por doce meses**; el equivalente mensual es únicamente informativo (`total anual / 12`). Billing registra y concilia manualmente el total anual aprobado por período, sin convertir entre USD y BOB ni realizar pagos automáticos. Un plan anual requiere confirmación expresa de `annualPriceUnit: annual_total_12_months` y aprobación del precio. Un importe histórico sin marcador no se interpreta ni se ofrece como precio anual. No se multiplican, convierten ni reescriben registros ambiguos, snapshots contractuales o cargos previos.

La publicación de PR #25 define la unidad técnica, no una tarifa ni una decisión comercial. El propietario debe aprobar expresamente los importes mensuales/anuales, descuentos, moneda, implementación y beneficios antes de configurar o publicar ofertas. El Admin no debe publicar una anualidad hasta confirmar el significado original del importe y aprobar el total por doce meses. Los métodos oficiales de cobro siguen pendientes de aprobación y configuración.

## Matriz pendiente

Rellénese únicamente después de acordar moneda, condiciones de alcance y validación técnica. “Pendiente” no equivale a cero ni a oferta disponible.

| Plantilla | ID | Implementación única | Mensual | Anual | Moneda | Usuarios activos | Productos activos | Sucursales | Funciones incluidas | Extras | Descuento |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Restaurante Rápido | `hamburger_shop` | Pendiente de aprobación | Pendiente | Pendiente de aprobación; total por 12 meses | USD o BOB por decidir | Configurable hasta 100; valor por nivel pendiente | Hasta 200; valor por nivel pendiente | Máximo técnico 1 | Productos/recetas, pedidos, caja y cocina solo si se verifican y se incluyen; ajustar a flags `reports.*`, `receipts.digital`, `printing.*` | Catálogo aplicable por confirmar; importe en cotización | Política y autoridad por aprobar |
| Comercio Rápido | `gelateria_weight_cafe` | Pendiente de aprobación | Pendiente | Pendiente de aprobación; total por 12 meses | USD o BOB por decidir | Configurable hasta 100; valor por nivel pendiente | Hasta 200; valor por nivel pendiente | Máximo técnico 1 | Catálogo, inventario, venta, caja y reportes solo según verificación; ajustar a flags técnicos disponibles | Catálogo aplicable por confirmar; importe en cotización | Política y autoridad por aprobar |
| Restaurante con salón | `restaurant_pos` | Pendiente de aprobación | Pendiente | Pendiente de aprobación; total por 12 meses | USD o BOB por decidir | Configurable hasta 100; valor por nivel pendiente | Hasta 200; valor por nivel pendiente | Máximo técnico 1 | Mesas, comandas, turnos, recibos y reportes únicamente dentro de los flujos comprobados y flags contratados | Catálogo aplicable por confirmar; importe en cotización | Política y autoridad por aprobar |
| Distribución | `route_distribution` | Pendiente de aprobación | Pendiente | Pendiente de aprobación; total por 12 meses | USD o BOB por decidir | Configurable hasta 100; valor por nivel pendiente | Hasta 200; valor por nivel pendiente | Máximo técnico 1 | Inventario, despacho, rutas, cartera y conciliaciones según sistema vigente; no alterar cálculos ni prometer capacidad no comprobada | Catálogo aplicable por confirmar; importe en cotización | Política y autoridad por aprobar |
| Nightclub | `nightclub_lounge` | Pendiente de aprobación | Pendiente | Pendiente de aprobación; total por 12 meses | USD o BOB por decidir | Configurable hasta 100; valor por nivel pendiente | Hasta 200; valor por nivel pendiente | Máximo técnico 1 | Cuentas, rondas, pagos/caja y recibo digital según capacidades activas; no prometer impresión automática predeterminada | Catálogo aplicable por confirmar; importe en cotización | Política y autoridad por aprobar |

## Aprobación requerida por cada nivel

1. Importe mensual, moneda y si incluye implementación.
2. Importe/convención anual, prepago y cualquier descuento explícito.
3. Alcance de implementación, sucursales y asistencia inicial.
4. Límites técnicos que se puedan imponer efectivamente en backend.
5. Capacidades que efectivamente pasan la autorización del servidor. No presentar `includedFeatures` o texto comercial como entitlement técnico si no está validado.
6. Extras, modalidad, importe, alcance y quién los aprueba.
7. Vigencia de la oferta y condiciones de renovación.

## Procedimiento para completar en Admin

Platform Owner configura/actualiza el plan y revisa características, capacidades, límites, moneda e importes. Debe confirmar explícitamente la unidad anual y la aprobación comercial antes de publicar. No usar el catálogo editorial o precios de ejemplo como tarifas. Para una cotización manual mensual, Admin permite dejar la anualidad vacía. Para una oferta anual basada en plan se requiere unidad confirmada, total de doce meses aprobado y método manual de cobro aprobado. El registro autónomo y el formulario comercial público continúan cerrados.
