# C1.3 — Catálogo comercial público y recepción de solicitudes

Fecha: 25/10/2026
Rama: `codex/commercial-c1-3`
Base C1.2: `23ce6b161285091367470b6f4ed8f7fb6d1b2604`
`origin/main` verificado: `c927b45e7f7ad6347086b589970a10e21376d6a7`

## Resultado

La candidata conecta la publicación comercial de Admin con la landing mediante una proyección server-side, y permite que una persona sin sesión envíe una solicitud que Owner/Admin puede gestionar en Admin. La solicitud es solo comercial: no crea tenant, membresías, pagos, suscripción ni entitlements.

## Contrato público

- `publicCommercialGateway.getCatalog` devuelve plantillas, planes, extras, medios y contenido de landing publicados, con campos permitidos y límites máximos. Los planes se incluyen solo si su precio está aprobado, su plantilla es válida, incluyen características y no declaran entitlements técnicos. La proyección normaliza `priceApproval: approved` y `technicalEntitlements: []` para que la validación compartida del cliente acepte el contrato sin exponer las configuraciones internas originales.
- Firestore Rules bloquea la lectura directa pública de `platformConfig`, `platformTemplates`, `platformPlans`, `platformExtras` y `platformMedia`. La información pública se obtiene por callable. `platformCommercialIntents` y `platformCommercialRateLimits` no permiten acceso directo del cliente.
- Si el catálogo está vacío, una plantilla no tiene oferta, se despublica una oferta o falla la callable, la landing no presenta tarifas de los catálogos estáticos como precios oficiales. La disponibilidad de la demo se mantiene independiente del catálogo y de la contratación.
- La landing usa los nombres, niveles, características, precios y disponibilidad comercial publicados. Hamburger mantiene su identidad separada de Restaurante con salón. Una oferta publicada no cambia el estado de provisioning ni abre el autoservicio.

## Solicitud pública y gestión

`PublicCommercialInterestDialog` valida campos en el cliente para facilitar el uso y el servidor vuelve a validar todas las entradas, el tamaño máximo del payload, consentimiento, plantilla, correo/teléfono, sucursales y plan publicado. Una solicitud solo puede llevar los datos expresamente permitidos; no acepta estado, destinatario, permisos, tenant ni datos de pago.

La callable `publicCommercialGateway.submitInterest` requiere App Check fuera del emulador. El cliente inicializa App Check en el arranque Firebase, antes de crear Auth/Firestore, y el endpoint devuelve un error comprensible si falta la clave pública. Usa el secreto `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` para seudonimizar con HMAC la IP y la llave de idempotencia; aplica un máximo de ocho solicitudes aceptadas por IP y día; conserva un digest para que reintentos idénticos no dupliquen, y rechaza la reutilización del mismo request ID con otro contenido. La IP en claro no se almacena. Una solicitud guarda una instantánea de precio aprobada si se seleccionó un plan. La pantalla de éxito aclara que no crea cuenta ni cobra.

Owner/Admin puede consultar la solicitud, actualizar el seguimiento (`new`, `contacted`, `qualified`, `closed`) y guardar una propuesta en borrador con implementación única, mensualidad y anualidad separadas. Las acciones pasan por `platformGateway`, validan `plans.manage`, usan operaciones idempotentes y registran auditoría. Support sigue sin permiso para leer o gestionar solicitudes.

## QA verificable

Proyecto Emulator: `demo-pachax-platform`; puertos propios Auth 9397, Firestore 8387, Functions 5307 y Vite 5297. Los servicios de otra sesión en puertos distintos no se detuvieron ni se reutilizaron. La advertencia de Firebase CLI sobre otra suite con el mismo ID demo se refiere a la coincidencia del project ID; esta suite usó sus propios puertos y almacenamiento en memoria.

- `npm run build:functions-core`: PASS.
- `npm run build:rules`: PASS.
- Suite `firebase/tests/platformSecurity.test.mjs` mediante `firebase emulators:exec` con configuración y puertos aislados: 68 comprobaciones PASS.
- `npm run typecheck`: PASS.
- `npm run build:emulator`: PASS. Incluye la compilación aislada de demos: 78 archivos, cero sourcemaps y cero referencias prohibidas. Vite mantiene el aviso existente de chunks grandes.
- ESLint focal sobre los archivos modificados: PASS.
- `git diff --check`: PASS (solo aviso de conversión LF/CRLF de Git en Rules).
- `npm run build` estándar: no ejecutable en este entorno porque faltan `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` y `VITE_FIREBASE_APP_ID`; no se copiaron ni inventaron valores. `build:emulator` proporciona la compilación equivalente con configuración ficticia.

Chrome headless completó el runner `scripts/test-commercial-admin-c1-3-browser.mjs` contra Vite y emuladores:

1. Owner entra a Admin; cancelar publicación conserva el draft; publicar muestra confirmación, persiste y audita.
2. La landing anónima refleja el nombre/precio del plan publicado. Tras refresh, Admin conserva la sesión. Despublicar persiste/audita y el catálogo callable posterior ya no devuelve el plan.
3. El visitante envía la solicitud sin iniciar sesión. Firestore conserva contacto, plantilla y datos comerciales, sin tenant, pago, suscripción ni entitlements. Admin consulta la solicitud, cambia el estado a `contacted` y crea una propuesta en borrador separando Bs/importe de implementación, mensualidad y anualidad.
4. Support no recibe la pestaña ni puede consultar la callable administrativa; un usuario autenticado ordinario es rechazado.
5. Las demos gratuitas de Hamburger y Retail siguen accesibles desde la landing.

Fixtures Auth, operadores, plan, solicitud, operaciones y auditoría se limpian al finalizar el runner; los emuladores se apagaron y el estado temporal en memoria se descartó. No se escribió en Firebase Production ni se creó Preview. No se guardaron capturas persistentes; el runner es reproducible.

## Gemini y alcance visual

El commit `6cc4124` existe en `gemini/g2-post-release-candidate`. Su corrección ESLint de Distribución es idéntica en contenido al cherry-pick local `821a72c`, registrado en esta línea como `c1db75f`; no se duplicó el cambio. El trabajo G3.2-B está en la base local como `45befb0`. No se modificó el worktree de Gemini. `TemplatePricingSection.tsx` recibió únicamente la conexión funcional del catálogo y del diálogo público; su composición visual se conserva.

## Cambios

- Functions: proyección pública, validación/idempotencia/rate limit del formulario, actualización de seguimiento; nueva `publicCommercialGateway` con App Check requerido fuera de emulador.
- Rules: lectura pública directa del catálogo y landing bloqueada; escritura directa de solicitudes y rate limits denegada. Fuente `firebase/tenant-core.rules`; salida generada `firebase/firestore.rules`.
- Frontend: catálogo público por callable en vez de lectura directa/valores estáticos, formulario responsivo y gestión de estado/propuesta en Admin.
- Tests: cobertura de proyección pública, request anónimo, rechazo de payload, duplicados, rate limit, Rules directas, roles, estado y ausencia de aprovisionamiento.

## Requisitos antes de habilitar en Production

La candidata no se desplegó. Para habilitarla se requiere publicar Rules y las Functions `platformGateway` y `publicCommercialGateway` del codebase `pachax`; `tenantGateway` no cambió en esta rama. Antes de desplegar la nueva callable:

1. Configurar `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` en Secret Manager/Firebase Functions con un secreto aleatorio de al menos 32 caracteres. No almacenar su valor en el repositorio.
2. Registrar la aplicación web en Firebase App Check, elegir/configurar reCAPTCHA v3 y fijar la clave pública `VITE_FIREBASE_APPCHECK_SITE_KEY` como variable de build del ambiente de hosting que publicará la landing. La callable falla cerrada si falta la clave en el cliente.
3. Revisar la política de retención. Rate-limit docs incluyen `expiresAt`, pero todavía no hay una política TTL desplegada para `platformCommercialRateLimits`; configurar TTL o un proceso de depuración antes de depender del endpoint con tráfico sostenido. Definir por separado la retención de datos personales de solicitudes.
4. Construir Functions y Rules desde fuentes actuales, desplegar solo los recursos nombrados y probar el catálogo y formulario con App Check real antes de exponer el enlace.

No hay migración de datos ni cambio de esquema para tenants. Firestore Rules sí deben actualizarse para que el navegador no reciba los documentos comerciales completos. Billing, contratación, onboarding de planes y entitlements pagados continúan bloqueados. No se modificó ninguna empresa real, Landing publicada, Functions/Rules productivas, IAM, Vercel o `main`.

## Estado de la candidata

GO técnico local para revisión. NO-GO para habilitar el formulario en Production hasta provisionar App Check y el secreto, decidir retención/TTL y publicar Functions/Rules de manera coordinada. Esta rama sigue local, sin push, merge, Preview ni despliegue.
