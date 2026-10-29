# Hamburger / Retail y activación manual de clientes

Estado: implementación local para revisión; no integrada ni desplegada.

## Entregas

### Billing Core manual V1

Rama separada `codex/billing-core-manual-v1`, commit `f25204809419f790b4f38a25baba96f371a25dfc`, base `origin/main` `734aa372f8a2f2153ac203bf6fc33892367b8f52`. Incluye solicitud comercial interna, cotizaciones versionadas, evidencia de aceptación, cargos y pagos manuales sujetos a conciliación de Owner/Finance, activación asistida solo después del pago confirmado, enlaces de un solo uso para el propietario y renovaciones/cambios de plan diferidos. No incorpora pasarela, checkout ni webhooks. Reglas niegan acceso cliente directo a documentos Billing Core. Pruebas focales en emulador: 11 aserciones de Billing y 11 de alta asistida, además de 77 de Platform Security (resultados registrados al completar la primera entrega).

### Habilitación técnica Hamburger y Retail

Rama separada `codex/hamburger-retail-billing-activation`, basada localmente en el commit anterior. Hamburger usa la experiencia canónica `restaurant_pos`/`RestaurantApp`; `hamburger_shop` se conserva como identidad comercial/técnica propia. Se habilita el aprovisionamiento asistido para Hamburger y Retail en los contratos existentes, pero el registro autónomo permanece cerrado fuera de emuladores.

Retail agrega `functions/retailTenant.cjs`, conectado por `tenantGateway`, el repositorio `src/modules/retail/data/retailRepository.ts` y `QuickRetailExperience`. El servidor controla permisos de miembro y sucursal, precios, stock, caja y pagos, ejecuta transacciones idempotentes y registra auditoría. Se cubren productos por unidad o peso (stock base en unidades/gramos), ajustes de inventario, apertura/cierre, venta en efectivo/QR/mixta, cambio, egresos y reintento seguro. El recibo del navegador es informativo, no fiscal. Reportes muestran como incompleto el historial limitado a 50 operaciones; no presentan esa lista como total histórico.

El selector de plantillas marca Hamburger y Retail técnicamente disponibles para que puedan ser considerados por la alta asistida. No publica precios ni planes, no concede entitlements y no abre alta pública. Rules no autorizan escrituras cliente a las colecciones operativas.

## Comprobaciones de esta entrega

- Node 22.23.4: `npm run typecheck`, `npm run build:functions-core`, `npm run build:rules` y `npm run build:emulator` pasaron.
- ESLint focal en los archivos de interfaz, repositorio, Function y pruebas modificados pasó.
- Firestore/Auth/Functions Emulator con proyecto `demo-pachax-platform` y puertos aislados: suite Retail tenant, 11 aserciones; alta asistida, 13 aserciones; Platform Security, 77 comprobaciones. Incluyen roles, aislamiento entre tenant/sucursal, estado de membresía, idempotencia, concurrencia de última unidad, precios calculados por servidor, cierre de caja y rechazo de lecturas/escrituras directas donde corresponde.
- Chrome headless local, sesión autenticada creada exclusivamente en emuladores: producto, inventario, turno, venta, recibo interno y reportes; 1440×900 y 390×844 sin overflow. En la sesión medida no hubo llamadas a endpoints remotos de Firebase.
- La compilación muestra avisos existentes de chunks JS mayores a 500 kB; la certificación no incluye optimización global del bundle.

## Requisitos antes de un piloto

- Revisar y autorizar cada PR antes de hacer push; no se publicó Preview ni se modificó Production.
- Desplegar coordinadamente `tenantGateway` con `retailCommand`, frontend y el índice `retailSales(branchId ASC, createdAt DESC)` de `firebase/firestore.indexes.json`. No se necesita una nueva apertura de Rules para escrituras cliente; confirmar la revisión final de reglas con la candidata antes del release.
- Platform Owner debe registrar cotización/contrato y el pago debe ser verificado manualmente por Owner/Finance antes de alta asistida. La referencia de transferencia/QR por sí sola no equivale a pago.
- Definir con el cliente inventario inicial, sucursal, catálogo/unidades, usuarios/roles, tratamiento de caja, recibos, horario/zona, soporte, cancelación y exportación/entrega de datos. No importar existencias sin verificación del cliente.
- Hacer el alta real asistida solo tras aprobación explícita del release y del contrato. No crear cuentas/empresas reales con fines de QA.
- Probar con el cliente el flujo de cobro, cierre/arqueo y permisos en su hardware aceptado. Impresora térmica, escáner físico y cámara no se probaron.

Sin autorización de integración, despliegue, publicación comercial o contrato del cliente, ambas ramas siguen siendo candidatas locales y no habilitan producción.
