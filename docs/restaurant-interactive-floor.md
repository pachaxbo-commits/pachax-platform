# Restaurante: plano operativo de mesas — Fase C

## Base y auditoría
Base remota verificada: abf0bfe6bc0b16760704cee24694a98a7a98b350. Worktree propio, rama codex/pachax-restaurant-interactive-floor-redesign-20261106. Las ramas origin/codex/restaurante-turnos-mesas, origin/feat/dario-restaurant-redesign y restaurant-release-gate ya son antecesoras de main; se inspeccionaron sin modificarlas. El commit local 8bff82e7591382bacb5efa057764498ef30b6d15 contiene únicamente nueve líneas de cierre de Comercio en CONTEXTO.md; queda preservado en su rama original y no se incorpora a Fase C.

RestaurantTables antes mostraba tarjetas por sector y un drawer de cuenta. Sus callbacks abren la cuenta, agregan productos, imprimen lotes, cancelan líneas, solicitan/reabren cuenta y pagan. El backend resuelve precios, stock, permisos, tenant, sucursal, turno e idempotencia. Seleccionar una mesa solo abre sus datos. RestaurantFloorManager administra sectores, formas, capacidades, altas/bajas, orden y archivo. Se conservan esos formularios y callbacks. RestaurantExperience es el consumidor compartido por tenant y RestaurantDemo; no se crea una experiencia paralela para marketing.

## Diseño y componentes
RestaurantFloorCanvas presenta sectores reales en lienzos separados, mesas cenitales SVG y sillas según capacidad (hasta doce sillas; contador de capacidad completo). RestaurantVisualTable se memoriza para evitar recalcular sus vectores ante cambios de otros datos. Los estados se leen del modelo y se expresan mediante color y texto. El plano tiene pan nativo, zoom explícito, ajustar vista y lista accesible alternativa. No incluye objetos arquitectónicos ficticios.

El drawer operativo conserva el pedido, totales y acciones existentes; añade sector y capacidad, selección visible, cierre por Escape y retorno del foco. Los objetivos data-tour existentes se conservan. La interfaz de Restaurante Rápido conserva su flujo de mostrador; no se rediseña.

## Distribución persistente
Contrato aditivo: RestaurantTable.layout = { version: 1, sectorId, x, y, revision }. Unidades lógicas, origen superior izquierdo, límites enteros 0..2400. Sin layout válido para el sector actual se usa una distribución automática estable por sortOrder. Las posiciones no contienen estado de atención, precios o cuentas.

El modo de edición es explícito: arrastrar con mouse/lápiz en PC, seleccionar y mover con controles explícitos en celular, flechas del teclado, botones direccionales táctiles, distribución automática, cancelar y guardar. Las operaciones de cuenta no se activan durante el arrastre. Los filtros de sector se bloquean mientras hay un borrador abierto. El guardado rechaza solapamientos en la UI y conserva el borrador si hay error.

FloorAction añade layout.save. El repositorio existente envía la acción al comando autorizado floorAction; no hay escrituras directas del frontend a Firestore. El servidor exige settings.manage, valida mesa/sector de la sucursal, IDs únicos, enteros y límites, y compara revisiones de las posiciones. El guardado usa la transacción y el recibo idempotente del command gateway existente. Un conflicto no modifica pedidos ni estados y obliga a revisar/recargar. La revisión se captura al entrar en edición para detectar actualizaciones de otro dispositivo. Cambios operativos simultáneos no se sobrescriben porque solo se escribe layout y updatedAt.

La demo usa su adaptador local y almacenamiento de sesión preexistente. La empresa real persiste a través del gateway en restaurantTables del tenant y sucursal autorizados. Cambiar de sector invalida visualmente un layout asociado al sector anterior, conservando la mesa y su historia.

## Seguridad y publicación
No se desplegaron Functions, Rules ni Production. La ampliación de functions/restaurant.cjs debe revisarse y desplegarse por el flujo autorizado antes de publicar un frontend que ofrezca Guardar distribución. Un backend anterior devuelve error y la UI conserva el borrador. No se promete persistencia productiva antes de ese despliegue.

No se cambian motores de pedidos, inventario, caja, pagos, Billing Core, Authentication, App Check ni Nightclub. Las pruebas de escritura usan demo-pachax-platform y emuladores. La Preview productiva no se publica: se presentan build local, pruebas y capturas hasta revisar el contrato backend.

## QA reproducible
- npm run test:restaurant: dominio, operaciones, recetas, caja y tutoriales; incluye validación del layout y compatibilidad legacy.
- npm run test:restaurant-backend: emuladores Auth/Firestore/Functions; incluye permisos, revisiones antiguas, coordenadas, idempotencia y aislamiento entre sucursales/tenants del layout, además de las 58 verificaciones operativas existentes.
- node scripts/test-restaurant-floor-browser.mjs: navegador real sobre build emulador, mouse/touch CDP, nueve anchos, selección sin mutación, cancelación, edición, arrastre y recarga. Capturas y reporte en docs/restaurant-floor-evidence. Los datos sintéticos de salón grande solo se cargan en sessionStorage del navegador local de prueba.
- Regresión de landing con fixture vacío y sintético de Fase B.2, integración Hamburger/Retail y guards de aislamiento.

## Límites de revisión
No se certifica impresión física, hardware ni conectividad entre dispositivos físicos; el contrato transaccional y la concurrencia se comprueban en emuladores. Las coordenadas soportan hasta 200 mesas por guardado, con límites espaciales explícitos; los salones que excedan el área requieren revisión de dimensiones. El plano admite pan nativo; el zoom se controla con botones, no con gestos de pinza. No se ha iniciado el mapa de Nightclub.

## Resultado de validación local
PASS: TypeScript; ESLint focal; build emulador y runtime aislado (100 archivos, cero sourcemaps, cero referencias prohibidas); 118 pruebas de dominio; suite backend completa con las 58 verificaciones previas y el nuevo bloque de layout; guards de Preview/Firebase y rutas; integración de demos Hamburger/Retail en 36 combinaciones; landing vacía y sintética en nueve tamaños.

El nuevo browser QA pasó 320, 360, 375, 390, 430, 768, 1024 (horizontal 768 de alto), 1440 y 1920 px con mouse o touch. Comprueba selección sin mutación, edición, cancelación, controles táctiles, teclado, arrastre de PC, guardado y recarga de sesión. A 390/1440 abre una mesa, agrega Lomo a la Pimienta y solicita/reabre la cuenta. También prueba más de 30 mesas con formas mixtas, capacidad 100 simplificada, mesas inactivas/archivadas, tutorial, rol Mesero sin administración, empresa vacía sin sectores y turno cerrado. Cero errores del navegador y cero solicitudes a Firebase Production.

Entorno local: Node 24.13.0; Functions declara Node 22 y el emulador avisó la diferencia. No se cambió engines. El PR debe conservar su validación CI con Node 22 antes de una integración futura. El cambio queda en borrador para revisión; no se autoriza un merge ni despliegue por esta entrega.
