# Backend de seguridad de PACHAX Platform

## Región

La base Firestore `(default)` de `pachax-platform` está en `southamerica-west1` (Santiago, Chile). Firebase soporta esa ubicación para Functions v2. Las Functions tenant y Platform nuevas usan `southamerica-west1`, igual que `src/services/gateway.ts`.

Los entrypoints históricos `restaurants/pachax` conservan `us-central1` mediante `LEGACY_FUNCTIONS_REGION`. `supportMaintenance.ts` continúa llamando ese callable histórico en la misma región. `functions/regions.cjs` y `src/config/functions.ts` hacen explícita la separación; la suite de seguridad verifica la región nueva para evitar desalineación.

## Autorización

`platformGateway` exige simultáneamente:

- Firebase Authentication válido;
- custom claim `platform: true`;
- documento activo `platformOperators/{uid}`;
- rol Platform reconocido;
- permiso server-side para la acción solicitada.

Los roles reconocidos son `platform_owner`, `platform_admin`, `platform_support` y `platform_finance`. Firestore Rules niega toda lectura o escritura cliente de `platformOperators`, `platformBootstrap`, `supportSessions` y `platformAuditLogs`. Un operador tampoco recibe acceso directo a datos tenant por Rules: todo acceso Platform pasa por funciones con allowlists.

## Acciones de `platformGateway`

| Acción | Permiso | Resultado |
| --- | --- | --- |
| `validateOperator` | operador activo | UID, rol y permisos efectivos |
| `listTenants` | `tenants.read` | directorio paginado, máximo 50 filas |
| `tenantDetail` | `tenants.read` | metadatos, configuración y miembros acotados |
| `listTemplates` | `templates.preview` | contratos sanitizados para vista previa futura |
| `beginSupport` | `support.read` | sesión read-only para un tenant y rol visual |
| `supportContext` | `support.read` | contexto de sesión sin cambiar identidad Auth |
| `elevateSupport` | `support.elevate` | edición por 15 minutos, confirmación y motivo obligatorios |
| `supportUpdateSettings` | `support.elevate` y sesión vigente | modificación allowlisted mediante `settingsPatch` |
| `endSupport` | `support.read` | cierre auditado de la sesión |
| `queryAudit` | `audit.read` | últimos eventos, con límite server-side |

La sesión read-only nunca habilita escrituras directas. La elevación solo está asignada actualmente a `platform_owner`. El operador conserva siempre su UID real; `viewedRoleId` describe únicamente la vista futura.

## Auditoría

Los eventos sensibles guardan `operatorUid`, rol, acción, `tenantId` cuando corresponde, motivo, recurso, metadatos acotados y `createdAt` con `FieldValue.serverTimestamp()`. El cliente no define timestamps ni identidad. El bootstrap, lectura de detalle tenant, inicio, elevación y cierre de soporte, y cambios elevados quedan auditados.

El procedimiento de creación del primer propietario está en `docs/PLATFORM-BOOTSTRAP.md`. No se ejecutó contra el proyecto real.
