# Planes y Capacidades Core V1 — reporte de release

## Release controlado de PR #12

- Base aprobada: `983b66f78b7696230ff698d5cd7d8531eaafc7fc`.
- `main` final: `97cd6bf3fc60f4ea1d6cdc64c9241c53b317ac8d`.
- Rules publicadas: SHA-256 `5BF9AF967C35852CEE21014343A8D05BC31D880C5B2998441B5613BA37EAD7A0` (coincide con el ruleset compilado y desplegado).
- Backup del ruleset activo y de índices: `C:\PACHAX\release-backups\pr12-20261029\`.
- Functions: `platformGateway` revision `platformgateway-00009-mon`; `tenantGateway` revision `tenantgateway-00011-fer`; `processTenantOperation` revision `processtenantoperation-00004-jun`.
- Índice aditivo `retailProducts(branchId ASC, active ASC)`: READY, `projects/pachax-platform/databases/(default)/collectionGroups/retailProducts/indexes/CICAgJiHgokK`. No se eliminaron ni alteraron índices existentes.
- Vercel Production `pachax-app`: READY, deployment `dpl_4ok7DhxhTxAefndQpFJEwDdyhU3C`, asociado a `97cd6bf`.
- Revisión de solo lectura: siete tenants existentes, cero con `billingEnforcement: true`; no se crearon usuarios, tenants, contratos, pagos ni suscripciones en Production. Altas públicas y formulario siguen cerrados.

## Validación

- Con Node 24.13.0 (Node 22 no está instalado en este host): Platform Security 77/77 con secreto ficticio exclusivo del emulador; Billing Core; cuotas/capacidades; alta asistida; Restaurant backend y dominio; Retail tenant; Nightclub backend y dominio; Distribution 59/59 más suites de paridad/catalogación; typecheck; build de Functions y Rules; `build:emulator`.
- El build normal no se ejecutó con configuración de Production; faltan deliberadamente variables Firebase locales. No se copiaron variables productivas. No se publicó Preview.
- Staging queda pospuesto y sin servicios adicionales; los Previews automáticos continúan deshabilitados y la guarda que rechaza una configuración Preview apuntando a `pachax-platform` permanece activa.

## Compatibilidad

Los tenants legacy sin `billingEnforcement: true` mantienen el comportamiento previo y no recibieron migraciones ni cambios de datos. El nuevo índice se limita a la colección Retail indicada. No se desplegaron Storage Rules, pasarelas de pago ni servicios ajenos a PR #12.
