# Auditoría funcional Nightclub / Lounge

Fecha: 25/09/2026. Base auditada: `28fb708`.

## CURRENT vs DESIRED

| Área | CURRENT | DESIRED |
|---|---|---|
| POS | Dataset completo creado dentro de `NightclubApp`; selector de mesa en una tarjeta lateral; catálogo sin búsqueda/categorías; carrito visible solo al tener líneas. | Catálogo protagonista, cuenta siempre visible en escritorio y drawer sticky en móvil; destino por ID para mesa o cuenta personal; búsqueda y categorías. |
| Zonas | Módulo visible como “Salón”; cards grandes; seleccionar mesa salta al POS; reserva reducida a un nombre. | “Zonas” compacto, leyenda accesible, tres zonas por fila, drawer operativo con reserva, cuenta, rondas, saldo y acciones. |
| Cuentas | Lista visual de las mismas mesas; sin búsqueda ni filtros; un pago final. | Vista financiera con filtros por estado/destino/zona/mesero, búsqueda, consumido/pagado/saldo y pagos múltiples. |
| Barra | Rondas `pending/preparing/ready`; los estados internos aparecen en inglés en algunas vistas; “ready” desaparece de la cola. | Pendiente → En preparación → Listo → Entregado al mesero; solo ítems de Barra entran en la cola. |
| Inventario | Estado dentro del dataset; editar `current` reemplaza el valor y crea un movimiento genérico. | Movimientos explícitos de reposición/retiro/ajuste/merma con motivo, anterior, movimiento, nuevo, actor y fecha. |
| Productos | CRUD local; receta obligatoria; precio, stock y receta mezclados; sin imagen. | Producto simple crea/vincula stock, preparado abre composición, sin control no descuenta; precio inequívoco, imagen controlada y destino Barra/Entrega directa. |
| Clientes | CRUD local y asociación opcional por ID. | CRM por ID; cuenta personal exige cliente existente o nombre identificable; teléfono nunca se inventa. |
| Usuarios | CRUD local de `staff`; el rol recibido por la experiencia no restringe módulos ni acciones. | Producción deriva Membership; demo/Studio simula permisos reales; backend vuelve a validar comandos sensibles. |
| Caja | Apertura/cierre y movimientos locales; efectivo excluye QR/tarjeta; una cuenta tiene un único pago total. | Pagos parciales acumulables; saldo real; cierre bloqueado por saldos; métodos derivados de todos los pagos. |
| Historial | Lista mínima de cuentas cerradas. | Filtros y detalle de rondas, ítems, pagos y eventos auditables. |
| Reportes | Siete métricas del dataset actual. | Resumen, ventas, operación, equipo, inventario, caja y clientes derivados de hechos; filtros temporales; exportación tabular Excel/PDF. |
| Configuración | Solo conteos. | Empresa, branding, operación y enlace a gestión de zonas, siempre según permisos. |

## Estado de conexión real

- `NightclubApp` ejecuta `createNightclubDataset('full')` y `useNightclubController`. Al no recibir `storageKey`, incluso producción vive solo en memoria y se reinicia al remontar.
- `NightclubDemo` usa el mismo controlador y persiste un único `NightclubDataset` en `localStorage`. El evento `storage` sincroniza pestañas con reemplazo completo y no resuelve concurrencia.
- Studio y demo sí reutilizan `NightclubExperience`, por lo que se conserva la experiencia canónica.
- Ninguna vista Nightclub usa actualmente Firestore, `tenantGateway` ni Functions. Las Rules integradas protegen el núcleo tenant, pero todavía no contienen colecciones operativas Nightclub.
- Los roles de Studio son una simulación. Antes de esta tarea el valor `role` solo se mostraba en el header; todos los módulos y acciones seguían disponibles.
- Zonas, mesas, cuentas, rondas, productos, inventario, clientes, staff, turnos, caja y auditoría se guardan juntos en memoria/localStorage. Esto no es un modelo válido para producción multiusuario.
- Las relaciones principales usan IDs (`zoneId`, `tableId`, `activeAccountId`, `accountId`, `roundId`, `productId`, `inventoryId`, `customerId`, `shiftId`). La limitación crítica es que toda cuenta exige `tableId` y solo admite `payment` singular.
- La lógica de dominio principal está separada de React, pero altas de productos, inventario, clientes, usuarios y asignación de cliente siguen implementadas dentro del hook de UI.

## Arquitectura de transición

```text
NightclubExperience
        ↑
NightclubController / application layer
        ↑
┌────────────────────┬────────────────────────┐
│ Demo repository    │ Tenant repository      │
│ fixture/localStorage│ Firestore + Functions │
└────────────────────┴────────────────────────┘
```

El contrato productivo debe trabajar con documentos separados para zonas, mesas, cuentas, rondas, pagos, productos, inventario, movimientos, clientes, turnos y auditoría. Los comandos deben incluir una clave idempotente y ejecutarse en transacciones; el servidor deriva tenant, actor, precios, permisos y transiciones. No se debe escribir un `NightclubDataset` gigante en Firestore.

## Estado backend honesto

El backend productivo Nightclub **no está operativo**. Functions no está desplegado porque Firebase exige Blaze. Esta rama puede preparar contratos, paths, Rules y pruebas en emuladores, pero no debe afirmar persistencia remota hasta implementar el adaptador tenant, desplegar Functions y validarlo contra `pachax-platform`.

## Resultado de esta rama

Se implementaron el nuevo dominio de cuentas/rondas/pagos, las vistas operativas canónicas, el contrato de repositorio y paths tenant, y Rules de lectura por permiso con escrituras cliente denegadas. La persistencia productiva sigue pendiente: no existe todavía una implementación de `NightclubRepository` sobre Firestore/Functions. Los filtros avanzados de Historial/Reportes, reservas completas, branding editable desde Configuración y autorizaciones de cortesías/anulaciones quedan para una fase conectada al backend.
