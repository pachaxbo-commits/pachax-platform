# Contrato backend para `/register`

Este documento permite conectar posteriormente el formulario visual sin replicar reglas de seguridad en el frontend. La interfaz de registro no forma parte de esta rama.

## Separación Auth y tenant

Firebase Auth Client SDK puede encargarse únicamente de:

1. crear la cuenta con `createUserWithEmailAndPassword`;
2. actualizar el nombre visible del usuario, si corresponde;
3. mantener la sesión y obtener su ID token;
4. recuperar contraseña y verificar correo cuando esa política se habilite.

La creación del perfil global, tenant, owner membership, roles, branch y tenant link debe pasar obligatoriamente por `tenantGateway`. El cliente no debe escribir esas colecciones directamente y Firestore Rules lo impide.

## Callable

Región: `southamerica-west1`.

Function: `tenantGateway`.
Acción: `completeOnboarding`

Solicitud:

```ts
interface CompleteOnboardingRequest {
  action: 'completeOnboarding'
  requestId: string
  companyName: string
  businessType: 'restaurant_pos' | 'route_distribution' | 'gelateria_weight_cafe'
  branding?: {
    primary?: `#${string}`
    accent?: `#${string}`
  }
}
```

`requestId` debe generarse al entrar en el paso de creación de empresa y persistirse hasta recibir una respuesta definitiva. El servidor, además, deriva el primer `tenantId` del UID autenticado, así que solicitudes concurrentes o reintentos con otro `requestId` tampoco generan un segundo tenant accidental.

No enviar `uid`, `ownerUid`, roles, permisos, claims, logo, URL de Storage ni campos de Platform. Los campos adicionales causan `invalid-argument`.

Respuesta:

```ts
interface CompleteOnboardingResponse {
  tenantId: string
  membership: {
    roleId: 'owner'
    status: 'active'
    branchIds: ['main']
    routeIds: []
  }
  template: {
    businessType: 'restaurant_pos' | 'route_distribution' | 'gelateria_weight_cafe'
    version: number
  }
  onboarding: {
    status: 'complete'
  }
}
```

La respuesta no contiene correo, tokens, claims, secretos ni información administrativa.

## Reintentos y estados

- Dos llamadas concurrentes para el mismo UID convergen en el mismo tenant.
- Una llamada posterior devuelve el mismo contrato si la transacción anterior quedó completa.
- Si se detectan documentos parciales preexistentes, responde `failed-precondition` y no intenta completar silenciosamente el estado.
- Si el usuario ya tiene un `tenantLink` pero no un onboarding inicial completo, responde `failed-precondition`; la UI debe dirigirlo al selector de empresas.
- Un operador Platform activo recibe `permission-denied`.

El endpoint está limitado al primer tenant. Esto no convierte la arquitectura en “una cuenta = una empresa”: `users/{uid}/tenantLinks/*` y memberships múltiples permanecen intactos. La creación posterior de otra empresa deberá usar un flujo autenticado separado, con su propia política e idempotencia.

## Documentos creados atómicamente

```text
tenants/{tenantId}
tenants/{tenantId}/members/{uid}
tenants/{tenantId}/roles/{roleId}
tenants/{tenantId}/branches/main
tenants/{tenantId}/auditLogs/{eventId}
users/{uid}
users/{uid}/tenantLinks/{tenantId}
users/{uid}/onboarding/initialTenant
```

Todos se crean en una sola transacción Firestore y usan timestamps de servidor. El UID autenticado es siempre el owner y la membership siempre se crea con `roleId: owner`; esos valores no se aceptan desde el cliente.

## Integración sugerida de `/register`

1. Validar los campos visualmente sin tratarlos como autorización.
2. Crear la cuenta mediante Firebase Auth Client SDK.
3. Esperar una sesión autenticada válida.
4. Invocar `tenantGateway` con el contrato anterior.
5. Ante timeout, reintentar con el mismo `requestId`.
6. Guardar el `tenantId` devuelto mediante el flujo normal de `ActiveTenantContext`.
7. No subir logos todavía; Storage permanece fuera de este onboarding.
