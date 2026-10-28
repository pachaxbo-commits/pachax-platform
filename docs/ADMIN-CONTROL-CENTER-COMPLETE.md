# Admin Control Center completo — checkpoint

Fecha: 2026-10-28
Rama: `codex/admin-control-center-complete`
Base: `origin/main` en `9279e02a9b2df40a2bc50f3f826298b84967a7eb`

## Alcance implementado

Se completó la conexión de las secciones existentes de Admin (plantillas, planes, extras, contenido de landing y medios) con la presentación pública. No se duplicaron pantallas ni colecciones. La proyección pública solo usa fichas publicadas; los datos editoriales no pueden cambiar la identidad técnica, el destino de las rutas o los CTA canónicos. Una respuesta válida vacía permanece vacía y se muestra como tal.

Las cinco plantillas operativas conservan sus rutas/demos canónicas; “Solución a medida” es una ficha editorial sin demo ni aprovisionamiento. Precios y extras aparecen solo cuando están publicados y aprobados. No se sembraron ofertas pagadas ni se publicaron precios placeholder. Registro autónomo, recepción pública de solicitudes, pagos, Billing, suscripciones y entitlements pagados permanecen cerrados.

Los cambios comerciales usan revisiones esperadas para impedir sobrescrituras concurrentes. El servidor valida permiso Platform, campos y publicación; registra auditoría y mantiene coherente la revisión del catálogo publicado. La UI de Admin permite guardar borradores, asignar extras a plantillas y controla publicación/precios según rol. Los medios nuevos comienzan como borrador.

## Validación ejecutada

- `npm run test:admin-control-center`: PASS en Firebase Emulators, incluyendo permisos, revisión concurrente, publicación privada y catálogo.
- `npm run test:commercial-config-seed`: PASS; conserva configuración existente.
- `npm run test:commercial-catalog-init`: PASS; inicialización y reparación/versionado.
- `npm run test:commercial-presentation`: PASS; identidad canónica, orden, borradores y catálogo vacío.
- `npm run test:platform-security`: PASS, 76/76 en emuladores con configuración de secreto ficticia temporal.
- `npm run test:admin-control-center-browser`: PASS en Chrome y emuladores. Guardado real desde el formulario Admin con persistencia Firestore; 390×844 y 1440×900 sin desbordamiento horizontal.
- `npm run typecheck`, `npm run build:emulator`, ESLint focal y `git diff --check`: PASS.
- `npm run build` estándar: no ejecutable en este entorno porque faltan variables de configuración Firebase; no se copiaron ni inventaron credenciales. El build de emulador sí completó. Se mantiene la advertencia preexistente de bundles grandes.
- Máquina disponible: Node v24.13.0; no se afirma validación en Node 22.

Las pruebas de seguridad y navegador usaron proyecto/puertos de emulador aislados y datos ficticios. No se cambió Firebase Production, Rules, IAM, Vercel Production, `main`, ni los tutoriales/demos de Gemini o Darío.

## Estado de publicación

GO técnico local para revisión en Preview. Antes de una activación comercial seguirán siendo necesarias las aprobaciones/configuraciones legales y de infraestructura ya documentadas en los checkpoints C1. No hay autorización de contratación, alta pública ni lanzamiento comercial en este cambio.
