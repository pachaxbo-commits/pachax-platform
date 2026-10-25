# Candidata mínima de demos para `pachax-app`

Fecha: 25/10/2026  
Base: `origin/main` `3b67ffdfb8a01ee4e1b6740d16271d79158ac9e7`  
Rama: `codex/demo-public-main-minimal`

## Alcance

Esta candidata parte directamente de `main` y agrega solo el paquete estático aislado de Restaurante Rápido y Comercio / Venta Rápida, sus rutas, CTAs gratuitas, guard de dependencias, configuración de Vercel y pruebas focales. No incluye Administración B1, cambios de Distribución, Nightclub, tutoriales, Billing Core, Functions, Rules, IAM ni datos productivos. No hubo push, Preview ni despliegue.

El cherry-pick integral del commit de integración fue abortado porque la landing de `main` difiere de la rama integrada y el commit incluye una historia extensa no publicada. La candidata se construyó selectivamente; las ramas/worktrees de origen permanecen intactas.

## Rutas y controles

- `/demo/hamburger?data=full`
- `/demo/hamburger?data=empty`
- `/demo/retail?data=full`
- `/demo/retail?data=empty`

Las rutas exactas se reescriben antes del fallback genérico `/demo/(.*)`. La landing conserva su composición y ofrece **Probar demo** a Hamburger/Retail desde el carrusel de autoservicio. La navegación usa documento completo hacia el entrypoint aislado.

La disponibilidad de demo no cambia el estado comercial ni técnico de aprovisionamiento: ambos siguen en `coming_soon`, y el inicio de onboarding/suscripción continúa bloqueado. No se activan pagos ni entitlements.

## Aislamiento y build

`npm run build:demos-only` compila el entrypoint independiente a `dist-demo-isolated/`, con assets bajo `demo-assets/`. El guard de Vite rechaza imports de Firebase, servicios de gateway, Admin y credenciales prohibidas. El auditor verifica cero endpoints/credenciales Firebase y cero sourcemaps; el manifiesto registra SHA-256 por archivo.

En el build de aplicación, el HTML aislado y sus assets se copian a `dist/demo-isolated.html` y `dist/demo-assets/`, sin mezclarse con `/assets/` del SaaS. Los rewrites imponen CSP estricta (`connect-src 'none'`, `frame-ancestors 'none'`), `nosniff`, `no-referrer` y `no-store` en las páginas. Los assets aislados son inmutables y con hash.

Dependencia compartida indispensable: `restaurantStorage.ts` debe exportar el reinicio de la demo Hamburger y separar el almacenamiento público del de Studio. Esta es la única modificación funcional ajena al nuevo entrypoint; fue tomada del aislamiento D5 ya probado. No fue necesario trasladar los cambios grandes de los módulos de Retail de D5: la API presente en `main` admite el modo de rol, dataset y reinicio utilizado por el wrapper.

## Validación local

- `npm run typecheck`: PASS.
- `npm run build:emulator`: PASS; incluye build principal + D5 aislado y ensamblaje. Advertencia existente de chunks grandes en el bundle general.
- `npm run build:demos-only`: PASS; 78 archivos, 0 sourcemaps, 0 referencias prohibidas; tamaño del artefacto 21,167,124 bytes.
- `npm run test:demos-only:guard`: PASS; import Firebase temporal rechazado y fuente restaurada.
- `npm run test:free-demo-routes`: PASS.
- `npm run test:demos-app-integration`: PASS.
- ESLint focal de TS/TSX y scripts: PASS tras resolver el destructuring vacío heredado en `HeroSection`.
- `git diff --check`: PASS.

Chrome, sirviendo `dist/` estático sin HMR: cuatro rutas × 390×844 y 1440×900; acceso directo y refresh; Full/Empty, cambio de rol y reinicio; CTAs de Hamburger y Retail desde la landing; rutas anteriores `/demo/restaurant`, `/studio`, `/admin/login`; asset inexistente devuelve 404. Sin overflow, errores de runtime de demos, peticiones externas de las demos ni solicitudes a endpoints Firebase productivos. El navegador observó tres `ERR_CONNECTION_REFUSED` de listeners de la landing porque el Firebase Emulator no estaba activo. Por ello, la variante “catálogo Firestore publicado” queda PENDIENTE; sí se comprobó navegación de CTA con catálogo no disponible y que el carrusel estático la conserva.

Evidencia estructurada: `docs/demo-app-integration-evidence/integration-browser.json`; hashes del paquete: `docs/demo-app-integration-evidence/demo-isolated-artifact-manifest.json`.

## Archivos incluidos en la candidata

- Aislamiento: `demo-isolated.html`, `src/demo-isolated/**`, `vite.demo-isolated.config.ts`, `public/demo-isolation-network-guard.js`, `vercel.demos-only.json`.
- Ensamblaje, guard, auditoría y pruebas: `scripts/audit-demo-isolated-artifact.mjs`, `scripts/merge-demo-isolated-build.mjs`, `scripts/test-demo-app-integration*.mjs`, `scripts/test-demo-isolated-*.mjs`, `scripts/write-demo-isolated-manifest.mjs`, `tests/freeDemoRoutes.test.ts`.
- Integración: `package.json`, `vite.config.ts`, `vercel.json`, `src/core/publicTemplates.ts`, `src/demo/restaurant/restaurantStorage.ts`, `src/public/landing/{HeroSection,FeaturedTemplatesCatalog,ActiveTemplateDetail}.tsx`.
- Continuidad y evidencia: `CONTEXTO.md`, este informe y los dos archivos JSON de evidencia.

## Publicación pendiente

El proyecto destino sigue siendo `pachax-app`; no se creó infraestructura Vercel/Firebase. No publicar Preview: está conectado al Firebase productivo. La compilación de esta candidata se hizo con `.env.emulator` y **no** sirve como artefacto de Production. Antes del release se necesita revisión y autorización para push/integración y despliegue; el build remoto debe ejecutarse con la configuración normal ya existente de `pachax-app`. Seis variables Firebase requeridas para el build normal no están presentes en esta copia local; no se copiaron ni mostraron secretos.

Rollback: promover el deployment Production anterior de `pachax-app` desde Vercel. Al no desplegar Functions, Rules ni índices, no hay migración backend que revertir. No habilitar contratación como parte de este cambio.
