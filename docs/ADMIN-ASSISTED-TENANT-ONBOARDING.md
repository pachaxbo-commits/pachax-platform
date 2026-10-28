# Alta asistida de empresas desde PACHAX Admin

## Alcance

El flujo agrega una acción protegida a `platformGateway`; no abre `createTenant` ni `completeOnboarding` al público. En la primera versión solo Platform Owner puede listar plantillas habilitadas y crear una empresa. Las plantillas se consultan desde la configuración técnica autoritativa, por lo que Restaurante con salón, Distribución y Nightclub aparecen si su estado generado permite aprovisionamiento. Hamburger y Retail siguen bloqueadas.

## Secuencia y recuperación

1. El Owner envía los datos del negocio, correo de su propietario y UUID de operación.
2. Una transacción reserva operación y combinación de nombre/plantilla, y comprueba tenants existentes. Repetir el mismo UUID y contenido reanuda la operación; reutilizarlo con datos distintos falla.
3. Auth busca la identidad por correo. Una cuenta existente no cambia su contraseña. Una identidad nueva se crea temporalmente deshabilitada con UID aleatorio.
4. Una transacción crea tenant en estado `provisioning`, sucursal `main`, roles canónicos, membresía/link del owner pendientes, configuración inicial, auditoría y, para Distribución/Nightclub, su bootstrap requerido.
5. La identidad nueva se habilita y un enlace Firebase de configuración de contraseña se entrega una sola vez en la respuesta a Admin. El enlace no se guarda en Firestore ni en auditoría. Para una identidad existente se conserva su método de acceso.
6. Una última transacción activa tenant, membresía y vínculo, completa la operación y registra auditoría.

Una falla antes del aprovisionamiento elimina la identidad Auth recién creada cuando es posible y libera la reserva sin activar tenant. Una falla después del aprovisionamiento deja el tenant en `provisioning`, sin acceso del miembro, y permite reintentar la misma operación; no se borran datos parciales automáticamente. Una inconsistencia previa se rechaza sin sobrescribir documentos.

## Datos y seguridad

- Tenant inicial sin plan ni entitlements (`planKey: null`, `entitlements: {}`); no se cobra, no se crea suscripción pagada.
- La función comprueba `platform_owner` en servidor; ocultar la pestaña en Admin no es el control de seguridad.
- Operaciones y reservas de nombre no son legibles ni escribibles por clientes mediante Firestore Rules. Functions Admin SDK las administra y audita.
- No se reciben contraseñas. Para identidad nueva se devuelve un enlace de configuración de Firebase Auth; el operador debe verificar la identidad y entregar el enlace por un canal privado verificado.
- Para identidad existente se vincula el UID encontrado por correo, sin alterar contraseña. El operador confirma que el correo pertenece al propietario previsto.

## Pruebas y límites de release

`npm run test:assisted-tenant-onboarding` ejecuta Auth, Firestore, Functions y Rules Emulator con el proyecto ficticio `demo-pachax-platform`. La suite verifica autorización Owner, rechazo a Admin, plantillas bloqueadas, idempotencia y concurrencia, setup de contraseña, vinculación de cuenta existente, recuperación de aprovisionamiento incompleto, colisión de operación y denegación de lecturas directas. No se ha creado ningún tenant de cliente en Production.

La rama de esta implementación requiere revisión y autorización antes de merge/deploy. El primer piloto real también requiere los datos aprobados del cliente, confirmación humana del correo del propietario y entrega segura del enlace de configuración. El cierre del registro público se mantiene en `tenantGateway`.
