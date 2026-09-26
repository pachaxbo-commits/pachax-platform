# Plan de pruebas de confiabilidad Nightclub

| Escenario | Procedimiento | Garantía esperada |
|---|---|---|
| Offline antes de ronda | Desconectar, crear ronda | Escritura durable y estado pending antes de confirmar UI |
| Offline después de durable write | Cortar red tras guardar | La operación permanece pending |
| Kill antes de sync | Cerrar proceso y reiniciar | SQLite/IndexedDB recupera mismo operationId |
| Retry | Fallar transporte y reintentar | Aumenta attempts; no crea comando nuevo |
| Duplicate command | Enviar dos veces el mismo operationId y payload | Servidor devuelve mismo ACK; rechaza el mismo ID con payload distinto |
| Dos dispositivos, misma mesa | Abrir simultáneamente | Una transacción confirma; otra conflict |
| Pago vs ronda | Cobrar y enviar ronda concurrente | No se añade ronda a cuenta cerrada |
| Payment retry | Repetir pago tras timeout | Un payment, un efecto de caja |
| Inventory retry | Repetir ronda/movimiento | Un solo descuento |
| Internet vuelve | Restaurar conectividad tras 30 min | FIFO, ACK explícito, conflictos visibles |

Automatizado hoy: persistencia previa a aceptación local, outbox pending/syncing/confirmed/failed/conflict, retry estable, colisión de ID, duplicados de turno/ronda/pago/movimiento de caja, lock de mesa, inventario y aislamiento tenant. Manual pendiente: persistencia real tras kill en Android, dos dispositivos físicos, 30 minutos offline, presión de carga y recuperación de Edge si se elige.
