# Certificación de alta asistida y renovación por plantilla

## Alcance de esta matriz

Esta validación certifica **el transporte comercial compartido en Firebase Emulators**: cotización mensual de prueba, aceptación registrada, cargo inicial, referencia pendiente, conciliación completa, alta asistida, creación del acceso Owner, login de Auth Emulator, renovación derivada del contrato y preservación de capacidades. No confirma que una oferta real esté aprobada ni que una plantilla esté lista para venta/uso productivo.

La prueba usa importes, compañías, correos y referencias QA temporales en `demo-pachax-platform`. No usa clientes reales, datos bancarios, QR oficial, pagos bancarios, tenants Productivos ni despliegue. El caso por plantilla no selecciona un plan publicado: usa cotización manual, con `planKey: null` y capacidades ficticias de contrato para comprobar el recorrido de provisión/billing.

## Resultado del ciclo comercial emulado

La matriz se ejecuta en el bloque `additionalTemplateCases` de `functions/tests/commercialBilling.test.cjs`. Por cada fila, el caso ahora comprueba también la renovación completa: cargo `renewal` de BOB 25.00, referencia en revisión sin extensión de acceso, conciliación autorizada, período extendido y capacidades iguales tanto en suscripción como en tenant.

| Oferta | `businessType` | Caso | Resultado de este bloque |
|---|---|---|---|
| Restaurante Rápido | `hamburger_shop` | Cuota mensual, pago inicial conciliado, alta Owner, capacidades y renovación | PASS emulador |
| Comercio / Retail | `gelateria_weight_cafe` | Cuota mensual, pago inicial conciliado, alta Owner, capacidades y renovación | PASS emulador |
| Restaurante con salón | `restaurant_pos` | Cuota mensual, pago inicial conciliado, alta Owner, capacidades y renovación | PASS emulador |
| Distribución | `route_distribution` | Cuota mensual, pago inicial conciliado, alta Owner, capacidades y renovación | PASS emulador |
| Nightclub & Lounge | `nightclub_lounge` | Cuota mensual, pago inicial conciliado, alta Owner, capacidades y renovación | PASS emulador |

Además, `functions/tests/assistedTenantProvisioning.test.cjs` cubre plantilla inválida, rol denegado, operación duplicada/idempotente, contrato/saldo pendientes y restricciones antes de crear usuario Auth/tenant; incluye el alta base de Distribución y la resolución de negocio de Hamburger/Retail.

## Evidencia funcional independiente

La existencia del alta no acredita funciones operativas de la plantilla. Las suites que deben seguir verdes para certificar cada runtime son:

| Plantilla | Cobertura específica disponible | Límite de esta Fase E |
|---|---|---|
| Restaurante con salón | `npm run test:restaurant`, `npm run test:restaurant-backend`, `npm run test:restaurant-floor-browser` | No se repitieron aquí; el resultado de alta/renovación no valida turnos, mesas, cocina ni caja. |
| Restaurante Rápido | Dominio Restaurante (`restaurantG33FastFoodUX`, recorrido de POS rápido), regresión de demo/landing, motor/backend compartido de Restaurante | No se repitieron aquí; no se afirma operación de cocina/POS productiva por el flujo de billing. |
| Distribución | `npm run test:distribution`, `npm run test:distribution-universal-e2e`, `npm run test:distribution-route-management` | No se repitieron aquí; no se afirma cobertura de rutas, cartera o inventario productivos. |
| Comercio / Retail | `npm run test:retail-tenant` | No se repitió aquí; el flujo de billing no prueba peso, catálogo, caja o recibos. |
| Nightclub & Lounge | `npm run test:nightclub`, `npm run test:nightclub-pending-settlement`, `npm run test:nightclub-orders-backend` | No se repitieron aquí; no se certifican mesas VIP, rondas, caja nocturna o devoluciones. |

La certificación de una venta real exige integrar la matriz comercial con las pruebas funcionales de su rama/runtime y un tenant QA autorizado; sin ese tenant, el estado de salida para cada plantilla sigue siendo **pendiente de certificación operativa productiva**.

## Resultado comercial y bloqueos de publicación

**Alta asistida/renovación emulada: PASS para las cinco plantillas.**

**Ventas reales/publicación comercial: NO-GO global, con razones separadas por tenant/oferta.** Este no es un rechazo del flujo de emulador: en la base todavía no hay decisión oficial verificada para métodos de pago/QR/banco/titular, precios y capacidades por plan, términos jurídicos, canal oficial de contacto o habilitación de contratación autónoma. El plan puede publicarse solo tras sus aprobaciones reales; publicar tampoco abre por sí mismo el autoservicio.

| Plantilla | Alta/renovación emulada | Oferta real aprobada | Operación real certificada para nuevos clientes |
|---|---|---|---|
| Restaurante con salón | PASS | No verificada en esta fase | Pendiente tenant QA operativo |
| Restaurante Rápido | PASS | No verificada en esta fase | Pendiente tenant QA operativo |
| Distribución | PASS | No verificada en esta fase | Pendiente tenant QA operativo |
| Comercio / Retail | PASS | No verificada en esta fase | Pendiente tenant QA operativo |
| Nightclub & Lounge | PASS | No verificada en esta fase | Pendiente tenant QA operativo |

No se convierte ninguna fila en «lista para vender» por el solo hecho de tener demo, suite operativa o flujo de activación emulado.
