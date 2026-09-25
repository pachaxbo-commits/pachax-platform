# Checklist de funcionalidad segura por tenant

Esta lista define cuándo una función de PACHAX puede considerarse terminada. Se aplica a Producción y distribución, Restaurante, Comercio / Venta rápida y cualquier plantilla futura.

## Cadena obligatoria

```text
UI
  -> contrato de dominio
  -> repositorio o gateway
  -> permisos
  -> Firestore Rules o Cloud Function
  -> aislamiento tenant
  -> auditoría, cuando corresponda
  -> pruebas positivas y negativas
```

Una implementación visual, una demo con mocks o un módulo navegable no demuestra que la función opere con datos reales ni que sea segura.

## Criterio de terminado

Cada punto debe estar comprobado:

- [ ] La UI canónica expone el flujo completo y estados de carga, éxito y error.
- [ ] El contrato de dominio define entradas, salidas, invariantes y estados válidos.
- [ ] El repositorio o gateway usa paths tenant y no permite saltarse la capa autorizada.
- [ ] El rol, los permisos, la branch o route y el estado de membership se validan en servidor.
- [ ] Firestore Rules bloquea accesos directos indebidos o la Function concentra la mutación sensible.
- [ ] Un actor del tenant A no puede leer ni mutar datos de B o C.
- [ ] Un miembro desactivado no conserva acceso.
- [ ] Los valores derivables en servidor no se confían al cliente: `tenantId`, owner, rol, permisos, totales, precios, descuentos y transiciones sensibles.
- [ ] Las acciones administrativas, financieras o de soporte dejan auditoría con actor, acción, tenant, motivo cuando aplique y timestamp de servidor.
- [ ] Existen pruebas positivas del caso autorizado y negativas de permisos, tenant cruzado, estado inválido y reintentos cuando la operación sea idempotente.
- [ ] Las pruebas se ejecutaron en `demo-pachax-platform` y sus emuladores cuando escriben datos.

## Auditoría antes de extender un módulo

1. Ejecutar `git fetch origin` y revisar los commits recientes de `origin/main` relacionados con el módulo.
2. Identificar todas las lecturas, escrituras, Functions y paths Firestore usados por la UI canónica.
3. Construir una matriz de operación, rol permitido, scope tenant/branch/route, validación server-side, auditoría y prueba correspondiente.
4. Resolver los huecos capa por capa. No copiar literalmente las Rules de Distribución: cada dominio tiene operaciones y límites distintos.
5. Revisar en especial productos, usuarios, inventario, clientes, caja, turnos, mesas, pedidos, cocina y configuración.
6. Ejecutar typecheck, suites de dominio y pruebas de Rules/Functions con casos positivos y negativos antes de declarar el módulo conectado.

## Experiencias canónicas

| Tipo de negocio | Experiencia única | Estado visual conocido en `main` al 22/09/2026 |
| --- | --- | --- |
| `route_distribution` | `DistributionExperience` | Canónica para producción, Studio y demo |
| `restaurant_pos` | `RestaurantExperience` | Canónica para producción, Studio y demo |
| `gelateria_weight_cafe` | `QuickRetailExperience` | Pendiente |

La paridad visual no reemplaza la auditoría funcional anterior. Los adaptadores pueden cambiar datos, sesión, permisos, tenant, mocks y efectos externos; no deben duplicar la interfaz.

## Invariantes de onboarding

El registro conserva esta frontera:

```text
Firebase Auth Client
  -> tenantGateway.completeOnboarding
  -> perfil global + tenant + owner membership + tenant link
  -> roles + branch main + auditoría
```

El contrato está en `docs/REGISTER-ONBOARDING-CONTRACT.md`. No conectar `/register`, ejecutar bootstrap ni debilitar la prohibición de onboarding para un `platformOperator` activo sin una decisión explícita sobre identidades separadas o un flujo administrativo dedicado.
