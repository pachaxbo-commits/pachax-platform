Continúa trabajando en:

`codex/pachax-platform`

NO hagas merge a `main`.

NO hagas push.

NO despliegues.

NO conectes Firebase real.

NO modifiques San José.

La auditoría, aislamiento, contratos, templates, login y dominio matemático ya están aceptados.

Ahora entramos en la fase más importante:

# HACER REAL LA ARQUITECTURA MULTIEMPRESA

Actualmente existen contratos nuevos con:

* `tenantId`
* businessTypes
* templates
* capabilities
* roles
* Platform conceptual

pero todavía la autorización real, Firebase, Functions y varios repositorios continúan utilizando el esquema legacy.

No quiero más contratos desconectados.

Quiero que esta fase conecte realmente el núcleo multiempresa.

---

# PRIORIDAD ABSOLUTA

El orden debe ser:

1. Auth y memberships multiempresa reales.
2. `tenantId` real en contexto/repositorios.
3. Firestore `tenants/{tenantId}`.
4. Functions/callables parametrizadas por tenant.
5. Reglas Firestore multiempresa.
6. Tests negativos de aislamiento.
7. Platform authorization server-side.
8. Onboarding.
9. `/platform`.
10. Conectar templates operativamente.

NO empezar haciendo primero pantallas bonitas de `/platform`.

Primero seguridad y dominio.

---

# 1. CORREGIR DOCUMENTACIÓN DESACTUALIZADA

Antes de continuar revisa documentos donde todavía figure:

`com.pachax.app`

El identificador vigente es:

`net.pachax.app`

No cambies referencias históricas cuando expliquen explícitamente un estado anterior, pero deja muy claro cuál es el valor ACTUAL.

Revisar especialmente:

* CONTEXTO.md
* SETUP-PACHAX.md
* CONFIGURACION.md si existe
* AGENTS.md si corresponde

Debe existir una única instrucción vigente inequívoca.

---

# 2. MODELO MULTIEMPRESA REAL

Implementar progresivamente:

```text
users/{uid}

tenants/{tenantId}
tenants/{tenantId}/members/{uid}
tenants/{tenantId}/branches/{branchId}
```

y las colecciones de dominio correspondientes debajo del tenant o mediante la estructura que resulte técnicamente mejor después de revisar consultas/Firestore.

No utilizar más:

```text
restaurants/pachax
```

como empresa fija de la nueva arquitectura.

NO eliminar el legado antes de haber migrado y probado cada consumidor.

---

# 3. MEMBERSHIP COMO FUENTE DE AUTORIZACIÓN

Una persona autenticada NO obtiene acceso a una empresa simplemente porque conoce su `tenantId`.

Debe existir:

```text
tenants/{tenantId}/members/{uid}
```

con membership válido.

Conceptualmente:

```ts
{
  uid,
  roleId,
  status: "active" | "disabled",
  branchIds?,
  routeIds?,
  createdAt,
  createdBy
}
```

Toda autorización del tenant debe partir de membership real.

---

# 4. USERS GLOBAL

Crear/reutilizar:

```text
users/{uid}
```

solamente para perfil global.

Conceptualmente:

```ts
{
  uid,
  displayName,
  email,
  defaultTenantId?,
  createdAt,
  updatedAt
}
```

NO guardar permisos efectivos globales de tenant aquí.

NO permitir que un usuario modifique directamente:

* defaultTenantId de forma insegura;
* memberships;
* roles;
* Platform role;
* plan;
* permissions.

---

# 5. SOPORTE MULTIPLE TENANTS POR USUARIO

El modelo debe permitir:

Usuario A

→ Empresa 1
→ Empresa 2

aunque inicialmente la mayoría tendrá una sola.

Si tiene una:

entrar directamente.

Si tiene varias:

preparar selector.

No necesitas todavía un selector visual extremadamente elaborado.

Pero Auth Store NO debe asumir:

`1 uid = 1 restaurantId`.

---

# 6. AUTH STORE

Migrar:

```text
restaurantId
```

cuando semánticamente representa empresa a:

```text
tenantId
```

Actualizar:

* AuthState
* cache
* bootstrap
* tenant context
* repositorios
* loaders
* navigation
* permissions

NO hacer search/replace global.

Seguir el mapa semántico documentado.

La caché debe estar correctamente aislada por:

```text
uid + tenantId
```

para evitar que un usuario que cambia de empresa vea datos anteriores.

---

# 7. ACTIVE TENANT CONTEXT

Crear una fuente única de verdad:

conceptualmente:

```ts
ActiveTenantContext
```

Debe proporcionar:

* tenantId
* tenant
* membership
* role
* permissions
* businessType
* template
* branding
* branch cuando corresponda
* route cuando corresponda

No quiero que componentes busquen por separado:

* tenant
* role
* businessType
* permissions

y puedan quedar en estados inconsistentes.

---

# 8. FIRESTORE

Migrar progresivamente los paths legacy que representan empresas.

Objetivo:

```text
tenants/{tenantId}
```

No hacer migración de datos reales.

Estamos en emuladores.

Crear seeds nuevos.

Mantener temporalmente adapters únicamente cuando sean necesarios para que las pruebas legacy sigan funcionando durante la transición.

Todo adapter temporal debe tener TODO/documentación para ser eliminado.

---

# 9. FUNCTIONS

Esto es CRÍTICO.

Actualmente existen funciones que todavía asumen la empresa fija legacy.

Parametrizar correctamente:

* operaciones;
* usuarios;
* créditos;
* mantenimiento;
* cierres;
* inventario;
* triggers.

Una callable/function NO debe confiar en:

```text
tenantId
```

enviado desde cliente sin verificar membership.

Patrón:

1. usuario autenticado;
2. recibe/deriva tenantId;
3. servidor verifica membership;
4. verifica permission/capability;
5. ejecuta.

Para operaciones Platform habrá otra autorización separada.

---

# 10. OPERACIONES IDEMPOTENTES

No perder lo ya validado en distribución.

Mantener:

* `operationId`;
* idempotencia;
* cola offline;
* ledger;
* créditos;
* inventory movements.

Al migrar a tenant:

el scope de idempotencia debe incluir correctamente el tenant.

No permitir que operation IDs iguales en empresas diferentes produzcan colisiones.

---

# 11. FIRESTORE RULES

Crear helpers coherentes.

Conceptualmente:

```text
isAuthenticated()
isTenantMember(tenantId)
isActiveTenantMember(tenantId)
hasTenantPermission(tenantId, permission)
belongsToBranch(...)
belongsToRoute(...)
isPlatformUser(...)
```

No es obligatorio que las funciones de Rules se llamen exactamente así.

Pero quiero semántica clara.

---

# 12. AISLAMIENTO

Tests obligatorios:

## Empresa A vs Empresa B

Usuario A:

ALLOW:
su tenant.

DENY:
tenant B.

Aunque conozca exactamente:

* tenantId;
* documentId;
* ruta Firestore.

## Usuario desactivado

DENY.

## Distribuidor

ALLOW:
su ruta.

DENY:
otra ruta.

## Caja

No administra usuarios.

## Admin/Owner

Puede administrar usuarios dentro de SU empresa.

No otras.

---

# 13. OWNER

Distinguir claramente:

`owner`

de:

`admin`

Si consideras que en esta fase complica innecesariamente, puede existir un role preset OWNER que incluya todo.

Pero conceptualmente necesito saber quién es el propietario principal del tenant.

No depender solamente del primer admin creado.

---

# 14. CREACIÓN DE USUARIOS INTERNOS

Migrar la gestión existente al modelo tenant.

Owner/Admin crea:

* usuario;
* membership;
* role;
* branch;
* route cuando corresponda.

Todo mediante mecanismo seguro.

No cambiar sesión actual.

No permitir que el cliente seleccione arbitrary tenantId desde frontend.

El servidor toma el tenant autorizado de la operación.

---

# 15. PLATFORM AUTHORIZATION REAL

Después de completar el tenant core, implementar autorización real de PACHAX Platform.

NO basta:

```ts
platformRole = ...
```

en UI.

Usar la estrategia más segura apropiada:

preferentemente:

* Firebase Custom Claims para bootstrap/autorización de alto nivel;
* colección Platform protegida para metadata/permisos detallados cuando sea necesario.

Puedes combinar ambas.

Requisitos:

Usuario tenant normal:

NO puede convertirse en platform user.

NO puede escribir su platform role.

NO puede entrar a `/platform`.

---

# 16. PLATFORM ROLES

Preparar:

```text
platform_owner
platform_admin
platform_support
platform_finance
```

Por ahora:

`platform_owner`

tiene todo.

`platform_support`

puede quedar limitado a soporte/lectura.

Billing sigue desactivado.

---

# 17. BOOTSTRAP PLATFORM OWNER

Necesitamos posteriormente poder crear el primer usuario PACHAX.

Preparar script seguro:

conceptualmente:

```text
scripts/bootstrap-platform-owner...
```

Debe:

* funcionar solamente con credenciales administrativas;
* recibir UID explícito;
* otorgar claim/registro Platform;
* verificar proyecto;
* impedir ejecución accidental en San José;
* impedir downgrade/overwrite accidental;
* no contener password.

Solo para emulador ahora.

Documentar cómo se utilizará después en Firebase real.

---

# 18. ONBOARDING REAL

Una vez tenant Auth/rules estén validados, conectar el onboarding.

Flujo:

```text
Crear cuenta
    ↓
Crear empresa
    ↓
Elegir tipo
    ↓
Configurar datos
    ↓
Crear tenant
    ↓
Crear membership OWNER
    ↓
Seed template defaults
    ↓
Entrar
```

Esta operación debe ser segura.

No quiero:

frontend creando arbitrariamente:

```text
tenant
membership owner
role owner
```

sin validación server-side.

Crear callable/function/server workflow.

Debe ser idempotente o protegerse contra doble submit.

---

# 19. ONBOARDING BUSINESS TYPES

Opciones:

```text
restaurant_pos
route_distribution
gelateria_weight_cafe
```

Al seleccionar template:

crear solamente la configuración base.

NO crear datos específicos:

BurgerLab
San José
Amapola.

---

# 20. BRANDING

Conectar branding básico en tenant:

* name
* logo opcional
* primaryColor
* accentColor

Si Storage todavía no tiene memberships/rules seguros:

NO habilitar upload hasta completar eso.

Puede existir nombre/colores primero.

Después Storage.

---

# 21. STORAGE

Cuando tenant memberships estén funcionando:

crear reglas para:

```text
tenants/{tenantId}/branding/...
```

Admin/Owner:
WRITE.

Miembro autorizado:
READ según necesidad.

Tenant B:
DENY.

Validar:

* MIME;
* tamaño;
* paths.

Añadir Storage al emulador/test correspondiente.

---

# 22. `/platform`

SOLO después de Platform Auth real.

Implementar:

```text
/platform
```

Sidebar:

* Overview
* Empresas
* Plantillas
* Usuarios
* Suscripciones
* Finanzas
* Soporte
* Auditoría
* Configuración

Suscripciones/Finanzas:

visible como arquitectura preparada.

No inventar datos.

Mostrar:

`No configurado`

cuando corresponda.

---

# 23. DIRECTORIO EMPRESAS

Implementar lista PAGINADA.

No descargar todos los tenants.

Mostrar:

* logo/monograma;
* name;
* tenantId;
* businessType;
* status;
* owner;
* users count cuando exista resumen;
* createdAt;
* templateVersion.

Filtros básicos.

---

# 24. FICHA TENANT

Pestañas:

* Resumen
* Configuración
* Usuarios
* Módulos
* Uso
* Auditoría
* Soporte
* Facturación

Las secciones sin fuente de datos real deben decir:

`No configurado`

No inventar.

---

# 25. SUPPORT VIEW

Implementar sesión de soporte real.

IMPORTANTE:

NO hacer Firebase sign-in como cliente.

Mi identidad sigue siendo platform user.

Crear concepto:

```ts
SupportSession {
  platformUid,
  tenantId,
  viewedRole,
  mode,
  reason?,
  startedAt,
  expiresAt
}
```

Default:

READ ONLY.

Banner permanente:

```text
MODO SOPORTE PACHAX
Empresa: ...
Vista: ...
Solo lectura
```

---

# 26. SOLO LECTURA EFECTIVO

No basta deshabilitar botones visualmente.

El backend/rules/functions debe impedir mutaciones cuando SupportSession sea read-only.

No confiar solo en React.

---

# 27. ELEVACIÓN DE SOPORTE

Platform owner puede:

`Habilitar edición`

Requiere:

* confirmación;
* motivo;
* duración/expiración.

Registrar:

* quién;
* tenant;
* razón;
* inicio;
* expiración.

Toda mutación realizada bajo soporte se audita.

---

# 28. TEMPLATE PREVIEW

Separado de Support View.

No toca empresas reales.

Usar:

* datos ficticios;
* memoria/local/demo layer;
* seeds explícitos.

Flujo:

```text
Platform
→ Plantillas
→ Restaurante
→ Preview
→ Admin/Caja/etc
```

Debe poder mostrar:

Desktop / Tablet / Mobile

si implementarlo no exige duplicar toda la app.

No sobreconstruir un emulador de dispositivos.

Responsive browser container es suficiente.

---

# 29. CONECTAR TEMPLATE RESTAURANTE

Después del tenant core:

`restaurant_pos`

debe cargar módulos reales.

No solamente registry.

Generalizar la base actual.

Antes:

revisar qué usa todavía assumptions:

* restaurante fijo;
* principal;
* restaurantId;
* BurgerLab.

Eliminar branding y datos específicos.

Mantener Bot oculto:

```text
aiAssistant = false
```

---

# 30. CONECTAR TEMPLATE DISTRIBUCIÓN

Migrar la distribución actual a:

`route_distribution`

sin perder sus pruebas P0.

Debe continuar funcionando:

* central inventory;
* route inventory;
* dispatch;
* additions;
* sales;
* credits;
* payments;
* expenses;
* returns;
* reconciliation;
* closures;
* reports;
* users;
* offline;
* printing.

Todos ahora scoped por:

`tenantId`.

---

# 31. CONECTAR HELADERÍA

Implementar finalmente el POS que ya tiene dominio matemático probado.

`gelateria_weight_cafe`

Debe permitir:

## Weight

* producto;
* gramos;
* precio/kg;
* subtotal.

## Unit

* cantidad;
* precio unitario.

Mismo carrito.

Caja:

* efectivo;
* QR;
* mixto cuando esté soportado.

Inventario comercial simple.

NO producción/recetas.

---

# 32. MODELO DINERO/PESO

Mantener lo ya aprobado:

* money en centavos;
* weight en gramos;
* BigInt/intermedios seguros;
* half-up por línea.

No volver a floats directos.

---

# 33. OFFLINE

No declarar una operación offline compatible hasta validarla realmente.

El registry debe reflejar capacidades verdaderas.

Distribución ya tiene base validada.

Restaurante y heladería:

auditar cada operación.

Si utiliza `runTransaction` incompatible con offline:

NO prometer offline.

---

# 34. IMPRESIÓN

Un solo motor común.

No romper Bluetooth existente.

Template define contenido.

Mantener:

* ESC/POS;
* Bluetooth;
* TCP si corresponde;
* reimpresión;
* fallo impresión no revierte venta.

No duplicar adaptadores por template.

---

# 35. BILLING

Mantener:

```text
billingEnforcement = false
```

Aunque tenant tenga:

```text
trial
past_due
cancelled
```

NO bloquear acceso todavía.

Platform owner debe poder revisar todo.

---

# 36. FIRESTORE INDEXES

Actualizar progresivamente para:

tenantId / subcollections según modelo final.

Consultas:

* fecha;
* branch;
* route;
* user;
* status;
* product.

No traer colecciones históricas completas.

Usar paginación.

---

# 37. TESTS OBLIGATORIOS ANTES DE DECIR "MULTIEMPRESA"

Quiero un escenario explícito:

Crear en emulador:

```text
Tenant A = Restaurante
Tenant B = Distribuidora
Tenant C = Heladería
```

Crear:

OwnerA
OwnerB
OwnerC

y empleados.

Verificar:

OwnerA:
NO puede leer B/C.

OwnerB:
NO puede leer A/C.

OwnerC:
NO puede leer A/B.

PlatformOwner:
puede listar metadata de A/B/C.

Support read-only:
puede visualizar tenant seleccionado pero no mutar.

Support elevated:
puede ejecutar mutación autorizada y genera audit log.

---

# 38. TEST DE CACHE

Muy importante:

Login usuario con múltiples tenants.

Abrir Tenant A.

Cambiar a Tenant B.

Verificar que:

* no queden ventas A;
* no queden clientes A;
* no quede branding A;
* no quede inventario A;
* no queden permisos A.

Reiniciar app.

Debe mantener contexto correcto.

---

# 39. AUDITORÍA

Crear audit event común.

Conceptualmente:

```ts
{
  actorUid,
  actorType: "tenant" | "platform",
  tenantId?,
  action,
  resource,
  resourceId?,
  before?,
  after?,
  reason?,
  createdAt
}
```

Sanitizar información.

NO guardar:

* password;
* token;
* secrets.

---

# 40. ESLINT

NO quiero que gastes esta fase arreglando 211 errores heredados sin relación.

Pero:

* ningún archivo nuevo debe añadir errores;
* excluir correctamente artefactos Android/build generados si eslint los está inspeccionando;
* documentar deuda legacy.

No declarar lint global limpio hasta que realmente lo esté.

---

# 41. NODE FUNCTIONS

Functions declara Node 22.

Hasta ahora parte de pruebas se ejecutaron con Node 24.

Antes de cerrar esta fase:

repetir validaciones relevantes con Node 22.

No asumir compatibilidad porque Node24 funciona.

---

# 42. NO HACER

Todavía NO:

* Firebase real;
* Git remote;
* Vercel;
* producción;
* billing real;
* Stripe;
* Mercado Pago;
* IA;
* bot visible;
* producción helados;
* producción industrial;
* balanza;
* migración clientes reales;
* borrar paths legacy antes de terminar transición;
* arreglar funciones ajenas al scope porque "ya que estamos".

---

# 43. COMMITS

Quiero commits pequeños por fase.

Ejemplo:

```text
refactor(auth): migrate membership model to tenants
refactor(data): introduce tenant scoped repositories
refactor(functions): authorize operations by tenant membership
security(rules): enforce tenant isolation
feat(platform): add server authorized platform roles
feat(onboarding): create tenant owner workflow
feat(platform): add tenant directory and support view
feat(templates): connect restaurant template
feat(templates): migrate distribution to tenant scope
feat(gelateria): connect weighted sales POS
```

No tiene que ser exactamente así.

NO un commit de 200 archivos llamado:

`update platform`.

---

# 44. CHECKPOINT

Trabaja autónomamente.

NO necesitas detenerte después de cada paso.

Pero si descubres que una modificación requiere:

* escribir Firebase real;
* acceder San José;
* desplegar;
* push a un repo remoto;

DETENTE.

Todo lo demás puede continuar localmente/emuladores.

---

# 45. ENTREGA QUE QUIERO

Cuando termines esta fase, NO me digas solamente:

"implementado multiempresa".

Quiero evidencia.

## TENANT CORE

Schema:
Auth:
Membership:
ActiveTenant:
Repositories:
Functions:
Rules:

## PLATFORM

Authorization server-side:
Bootstrap:
Directory:
Support View:
Read-only:
Elevation:
Audit:

## ONBOARDING

Owner creation:
Tenant creation:
Template seed:
Multiple tenant support:

## TEMPLATES

Restaurant:
Distribution:
Gelateria:

Para cada una:

`Conectada / Parcial / Solo contrato`

## SECURITY TEST

Tenant A → B denied:
Tenant B → A denied:
Disabled member denied:
Platform tenant route denied:
Support read-only mutation denied:

## TESTS

Typecheck:
Build emulator:
Platform:
Distribution:
Rules:
Node 22:
Android build:

## LEGACY

Qué sigue dependiendo de:

* restaurantId
* restaurants/
* pachax fixed tenant

No ocultarlo.

## FIREBASE

Confirmar:

`No se realizaron escrituras/despliegues remotos.`

## SAN JOSÉ

Confirmar:

`San José no fue accedido ni modificado.`

Solo después de que esta base sea realmente multiempresa decidiremos crear:

* Firebase;
* GitHub;
* Vercel.
