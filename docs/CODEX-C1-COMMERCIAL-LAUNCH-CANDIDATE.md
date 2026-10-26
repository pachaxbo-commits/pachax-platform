# C1 — Candidata mínima de catálogo y solicitudes comerciales

Fecha: 2026-10-25
Rama: `codex/commercial-launch-candidate`
Base: `origin/main` `c927b45e7f7ad6347086b589970a10e21376d6a7`

## Alcance incluido

Esta candidata parte del `main` productivo. La selección inicial incluyó cuatro commits: Admin comercial mínimo, catálogo/solicitud pública, controles C1.4 y documentación; los commits locales posteriores cierran las pruebas focales y mantienen el informe sincronizado. No se importaron los otros commits acumulados de `codex/commercial-c1-4`, los worktrees de Gemini/Darío, sus tutoriales ni funcionalidades de Distribución. Las demos existentes y sus entrypoints no se modifican.

La composición visual vigente de `TemplatePricingSection` de `main` se conserva. Se conectó a `publishedPlansByTemplate` y al catálogo publicado: las tarifas y características solo aparecen desde planes con aprobación de precio, estado publicado y `technicalEntitlements` vacío. Catálogo vacío, cargando o con error no revela tarifas placeholder. El formulario crea solicitudes comerciales; no crea tenants, cuentas, suscripciones, pagos ni entitlements. Se eliminaron CTAs directas de creación de empresa de las secciones comerciales tocadas.

## Snapshot público versionado y costo de lectura

`publicCommercialGateway.getCatalog` consume el rate limit transaccional y consulta `platformConfig/publicCommercialCatalogMeta` más `platformConfig/publicCommercialCatalog`. El snapshot contiene únicamente proyecciones sanitizadas de contenido publicado, con un máximo de 900.000 bytes. La lectura pública directa de esos documentos sigue denegada por Firestore Rules; el cliente solo los obtiene mediante la callable con App Check.

Toda mutación de Platform que pueda cambiar contenido publicado incrementa la revisión y actualiza el snapshot. Los cambios exclusivamente en borradores no lo reconstruyen. Si la revisión y el snapshot divergen, la callable responde `unavailable` y no entrega la oferta anterior; la siguiente actualización correcta vuelve a habilitar la consulta. Al desplegar una versión nueva que contenga este código, la primera consulta puede construir el snapshot si aún no existe.

Comparación en el peor caso permitido por los límites del contrato:

| Consulta caliente | Documentos de catálogo leídos | Lecturas incluyendo rate limit | Nota |
|---|---:|---:|---|
| Antes, proyección por llamada | Hasta 225 | Hasta 226 | 21 templates + 51 plans + 101 extras + 51 media + 1 landing content, más el documento transaccional de cuota |
| Después, snapshot | 2 | 3 | Meta + snapshot + documento transaccional de cuota |
| Reducción | 99,1% de lecturas de catálogo | 98,7% total | Excluye reintentos de transacción por contención |

La reconstrucción del snapshot lee los documentos fuente limitados (hasta 225) solo al publicar/editar contenido publicado, al inicializarlo por primera vez o al recuperarlo; no ocurre en cada visita. Estas cifras son límites superiores calculados por cantidad de documentos en la ruta de código, no un benchmark de facturación de Production. El test de emulador intercepta lecturas y prohíbe consultas fuente tras inicializar el snapshot. No hay TTL para prospectos ni se añadió índice nuevo.

## App Check y claves

El frontend usa `ReCaptchaEnterpriseProvider` del Firebase JS SDK (`firebase` 12.15.0) y lee la clave pública `VITE_FIREBASE_APPCHECK_SITE_KEY`. App Check se inicializa antes de Auth/Firestore cuando hay clave y no se está usando Emulator. La validación de App Check está limitada a `publicCommercialGateway`; no activar enforcement global de Firestore, Auth, Storage ni otros servicios.

Configuración que debe completar el propietario antes de abrir el formulario:

1. Proyecto confirmado por Firebase CLI: `pachax-platform`, número `107345443064`; Web App `pachax-platform`, app ID `1:107345443064:web:3a7d4cb80413f2776ce30d`. En modo solo lectura se encontró una única Web App. El CLI no permite leer su proveedor/estado de App Check; `gcloud` no está instalado y la consola visual no pudo abrirse en esta sesión. Por tanto el proveedor y el enforcement actuales quedan **sin verificar**, no se asume que no existan.
2. En Google Cloud Console, con el proyecto `pachax-platform` seleccionado, revisar primero servicio/tier y facturación. Firebase recomienda reCAPTCHA Enterprise score-based para nuevas integraciones; sus claves web son invisibles (sin reto) y deben tener verificación de dominio activa. Crear una clave solo después de confirmar el costo/tier mostrado. Añadir `pachax-app.vercel.app` y cada dominio productivo confirmado; no incluir `localhost`. No reutilizar la clave para desarrollo.
3. En Firebase Console → App Check → Apps → Web App anterior → reCAPTCHA Enterprise, registrar la **site key pública** y dejar observación/monitorización. No activar enforcement global en Firestore, Auth o Storage. Confirmar la misma app ID antes de guardar.
4. En Vercel, equipo `team_dSUAcgsFrTlXwYciKdxiig1i` y proyecto `pachax-app` (`prj_ZOFwAdoGWsLmENCq1o7GoIYb3MeR`) solo agregar `VITE_FIREBASE_APPCHECK_SITE_KEY` al target Production con la site key pública (no el secret key). En consulta de nombres se encontró esta variable ausente en Development, Preview y Production. No se leyeron ni divulgaron valores; el dominio Production confirmado en el proyecto es `pachax-app.vercel.app`; confirmar si se usa otro dominio propio.
5. Código: `publicCommercialGateway` aplica `enforceAppCheck` fuera del Emulator; otras Functions y servicios Firebase no se activan globalmente. `src/lib/firebase.ts` crea Enterprise App Check antes de acceder a Auth/Firestore cuando existe la clave. En Emulator no inicializa App Check. Para pruebas no-emulator locales, existe un opt-in `VITE_FIREBASE_APPCHECK_DEBUG=true` únicamente con `import.meta.env.DEV` y proyecto distinto de `pachax-platform`; nunca configurar en Vercel ni registrar un debug token en Production.
6. Secreto: el código declara `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` y lo enlaza solo a `publicCommercialGateway`; no se creó en Production. Tras aprobación, generar 48 bytes aleatorios con CSPRNG y transferirlos por pipe directamente a Secret Manager, sin mostrarlos ni guardarlos en repo/`.env`/Vercel. Ejemplo una vez instalado y autenticado Google Cloud CLI: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))" | gcloud secrets create PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET --project=pachax-platform --replication-policy=automatic --data-file=-`. Confirmar soporte de entrada stdin en la versión instalada antes de ejecutar. Dar `roles/secretmanager.secretAccessor` a nivel de ese secreto únicamente a la identidad runtime usada por la Function, o dejar que Firebase CLI configure la vinculación al desplegar la Function con `secrets`; verificar el principal efectivo. Nunca imprimir el payload. No crear el secreto ahora.
7. No habilitar TTL todavía. La propuesta es revisar prospectos activos a 90 días, conservar cerrados hasta 12 meses sujeto a aprobación y eliminar/anomimizar mediante procedimiento humano; marcadores antispam expiran en 30 días como candidato a TTL. La eliminación de documentos Firestore no borra subcolecciones automáticamente.

El consentimiento visible está enlazado al archivo `public/aviso-privacidad-solicitud-comercial.html`, marcado explícitamente como borrador. Reemplazar los placeholders de identidad legal y contacto; el responsable debe aprobar finalidad, destinatarios internos, retención y canal de acceso/corrección/eliminación antes de publicar. El formulario no permite enviar si no se marca el consentimiento y registra la versión `public-commercial-2026-10-v3`, correspondiente a este aviso revisado.

## Rate limit y visitantes detrás de IP compartida

Se conservan los límites existentes: catálogo 20 consultas/minuto y 300/día por IP seudonimizada mediante HMAC; solicitudes aceptadas 8/día/IP, además de `requestId` idempotente. Cada lectura caliente escribe/incrementa el documento compartido de cuota en transacción. Un refresh, otro navegador o dispositivo cuenta como visita; múltiples componentes concurrentes de la misma pestaña se coalescen. El listener de `storage` ignora cambios que no sean de la clave comercial.

El límite de catálogo por IP puede afectar redes NAT/CGNAT, oficinas y redes móviles. No se relaja automáticamente: los tests concurrentes deben confirmar que el límite transaccional sigue siendo exacto. Revisar proporción de `resource-exhausted`, IP compartida inferida solo desde el digest (no puede recuperarse), llamadas por sesión y abandonos. Si hay falsos positivos, decidir una cuota documentada o protección complementaria antes de cambiar el contrato. No aceptar un header de IP enviado por el navegador como autoridad.

## Costos y alertas de operación

Antes de lanzamiento, configurar un presupuesto mensual de Cloud Billing con notificaciones (por ejemplo 50%, 80% y 100%) y destinatarios Owner/Finanzas. Alertas son avisos y **no detienen gasto**. Revisar en Cloud Monitoring/Firebase:

- `publicCommercialGateway`: invocaciones, 4xx/5xx, latencia p95, concurrencia, instancia/minutos facturables y errores de verificación App Check.
- Firestore: lecturas/escrituras facturables y crecimiento de `platformCommercialRateLimits`, `platformCommercialIntents`, `platformCommercialRequests` y documentos de snapshot.
- App Check/reCAPTCHA: assessments, distribución de scores, rechazos y cuota compartida por organización.
- Formulario: tasas de éxito, duplicados idempotentes, spam honeypot y solicitudes por estado, sin incluir datos personales en logs/alertas.

Firebase indica que reCAPTCHA Enterprise tiene hasta 10.000 assessments/mes sin cargo; el cálculo agrega el uso de la organización. La tabla de Google Cloud consultada muestra para Premium: 10.001–100.000 assessments, USD 8 mensual fijo; más de 100.000, USD 1 por 1.000. La oferta Enterprise comercial se describe como compromiso mínimo de 12 meses y USD 1 por 1.000 assessments. El modo/tier disponible y aplicable a este proyecto debe confirmarse en sus consolas antes de activar API, clave o billing; no elegir una oferta con compromiso pagado sin aprobación. No se habilitó billing ni se creó clave en Production. [Precios reCAPTCHA](https://cloud.google.com/security/products/recaptcha), [guía App Check Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).

Secret Manager tiene costos potenciales por versiones activas y accesos. La guía actual de Functions documenta 6 versiones activas y 10.000 accesos mensuales dentro del nivel sin cargo; luego se aplican cargos por almacenamiento/acceso. Una instancia lee secretos asociados al arrancar en frío. No se estimó gasto real sin datos de concurrencia ni se configuró billing. [Configuración de secretos Functions](https://firebase.google.com/docs/functions/config-env?gen=1st).

Los avisos de presupuesto no son techo absoluto. Firebase indica que Spend Caps existen solo para ciertos servicios, incluido Cloud Functions, tienen alcance limitado y al alcanzar el umbral pueden pausar Functions; esto afectaría otras Functions del mismo proyecto y no cubre Firestore ni reCAPTCHA. No activarlos sin analizar el impacto del proyecto entero.

## Orden de publicación selectiva y recuperación

No ejecutar hasta autorización expresa:

1. Aprobar legal/comercialmente el aviso y los límites/retención; reemplazar placeholders y revisar la versión de consentimiento.
2. Registrar la clave Enterprise y la Web App en App Check; instalar `VITE_FIREBASE_APPCHECK_SITE_KEY` en Vercel Production. No activar enforcement de otros productos.
3. Crear el secreto y vincularlo solo a `publicCommercialGateway`.
4. Generar Functions/Rules desde las fuentes de la candidata. Desplegar selectivamente `publicCommercialGateway` y `platformGateway` (este último es necesario para Admin y la sincronización del snapshot). No desplegar `tenantGateway` si no hay consumidor incluido que lo requiera. No desplegar Storage Rules.
5. Confirmar que `getCatalog` pasa App Check y que el formulario rechaza requests sin token; verificar catálogo, draft omitido, publicar/despublicar y revisión del snapshot antes de actualizar frontend.
6. Desplegar frontend `pachax-app` con la clave pública. Smoke anónimo y de Platform Owner: catálogo publicado, formulario y consentimiento, idempotencia, sin tenant/pago/suscripción/entitlements y demos actuales intactas.
7. Desplegar Firestore Rules solo si el diff fuente/generado de la candidata lo requiere. Las Rules del snapshot/meta mantienen lectura pública directa denegada. No ejecutar Storage Rules.
8. Vigilar errores y costos. Si falla frontend, restaurar el deployment anterior; las Functions nuevas pueden permanecer sin ser invocadas. Si hay incompatibilidad de Rules, volver al Ruleset previamente guardado antes de restaurar código que dependa de otro contrato. No borrar solicitudes como rollback.

Comandos de preparación (no ejecutados contra Production): desde la candidata, primero `npm run build:functions-core` y `npm run build:rules`; validar `firebase use`/proyecto `pachax-platform`; desplegar solo `firebase deploy --only functions:publicCommercialGateway,functions:platformGateway --project pachax-platform`; luego promover la versión candidata de `pachax-app` con la clave web ya configurada; finalmente desplegar `firebase deploy --only firestore:rules --project pachax-platform`. El orden frontend antes de Rules evita dejar el frontend previo leyendo colecciones directas que las Rules nuevas deniegan. No incluir `storage`, `tenantGateway`, índices, Hosting ni otros codebases. Capturar antes el Ruleset activo y el deployment Vercel anterior; si el frontend falla después de Rules, restaurar primero el Ruleset anterior y luego el deployment Vercel anterior. Las Functions nuevas pueden quedar desplegadas sin invocación durante el rollback.

La candidata aún no se ha probado contra App Check real ni una IP real tras proxies de Vercel; no se ha publicado Preview, Functions, Rules o Production. Esta guía no es autorización de despliegue.

## Cierre de preparación (25/10/2026)

Los cambios finales de QA y documentación están guardados en commits locales; el worktree queda limpio. Base `origin/main` verificada en `c927b45e7f7ad6347086b589970a10e21376d6a7`; no se hizo push, Preview, deploy, ni conexión a Firebase fuera de Emulators.

Verificaciones realizadas con Node 22.23.4 y proyecto ficticio `demo-pachax-platform`, usando puertos propios Firestore 18785, Auth 18795 y Functions 18797:

- `npm run build:functions-core`: PASS.
- `npm run build:rules`: PASS; se restauró la variación de fin de línea generada y no hay cambio de Rules sin revisar.
- `npm run test:commercial-catalog-contract`: PASS.
- `npm run typecheck`: PASS.
- `npm run build:emulator`: PASS; también guard Demos: 79 archivos, cero sourcemaps, cero referencias prohibidas; artefacto 21.17 MB.
- `firebase/tests/platformSecurity.test.mjs`: **72 comprobaciones PASS**, incluyendo el snapshot, publicación/retirada inmediata, respuesta fail-closed, 24 solicitudes concurrentes al límite transaccional, autorización y ausencia de tenant/suscripción/entitlements.
- Chrome/Admin/landing: PASS login real de Platform Owner, publicación y despublicación con auditoría, oferta en landing y retirada tras despublicar, formulario público anónimo con persistencia, propuesta Admin, rechazo de Support/usuario común y sin tenant/pago/entitlements. La consulta genérica sin oferta se verificó después de corregir un CTA que antes no abría el formulario.
- Chrome demos aisladas: PASS en las cuatro URLs `/demo/hamburger|retail?data=full|empty`, 1440×900 y 390×844; refresh, cambio de rol, reset, CSP `connect-src 'none'`, cero peticiones externas/Firebase, cero errores de navegador; landing aún enlaza ambas demos y los otros entrypoints siguen respondiendo.
- ESLint focal y `git diff --check`: PASS.

El primer intento de navegador se configuró con un nombre de variable de puerto Functions incorrecto; se detuvo y se corrigió antes de la pasada aprobada. No se continuó usando el emulador compartido. Un runner de UI esperaba una frase antes del render del feedback; ahora espera el estado visible. El CTA sin catálogo era un defecto funcional reproducible y fue corregido sin alterar el diseño.

### Decisión

**GO técnico para preparar el primer lanzamiento controlado, NO-GO para abrir el formulario al público hasta completar configuración/decisiones del propietario.** Bloqueos exactos: (1) aprobar aviso legal y sustituir los campos legales/de contacto del borrador; (2) registrar la Web App y clave reCAPTCHA Enterprise en Firebase App Check y configurar `VITE_FIREBASE_APPCHECK_SITE_KEY` en Vercel; (3) crear `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` en Secret Manager y vincularlo únicamente a `publicCommercialGateway`; (4) acordar la política de retención y observar el posible falso positivo de la cuota por IP compartida. No se probó App Check con evaluación real, IP compartida de Vercel, costos productivos ni verificación remota. No activar enforcement global ni TTL. La siguiente acción es configurar estos elementos, revisar el aviso, y luego autorizar despliegue selectivo; no iniciar Billing Core.

## C1.4 final — preparación App Check y publicación controlada (25/10/2026)

- Se inspeccionó Firebase de forma no destructiva: proyecto `pachax-platform` activo, una Web App (`1:107345443064:web:3a7d4cb80413f2776ce30d`). Firebase CLI no expone el estado/proveedor App Check. `gcloud` no está instalado y la inspección visual no fue posible; proveedor, API habilitada, enforcement actual y cuenta de Billing permanecen sin verificar.
- Vercel MCP confirmó el proyecto y equipo autorizados, dominio `pachax-app.vercel.app` verificado y ausencia de `VITE_FIREBASE_APPCHECK_SITE_KEY` en Development/Preview/Production. Solo se inspeccionaron nombres de variables; no se leyeron valores. No se modificó Vercel.
- El diff acumulado de la candidata contra `origin/main` sí incluye un cambio necesario de Firestore Rules: el acceso directo público a `platformConfig`, `platformTemplates`, `platformPlans`, `platformExtras` y `platformMedia` queda cerrado (la proyección pública es por callable), y `platformCommercialIntents`/`platformCommercialRateLimits` quedan explícitamente denegados al cliente. `firebase.json` apunta a `firebase/firestore.rules`; desplegar únicamente `firestore:rules` después del frontend. No hay cambio de Storage Rules.
- Para el flujo público confirmado, las Functions necesarias son `publicCommercialGateway` (catálogo/formulario) y `platformGateway` (Admin/propuestas). El formulario actual llama a la ruta pública; no hace falta desplegar `tenantGateway` para recibir solicitudes. La acción autenticada `submitCommercialInterest` en `tenantGateway` puede quedar fuera de este lanzamiento si permanece sin consumidor.
- Se añadió un interruptor debug local que solo puede activarse en dev y para un project ID distinto de `pachax-platform`; no se añadió token estático ni se habilitó en Vercel. Emulador continúa saltando la inicialización App Check.
- Se reescribió el aviso como borrador que identifica PACHAX como marca en formalización y deja placeholders para la persona natural responsable, domicilio y canal real. Incluye datos/finalidades, Firebase/Google Cloud/Vercel como proveedores según configuración, consentimiento explícito no premarcado y retenciones propuestas 90 días/12 meses/30 días. Falta aprobación legal y completar campos reales; no habilitar TTL.
- La revisión material del aviso incrementó el consentimiento registrado de `public-commercial-2026-10-v2` a `public-commercial-2026-10-v3`; la prueba exige la versión nueva.
- App Check Enterprise puede tener hasta 10.000 assessments mensuales sin cargo según Firebase; Google Cloud publica tiers Premium y Enterprise con costos/compromisos superiores. Confirmar en las consolas el tier concreto, cuenta de cobro y cualquier requisito de facturación antes de habilitar API/clave. No se creó clave, API, secreto, presupuesto ni alerta.
- Build Emulator y pruebas focales se ejecutaron con Node 22.23.4. `npm run build` estándar queda no aprobado por ausencia de seis variables Firebase; no se usaron valores de Vercel. No se verificó App Check con una clave real, la cuenta/tier de Billing ni el proveedor/enforcement actualmente guardado. La prueba pública de navegador de las demos volvió a pasar con cero peticiones externas/Firebase desde esos entrypoints. No se hizo escritura Firebase Production, push, Preview o deploy.
- Verificación final posterior al cambio de consentimiento: `build:functions-core` PASS y `firebase/tests/platformSecurity.test.mjs` PASS, 72/72, con Auth/Firestore/Functions Emulators aislados y secreto aleatorio temporal sólo local. `build:rules`, `typecheck`, `build:emulator`, build demo-only (79 archivos, 0 sourcemaps, 0 referencias prohibidas), contrato comercial, ESLint focal y `git diff --check` PASS. `npm run build` completo se detuvo en la validación Vite porque faltan `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` y `VITE_FIREBASE_APP_ID`; no se sustituyeron por valores ficticios ni se extrajeron de Production.
- Decisión: **NO-GO para publicar el formulario** hasta: confirmar tier y costos; verificar app/provider actuales; crear/registrar site key permitida; agregar solo la variable Production; crear el secreto mediante Secret Manager y verificar acceso exclusivo; aprobar aviso y completar identidad/contacto; revisar budget/alertas y decisión de retención; luego autorizar `publicCommercialGateway` + `platformGateway`, frontend y el Ruleset indicado con smoke controlado. No activar enforcement global, TTL, onboarding de empresas o Billing Core.
# Candidata consolidada con el main vigente — 26/10/2026

## Estado

La rama de revisión es `codex/commercial-launch-final`, creada desde `origin/main` `775867bb633f98420dd70fb74ce4d57f77eb9e8d`. Se portaron los diez commits de la candidata C1 comercial anterior, preservando los tres commits actuales de tutoriales de Restaurante que avanzaron `main` desde la base histórica. El port no incluyó ramas sin publicar de Gemini ni Darío. Las pruebas reportadas en las secciones anteriores siguen siendo el baseline de navegador/Admin; para esta candidata se volvió a ejecutar el contrato comercial, seguridad de Platform, builds y lint focal. No se hizo push, Preview, merge o deploy.

## Configuración remota comprobada en modo lectura

- **Vercel:** `pachax-app` del equipo `team_dSUAcgsFrTlXwYciKdxiig1i`, dominio `pachax-app.vercel.app`. La variable `VITE_FIREBASE_APPCHECK_SITE_KEY` está creada con target `Production`; no se leyó ni incluyó su valor.
- **Firebase:** proyecto `pachax-platform`, Web App `1:107345443064:web:3a7d4cb80413f2776ce30d`. Secret Manager informa que `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` tiene una versión `1` ENABLED. No se leyó el valor. El fuente lo vincula únicamente a `publicCommercialGateway`.
- **Sin verificación disponible:** el proveedor Enterprise registrado para la Web App, la coincidencia de la clave de sitio, enforcement, IAM efectivo del secreto y configuración de facturación/presupuesto. El CLI de Firebase no expone esos datos; `gcloud` no está instalado y el navegador no permitió recuperar una URL verificable de consola. No se asumieron configurados por el reporte del propietario. No se modificó ninguna configuración remota.

Firebase documenta reCAPTCHA Enterprise para App Check Web, exige una clave score-based y recomienda no incluir localhost en claves productivas; el SDK debe inicializar App Check antes de consumir servicios y habilitar auto-refresh. Su cuota publicada incluye hasta 10.000 assessments mensuales sin costo; el nivel Premium publica $8 de 10.001 a 100.000 y $1 por cada 1.000 adicionales. Debe confirmarse la modalidad y volumen aplicables en la cuenta antes de abrir el formulario: [guía Firebase](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [precios de reCAPTCHA](https://cloud.google.com/security/products/recaptcha).

## Aviso y consentimiento

`public/aviso-privacidad-solicitud-comercial.html` sigue siendo un borrador no publicable sin aprobación legal. Identifica PACHAX como marca en formalización y a Fabrizio Alejandro Salamanca Suarez como persona natural responsable, con ubicación de contacto general Cochabamba, Bolivia y `pachax.bo@gmail.com`. No publica domicilio residencial. El responsable debe validar documentalmente su identidad y aprobar base jurídica, proveedores/transferencias, solicitudes de derechos y política final. Retención propuesta: revisión de solicitudes inactivas a 90 días; eliminación/anonimización de cerradas a 12 meses tras revisión legal; marcadores antispam a 30 días. No hay TTL ni borrado automático declarado.

La versión vigente guardada por el servidor es `public-commercial-2026-10-v4`, sincronizada con el aviso actualizado. La casilla continúa explícita y no premarcada.

## Verificación local de esta candidata

- Node `22.23.4`; `npm run typecheck`, `build:functions-core`, `build:rules`, `build:emulator`, contrato de catálogo, paletas `4/4`, ESLint focal y `git diff --check`: PASS.
- `firebase/tests/platformSecurity.test.mjs`: `72/72` con Auth, Firestore y Functions Emulator, proyecto demo aislado `demo-commercial-c1-4`, puertos 19195/18785/18797. Incluye catálogo, publicación/despublicación, intención anónima, antiabuso concurrente, idempotencia, autorizaciones y ausencia de alta de tenant, pago o entitlements.
- El secreto de emulador fue aleatorio y efímero, nunca se guardó en Git ni se mostró y se eliminó al terminar. La compilación incluyó las demos; el guard reportó 79 archivos, cero sourcemaps y cero referencias prohibidas. No se usó Firebase Production para pruebas.
- `npm ci` informó 12 vulnerabilidades en dependencias raíz y 4 en `functions`; no se ejecutó una remediación general. El build Vite conserva los avisos de chunks grandes registrados previamente.

## Secuencia necesaria antes de publicar

1. En Firebase/Google Cloud confirmar que la Web App citada usa reCAPTCHA Enterprise y que el dominio `pachax-app.vercel.app` está permitido. Comparar la clave de Firebase con el valor existente en el target Production de Vercel sin compartirla. Verificar que el servicio App Check se aplica solo a `publicCommercialGateway`; no activar enforcement global.
2. En Secret Manager comprobar que `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` mantiene una versión activa y que el runtime de `publicCommercialGateway` es el único principal autorizado. El código ya liga el secret exclusivamente a esa callable. No copiarlo a Vercel.
3. Confirmar tier/costo de reCAPTCHA, presupuesto y alertas en la cuenta de facturación; las alertas no limitan el gasto. Aprobar legalmente aviso/consentimiento y política de retención. No activar TTL en esta salida.
4. Con autorizaciones de publicación separadas, compilar `build:functions-core` y `build:rules`; desplegar primero `publicCommercialGateway` y `platformGateway`, luego frontend `pachax-app` con la site key ya verificada, y al final únicamente `firestore:rules` si el ruleset cambia respecto a producción. Nunca desplegar Storage Rules ni `tenantGateway` sin consumidor confirmado.
5. Smoke controlado anónimo de catálogo/formulario, comprobación de App Check válido y faltante, recepción desde Admin, no creación de empresa/suscripción/pago/entitlements, y eliminación de la solicitud ficticia por procedimiento autorizado. Monitorear Functions, Firestore, App Check y errores.

Rollback: conservar la revisión activa de Rules y deployment Vercel previos. Si el frontend falla tras Rules, restaurar Rules anterior antes del deployment anterior; las Functions pueden permanecer desplegadas mientras no se invoquen. No borrar prospectos reales como rollback.

### Decisión

**GO técnico local para revisión; NO-GO para habilitar a visitantes o publicar hasta cerrar la verificación remota de App Check/secreto/IAM, confirmar costos/alertas y aprobar legalmente aviso y retención.** No se hicieron escrituras productivas ni cambios en Vercel/Firebase/IAM.
