# C1 — Admin B1 y núcleo de onboarding comercial

Fecha: 25/10/2026
Rama: `codex/commercial-core-c1`
Base: `origin/main` `c927b45e7f7ad6347086b589970a10e21376d6a7`

## Alcance e integración

Se recuperaron selectivamente los cambios de Admin B1 (`codex/admin-commercial-b1`, commit `841f80d70dbaeb2cbb5e977d1793149dded64631`). No se integraron las ramas completas D2–D5 ni se copiaron cambios de landing, demos, tutoriales, Nightclub o registros canónicos protegidos.

La identidad comercial se deriva de `PUBLIC_TEMPLATES`: `restaurant` → `restaurant_pos`; `hamburger` → `hamburger_shop`; `distribution` → `route_distribution`; `nightclub` → `nightclub_lounge`; `retail` → `gelateria_weight_cafe`. Hamburger es una identidad comercial propia, distinta de Restaurante con salón. El backend mantiene compatibilidad de lectura con el antiguo `canonicalTemplateId: restaurant` y al guardar normaliza Hamburger a `hamburger`.

Los IDs elegibles para planes se derivan localmente del registro canónico sin modificar `src/core/publicTemplates.ts`, que pertenece al workstream de Gemini y aún no contiene Hamburger en sus constantes comerciales estáticas. `platform.cjs` aplica la misma unión derivada. Los modos quedan fijos por modelo: restaurante con salón, distribución y nightclub son venta asistida; hamburger y retail son autoservicio.

## Admin B1 recuperado y conectado

- Admin muestra cinco plantillas y separa modalidad comercial, disponibilidad, costo de implementación y planes/mensualidades.
- Planes y extras de semilla se guardan como borradores. Ningún precio de referencia se publica automáticamente.
- Owner y Admin pueden gestionar planes; solo Platform Owner puede marcar una tarifa como aprobada. El servidor vuelve a validar antes de publicar.
- Los planes publicados requieren aprobación, precios válidos, características completas y `technicalEntitlements` vacío. Publicar el catálogo no activa permisos ni suscripciones.
- Las características comerciales son texto editorial, no permisos. Billing Core y la aplicación de límites por plan permanecen desactivados.
- Se añadió una sección Admin «Solicitudes comerciales» para que Owner/Admin consulte leads paginados y prepare propuestas en borrador con implementación única, mensualidad, anualidad y extras. Cada actualización usa `requestId` idempotente y auditoría; no publica ni activa la propuesta.
- Platform Content conserva edición editorial, pero no puede cambiar precios, disponibilidad comercial, aprobación o publicación de extras sin `plans.manage`.
- El catálogo público aislado del store ahora filtra borradores, precios pendientes, datos incompletos, ofertas con entitlements y catálogos vacíos/error. No usa `localStorage` como fuente pública.

## Onboarding comercial

Se añadió el contrato `submitCommercialInterest` en `tenantGateway` y el servicio cliente `src/services/commercialOnboarding.ts`. Un usuario autenticado puede registrar interés por una de las cinco plantillas; un plan opcional se valida en servidor y queda guardada una copia con precio y versión. `requestId` hace idempotente el reintento. El servidor obtiene UID/correo de Auth; rechaza campos `uid`, `tenantId`, roles, planKey o entitlements enviados por el navegador. Las solicitudes no tienen lectura/escritura directa desde SDK Firestore.

El flujo registra un prospecto no vinculante, no una empresa. No se conectó a `/register` ni a la landing porque las pantallas públicas pertenecen a Gemini en G2.4. Se documenta el adaptador requerido para que Gemini conecte la sección de precios al catálogo publicado sin cambiar su diseño.

`completeOnboarding`/`createTenant` conserva sus contratos. No se aceptan plan, suscripción, pagos ni entitlements del cliente. Hamburger y Retail siguen `provisioningStatus: coming_soon` y el servidor devuelve `FAILED_PRECONDITION` al intentar crear tenant. El plan elegido nunca se convierte en suscripción activa.

La propuesta Admin queda en `status: draft`; Owner/Admin no la pueden activar mediante estas acciones. La activación manual futura necesitará una operación independiente y un gate de Billing/aceptación.

## Rules, índices, Storage y producción

Se agregó una denegación explícita de acceso directo a `platformCommercialIntents/**`, incluyendo operaciones de propuesta. El acceso se realiza solo mediante Functions con las comprobaciones `platformActor`/Auth existentes. No se abrió ninguna escritura desde cliente ni se alteraron reglas de otras plantillas. No se agregaron índices: la lista usa `createdAt` descendente con cursor y límite máximo 50; las demás lecturas son por ID.

Auditoría de Storage (solo código): `uploadTenantLogoToFirebase` escribe logos bajo `tenants/{tenantId}/branding/`, acepta JPEG/PNG/WebP/SVG hasta 2 MiB; las Rules permiten lectura pública de branding y escritura a owner/admin activo con el mismo límite y tipos. SVG puede contener contenido activo; recomendar convertir/sanitizar a raster y revisar si la lectura pública es necesaria antes de usar logos de cliente. `uploadProductImageToFirebase` escribe bajo `tenants/{tenantId}/products/`, pero las reglas actuales deniegan esa ruta; además el cliente no restringe el tipo/tamaño. No debe considerarse una subida productiva funcional. La disponibilidad/configuración real del bucket no se consultó ni se modificó en Firebase remoto. No se creó bucket, Storage Rules, IAM ni facturación.

## Coordinación G2.4

La candidata C1 preserva sin edición las áreas reservadas `src/public/landing/**`, `src/public/config/commercialShowcase.ts`, `src/core/publicTemplates.ts`, tutoriales y componentes de Distribución. `TemplatePricingSection.tsx` aún no consume el catálogo Admin; el `commercialConfigStore` y el helper `commercialCatalogContract.ts` son el contrato para esa adaptación visual posterior. Los cambios de Gemini se mantienen en su candidato/worktree; no fueron integrados a esta rama.

Orden recomendado posterior: comparar ambas candidatas sobre `origin/main`, integrar semánticamente el registro de cinco identidades, adaptar la sección de precios a `useCommercialConfig()` preservando la composición G2.4, y volver a probar catálogo publicado/vacío/error. Nunca copiar de la landing los precios estáticos como fallback oficial.

## Validación local

Emuladores aislados: `demo-pachax-c1`; Auth `9535`, Firestore `8535`, Functions `5401`; interfaz/UI `4500`. No se reutilizó el proyecto/puerto común ni se contactó Firebase Production.

- `build:functions-core`: PASS.
- `build:rules`: PASS.
- `typecheck`: PASS.
- `build:emulator`: PASS; advertencia existente de chunks mayores a 500 kB.
- Seguridad Platform por HTTPS contra Functions Emulator: 61 comprobaciones PASS (Owner/Admin/Content/Support, planes, extras, identidad hamburger, prospectos, propuestas, permisos, direct Rules y gates de onboarding).
- Onboarding autenticado por HTTPS contra Emulator: 23 comprobaciones PASS (idempotencia, tenant, aislamiento, paletas, empresa adicional y rechazo de Hamburger/Retail).
- `adminPlatformSecurity.test.ts`: 29/29 PASS.
- `commercialCatalogContract.test.ts`: PASS.
- ESLint focal en archivos C1 modificados: PASS.
- No se hizo QA visual autenticado de la nueva pestaña Admin; las pruebas D2.2 de Admin B1 ya existían, pero esta interfaz de solicitudes es nueva y queda pendiente de navegador.

## Archivos propios C1

Backend: `functions/platform.cjs`, `functions/tenantEntrypoints.cjs`, nuevo `functions/commercialOnboarding.cjs`, `firebase/firestore.rules`, pruebas de Platform/onboarding. Admin: store/types, planes, plantillas, `AdminShell`, nuevo `CommercialIntentsSection.tsx`, helper `commercialCatalogContract.ts`, nuevo servicio cliente y pruebas de contrato. `CONTEXTO.md` y este informe.

No se modificó `vercel.json`, los entrypoints/rutas de demos, `src/demo-isolated/**`, archivos de landing/Gemini, Firestore de producción, Rules/Functions publicadas, IAM, Storage remoto ni cuentas/empresas reales. No se hizo push ni despliegue.

## Decisión

**GO local para revisar el Admin B1 y el núcleo de interés/propuesta en emuladores. NO-GO para onboarding autoservicio público, publicación comercial y contratación.** Falta integrar el catálogo en la interfaz de precios de Gemini, una UX pública de interés/registro autorizada y Billing Core. Las restricciones técnicas de creación de tenants permanecen vigentes.
