# Roadmap de Club nocturno / Lounge

## Base actual

La plantilla `nightclub_lounge` tiene una experiencia canónica independiente:

```text
NightclubApp        -> adapter productivo temporal/local
NightclubDemo       -> datasets ficticios empty/full
NightclubExperience -> interfaz compartida por producción, Studio y demo
```

La base utiliza IDs estables para zonas, mesas, cuentas, rondas, productos, clientes y reservas. Una mesa mantiene una sola cuenta activa durante toda la noche:

```text
abrir mesa -> agregar ronda -> enviar a barra -> agregar nuevas rondas
-> solicitar cuenta -> cobrar -> liberar mesa
```

El procesamiento real remoto todavía no está conectado. No confundir la experiencia y el motor local de demostración con persistencia multiempresa terminada.

## Evolución funcional

- Open tabs sin mesa para clientes en barra, conservando identidad de cuenta.
- División de cuenta por productos, personas o montos.
- Reapertura autorizada con motivo, rol y auditoría.
- Reservas con anticipo y asignación de zona/mesa.
- Floor plan editable para General, VIP, Lounge, Barra y Terraza.
- Servicio rápido y búsqueda por cliente, mesa o cuenta.
- Control de botellas, porciones, mixers, cortesías y recetas en ml/unidades.
- Historial y CRM vinculados por `customerId` estable.
- Impresión por área, con Barra / preparación como destino principal.
- Preautorización de tarjeta solamente cuando exista proveedor, política comercial y manejo seguro de tokens. No guardar datos de tarjeta en PACHAX.

## Backend pendiente

Antes de conectar datos reales se debe completar la cadena de seguridad para cada operación:

- paths `tenants/{tenantId}` y scope de branch;
- memberships y permisos específicos de Nightclub;
- validación server-side de mesa, cuenta, precios, descuentos, cortesías y estados;
- Rules o Functions para las mutaciones sensibles;
- idempotencia de rondas, cobros y cierres;
- auditoría de anulaciones, reaperturas, cortesías, descuentos y movimientos de inventario;
- pruebas positivas y negativas de aislamiento tenant.

No copiar literalmente las Rules de Distribución ni conectar el adapter local actual como si fuera persistencia productiva.

## Dirección visual posterior

Helmy puede evolucionar la experiencia dentro de `src/modules/nightclub/**` y `src/demo/nightclub/**` sin modificar Restaurante. La dirección visual debe priorizar salón, VIP, rondas, barra, cuentas abiertas y caja; Delivery, Takeaway, bots y cocina tradicional no deben dominar la navegación.
