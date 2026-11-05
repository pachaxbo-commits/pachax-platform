# Auditoría de tutoriales para la landing — Fase 5

Fecha: 04/11/2026  
Rama: `codex/pachax-platform-home-redesign-20261104`  
HEAD auditado: `89ce8222bad211e1f75f93e5029ed707645ed853`

## Criterio

Se revisaron los registros de plantillas y rutas públicas, `DemoRuntime`, los adaptadores/datasets de demo y los tutoriales de cada experiencia. La landing no debe abrir una vista de tenant ni llamar Firebase. El punto de partida debe ser `/demo/<plantilla>?data=full`, con disponibilidad comprobada mediante `isPublicDemoEnabled`. El estado operativo de Restaurante, Distribución, Nightclub y Comercio es de demo; la operación demostrativa de Retail no se guarda en backend. No se deben reenviar credenciales, tokens o mensajes de control al iframe.

## Rutas y experiencia pública observada

`PUBLIC_TEMPLATES` declara cinco rutas, todas técnicamente disponibles por defecto y sujetas al override explícito de Admin. `DemoRoot` resuelve esas rutas al `DemoRuntime` público, no al entrypoint tenant. El parámetro `data=full` sí se reconoce en las cinco demos; la landing actual usa `?tour=pos` en Restaurante, pero no hay lector de ese parámetro en el demo. Distribución sí reconoce `?tour=start`; no se debe extrapolar ese parámetro a otras plantillas.

| Plantilla | Ruta y UI ejecutada | Tutorial real disponible | Acciones/estado demostrativo y límites |
|---|---|---|---|
| Restaurante con salón | `/demo/restaurant`; `RestaurantDemo` con perfil restaurante y UI canónica `RestaurantExperience` | Centro de aprendizaje y recorridos POS, mesas, cocina, caja y módulos complementarios. Los pasos provienen de definiciones `restaurant*Tour`; varios observan o navegan, y el propio tutorial indica que no abre cuentas, añade productos, envía comandas ni cobra por la persona. | La demo permite operar con datos de prueba. Persistencia de operaciones de demo en `sessionStorage` bajo namespace restaurant demo. No confundir tutorial de navegación/observación con una operación realizada. |
| Restaurante rápido | `/demo/hamburger`; mismo `RestaurantExperience` con perfil `counter_service` y recorrido `counter_pos` distinto | Centro de aprendizaje ajustado al perfil rápido: POS, personalización, entrega, medios de cobro, cocina/pedidos/historial según acceso. La guía explica los controles; no confirma pedidos ni pagos por el usuario. | Dataset y perfil de Restaurante Rápido en modo demo. Persistencia temporal de demo; una guía de salón no debe reutilizarse como su flujo POS. |
| Producción y Distribución | `/demo/distribution`; `DistributionDemo` monta `DistributionExperience` y `DemoDistributionRepository` | Centro de tutoriales con tracks onboarding, inventario, rutas, ventas, cierres y administración. `?tour=start` abre el centro existente. Sus pasos distinguen `observe`, `navigate` y `action`; operaciones verificadas modifican el repositorio demo. | Repositorio demo serializado por `demoContext` en `sessionStorage` y namespace `route_distribution`; reset local. No hay movimientos de tenant ni llamadas financieras reales desde ese adaptador. La guía depende de roles/datos disponibles y puede mostrar pasos no ejecutables como observación. |
| Nightclub & Lounge | `/demo/nightclub`; `NightclubDemo` monta la UI canónica `NightclubExperience` con dataset y controlador demo protegido | `NightclubTutorial` genera tracks según rol, permisos y datos presentes. En modo demo, `safePractice` permite operaciones de práctica locales con confirmación explícita; en tenant, el tutorial se vuelve observacional para operaciones sensibles. No inicia caja ni registra cobros por sí solo. | `guardNightclubDemoController` limita efectos al controlador demo. Su estado usa namespace Nightclub demo en almacenamiento local; el control de reinicio de la demo limpia ese ámbito. Mesas, rondas y mapas reflejan la vista existente; no se rediseñarán en esta fase. |
| Comercio / Venta rápida | `/demo/retail`; `QuickRetailDemo` y vistas de POS, ventas, caja, inventario y productos de demo | No se encontró centro/tutorial dedicado en `src/modules/retail` ni `src/demo/quick-retail`. | El POS de demo busca y selecciona productos de unidad/peso; para peso solicita gramos manuales, valida una forma de pago demo y presenta un comprobante ilustrativo. El carrito y la lista de ventas residen en estado React local; no hay lectura física de balanza ni QR bancario emitido. La landing debe identificar cualquier guía corta como práctica demo, sin atribuirla a un centro tutorial existente. |

## Implementación previa de la sección 5

`GuidedTutorialsSection.tsx` mantenía cuatro plantillas, datos/editoriales por paso y once escenas hechas con JSX. Anteriormente sus botones Anterior/Siguiente cambiaban el contenido sin esperar una acción, y el CTA de Restaurante apuntaba al `?tour=pos` no reconocido. Sus textos incluían capacidades no verificadas (p. ej. RS232/USB, cobro QR dinámico y stock automático). Todo eso se debe retirar o convertir en información comprobable.

## Consecuencias de diseño para la fase

- La demo pública auténtica es la interfaz demostrativa principal; la landing no debe dibujar un dashboard pretendiendo que sea la aplicación.
- Mantener la regla de una sola interfaz canónica y respetar el gate Admin `isPublicDemoEnabled` en selector, iframe y CTA.
- La guía pública es una introducción breve. Sus pasos solo pueden mostrarse como completados al observar una navegación/acción del demo; «siguiente» no equivale a completado.
- Si no existe recorrido interno (Comercio), denominar la instrucción «práctica guiada de demostración» y no asegurar que el centro de tutoriales la ofrece.
- Los flujos reales profundos se abren en la demo pública. Las acciones confirmadas allí solo son datos ficticios de ese modo demo, no una invitación a cobrar, cambiar inventario o operar en Production.
- Oportunidad pendiente: actualizar posteriormente los mapas de mesas de Restaurante y Nightclub dentro de sus módulos canónicos. Fuera de alcance de Fase 5.
