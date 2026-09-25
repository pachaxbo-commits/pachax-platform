# Instrucciones para continuar PACHAX

## Inicio y cierre de cada tarea

- Leer `CONTEXTO.md`, `docs/CONFIGURACION.md` y la documentación técnica relacionada antes de modificar el proyecto.
- Ejecutar al inicio `git status`, `git branch --show-current` y `git fetch origin`. Comparar la rama actual con `origin/main` y revisar los cambios recientes relevantes.
- Si el árbol está limpio y los cambios de `main` son necesarios para la tarea, integrar `git merge origin/main` dentro de la rama de trabajo. No ejecutar `git pull` a ciegas con cambios locales.
- Cada tarea se desarrolla en una rama propia. No trabajar directamente en `main` ni hacer merge a `main` salvo petición explícita del responsable.
- Nunca usar force push, sobrescribir trabajo ajeno ni resolver conflictos con `ours` o `theirs` de forma global. Resolver archivo por archivo y preservar el trabajo válido de ambas ramas.
- Antes de entregar, repetir `git status` y `git fetch origin`, comparar con `origin/main`, integrar lo relevante cuando corresponda, ejecutar las pruebas apropiadas y subir la rama.

## Límites y seguridad

- Este repositorio es PACHAX. La instalación original del cliente está en `G:/pachax-comandero` y no se debe modificar desde este proyecto.
- No copiar credenciales, datos, APK, firmas, informes ni recursos gráficos del proyecto de origen.
- Todas las pruebas de escritura deben ejecutarse en `demo-pachax-platform` y sus emuladores.
- No desplegar Functions o Rules sin verificar explícitamente el proyecto Firebase de destino. No usar un proyecto ambiguo.
- Mantener coordinados frontend, contratos, repositorios/gateways, permisos, Functions, Rules y pruebas. No cambiar paths, roles o campos en una sola capa.

## Single Canonical Template Experience

- Cada plantilla tiene una única interfaz visual canónica, reutilizada en producción, PACHAX Studio y demo pública. Solo cambian adaptadores de datos, sesión, permisos, tenant, mocks y efectos externos.
- Mapeo vigente: `route_distribution` -> `DistributionExperience`; `restaurant_pos` -> `RestaurantExperience`; `nightclub_lounge` -> `NightclubExperience`; `gelateria_weight_cafe` -> `QuickRetailExperience`, pendiente de consolidación productiva.
- No crear interfaces paralelas para Studio o demo. Si cambia una pantalla real de una plantilla, Studio y demo deben consumir el mismo componente canónico.
- Nightclub es una plantilla independiente. No convertirla en Restaurante mediante flags; puede compartir motores y primitivas estables, pero sus vistas y datasets evolucionan en sus carpetas propias.
- Conservar componentes compartidos hasta analizar dependencias y probar sus sustitutos.

## Criterio obligatorio de funcionalidad completa

- Una pantalla visual no convierte una función en terminada. Toda operación debe completar esta cadena:

  `UI -> contrato de dominio -> repositorio/gateway -> permisos -> Rules/Function -> aislamiento tenant -> auditoría cuando corresponda -> pruebas positivas y negativas`.

- Solo marcar una función como terminada cuando UI, datos reales, autorización, aislamiento tenant, seguridad y pruebas estén comprobados.
- No copiar Rules de Distribución literalmente a otra plantilla. Modelar permisos y límites propios del dominio.
- No confiar en `tenantId`, rol, owner, totales, precios, descuentos, estados ni permisos enviados por el cliente cuando el servidor pueda derivarlos o validarlos.
- Auditar especialmente productos, usuarios, inventario, clientes, caja, turnos, mesas, pedidos, cocina y configuración. La lista operativa está en `docs/SECURE-FEATURE-CHECKLIST.md`.

## Propiedad de módulos y coordinación

- Helmy: `src/modules/nightclub/**`, `src/demo/nightclub/**` y datasets específicos de Nightclub. Evitar cambios en Restaurante.
- Dario: `src/modules/restaurant/**` y `src/demo/restaurant/**`. Evitar cambios en Nightclub.
- Backend: `functions/**`, `firebase/**`, repositorios, gateway, contratos tenant y seguridad. No realizar rediseño visual desde tareas backend.
- Coordinar antes de modificar archivos compartidos. Si una plantilla necesita comportamiento distinto, extraer una primitiva estable o crear un componente específico.

## Navegación pública y previews

- `usePublicRouter` se reserva para rutas del mismo entrypoint: `/`, `/login`, `/register` y anclas.
- Para cruzar a `/demo/*` usar enlaces reales o `navigateToDemo`, que realiza navegación de documento. No usar `history.pushState` entre `index.html`, `demo.html` y `studio.html`.
- Flujo de equipo: rama -> push -> Pull Request -> Vercel Preview -> revisión -> merge.
- El proyecto Vercel es `pachax-app`, el repositorio conectado es `pachaxbo-commits/pachax-platform` y la rama de producción permanece `main`.
- No deshabilitar Vercel Authentication globalmente. Para previews protegidos usar acceso de miembro o un shareable protected-preview link.

## Backend Platform y onboarding

- El onboarding seguro conserva el flujo Auth Client -> `completeOnboarding` -> perfil/tenant/owner/link/roles/branch principal/auditoría. Su contrato está en `docs/REGISTER-ONBOARDING-CONTRACT.md`; no conectar `/register` sin una tarea explícita.
- Un `platformOperator` activo no puede usar `completeOnboarding`. Antes del bootstrap real se debe decidir entre identidades separadas para Platform y tenant owner, o un flujo administrativo explícito. No debilitar esta restricción.
- Los workloads tenant y Platform usan la región declarada en `functions/regions.cjs` y `src/config/functions.ts`; los entrypoints legacy mantienen su región hasta retirar sus consumidores. Cualquier cambio debe conservar ambos archivos y sus pruebas coordinados.

## Documentación

- Diseñar para celulares y tablets; usar textos legibles, palabras completas, formularios compactos y selección visual.
- Actualizar `CONTEXTO.md` con avances, pruebas, decisiones y pendientes. Conservar el historial y distinguir el checkpoint vigente de estados anteriores.
