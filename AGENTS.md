# Instrucciones para continuar PACHAX

## Protocolo Git

- Leer `CONTEXTO.md` y `docs/CONFIGURACION.md` antes de modificar el proyecto.
- Ejecutar al inicio: `git status`, `git branch --show-current` y `git fetch origin`. Revisar los commits recientes de `origin/main` y las ramas relacionadas con la tarea.
- Trabajar siempre en una rama propia. Si el árbol está limpio y los cambios de `main` son relevantes, integrar `git merge origin/main` dentro de la rama de trabajo.
- No ejecutar `git pull` con cambios locales, no usar force push y no sobrescribir trabajo de otro desarrollador.
- Resolver conflictos archivo por archivo. No aplicar `ours` o `theirs` globalmente.
- Antes de entregar, repetir `git status` y `git fetch origin`, comparar con `origin/main`, ejecutar las pruebas correspondientes y subir la rama.
- No hacer merge a `main` salvo petición explícita del responsable del proyecto.

## Límites y seguridad

- Este repositorio es PACHAX. La instalación original del cliente está en `G:/pachax-comandero` y no se debe modificar desde este proyecto.
- No copiar credenciales, datos, APK, firmas, informes ni recursos gráficos del proyecto de origen.
- Mantener coordinados frontend, contratos, repositorios/gateways, permisos, Functions, Rules y pruebas. No cambiar paths o roles en una sola capa.
- Todas las pruebas de escritura deben ejecutarse en `demo-pachax-platform` y sus emuladores.
- No desplegar Functions o Rules sin verificar explícitamente el proyecto Firebase de destino.

## Experiencias canónicas

- Aplicar **Single Canonical Template Experience**: producción, Studio y demo pública reutilizan la misma experiencia visual. Solo cambian adaptadores de datos, sesión, permisos, tenant, mocks y efectos externos.
- Mapeo vigente:
  - `route_distribution` -> `DistributionExperience`.
  - `restaurant_pos` -> `RestaurantExperience`.
  - `nightclub_lounge` -> `NightclubExperience`.
  - `gelateria_weight_cafe` -> `QuickRetailExperience`, pendiente de consolidación productiva.
- Nightclub es una plantilla independiente. No convertirla en Restaurante con flags. Puede compartir motores y primitivas estables, pero sus vistas y datasets deben evolucionar dentro de sus carpetas propias.
- Una UI visual no marca una función como terminada. Verificar la cadena: UI -> dominio -> repositorio/gateway -> permisos -> Rules/Function -> aislamiento tenant -> auditoría cuando corresponda -> pruebas positivas y negativas.

## Propiedad de módulos y coordinación

- Helmy: `src/modules/nightclub/**`, `src/demo/nightclub/**` y datasets específicos de Nightclub. Evitar cambios en Restaurante.
- Dario: `src/modules/restaurant/**` y `src/demo/restaurant/**`. Evitar cambios en Nightclub.
- Backend: `functions/**`, `firebase/**`, repositorios, gateway, contratos tenant y seguridad. No realizar rediseño visual desde tareas backend.
- Coordinar antes de modificar archivos compartidos. Si una plantilla necesita comportamiento distinto, extraer una primitiva estable o crear un componente específico; no llenar componentes compartidos con condicionales por plantilla.

## Navegación pública y previews

- `usePublicRouter` se reserva para rutas del mismo entrypoint: `/`, `/login`, `/register` y anclas.
- Para cruzar a `/demo/*` usar enlaces reales o `navigateToDemo`, que realiza navegación de documento. No usar `history.pushState` entre `index.html`, `demo.html` y `studio.html`.
- Flujo de equipo: rama -> push -> Pull Request -> Vercel Preview -> revisión -> merge.
- El proyecto Vercel es `pachax-app`, el repositorio conectado es `pachaxbo-commits/pachax-platform` y la rama de producción permanece `main`.
- No deshabilitar Vercel Authentication globalmente. Para previews protegidos usar acceso de miembro o un shareable protected-preview link.

## Documentación

- Diseñar para celulares y tablets; textos legibles, palabras completas, formularios compactos y selección visual.
- Actualizar `CONTEXTO.md` con avances, pruebas, decisiones y pendientes. Conservar el historial y distinguir el checkpoint vigente de estados anteriores.
