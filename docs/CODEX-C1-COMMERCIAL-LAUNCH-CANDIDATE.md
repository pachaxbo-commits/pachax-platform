# C1 — Candidata mínima de catálogo y solicitudes comerciales

Fecha: 2026-10-25
Rama: `codex/commercial-launch-candidate`
Base: `origin/main` `c927b45e7f7ad6347086b589970a10e21376d6a7`

## Alcance incluido

Esta candidata parte del `main` productivo. La selección inicial incluyó cuatro commits: Admin comercial mínimo, catálogo/solicitud pública, controles C1.4 y documentación; dos commits locales posteriores cierran las pruebas focales y documentan el estado final. No se importaron los otros commits acumulados de `codex/commercial-c1-4`, los worktrees de Gemini/Darío, sus tutoriales ni funcionalidades de Distribución. Las demos existentes y sus entrypoints no se modifican.

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

1. En Google Cloud Console, proyecto **`pachax-platform`**: habilitar la API reCAPTCHA Enterprise si la consola lo solicita y crear una clave **Web score-based** para la Web App Firebase usada por `pachax-app`. Mantener verificación de dominio activa y checkbox challenge apagado. Añadir `pachax-app.vercel.app` y cada dominio de producción realmente usado. No incluir `localhost` en la clave productiva. Firebase recomienda una clave por app y claves separadas para desarrollo/staging/producción.
2. En Firebase Console del mismo proyecto: **App Check → Apps → Web app de pachax-app → reCAPTCHA Enterprise**, registrar la clave y dejar observación/monitorización antes de aplicar cualquier enforcement. Verificar que la app registrada sea el mismo `appId` que usa Production.
3. En Vercel → equipo del proyecto existente **`pachax-app` → Settings → Environment Variables**, agregar `VITE_FIREBASE_APPCHECK_SITE_KEY` solo a Production para el build de lanzamiento, con el **site key público**. No agregar un secret de reCAPTCHA al frontend. Volver a desplegar frontend cuando se autorice; no guardar la clave en Git/documentación.
4. En Firebase/Secret Manager, crear el secreto `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` con al menos 32 bytes aleatorios criptográficamente seguros. No imprimirlo en consola/logs ni guardarlo en Git, `.env`, Vercel o ticket. El runtime actual lo vincula únicamente a `publicCommercialGateway`. Conceder acceso de lectura del secreto solo a la identidad runtime de esa Function y desplegar una nueva versión que monte la versión del secreto.
5. No habilitar TTL todavía. La propuesta es revisar prospectos activos a 90 días, conservar cerrados hasta 12 meses sujeto a aprobación y eliminar/anomimizar mediante procedimiento humano; marcadores antispam expiran en 30 días como candidato a TTL. La eliminación de documentos Firestore no borra subcolecciones automáticamente.

El consentimiento visible está enlazado al archivo `public/aviso-privacidad-solicitud-comercial.html`, marcado explícitamente como borrador. Reemplazar los placeholders de identidad legal y contacto; el responsable debe aprobar finalidad, destinatarios internos, retención y canal de acceso/corrección/eliminación antes de publicar. El formulario no permite enviar si no se marca el consentimiento y registra la versión `public-commercial-2026-10-v2`.

## Rate limit y visitantes detrás de IP compartida

Se conservan los límites existentes: catálogo 20 consultas/minuto y 300/día por IP seudonimizada mediante HMAC; solicitudes aceptadas 8/día/IP, además de `requestId` idempotente. Cada lectura caliente escribe/incrementa el documento compartido de cuota en transacción. Un refresh, otro navegador o dispositivo cuenta como visita; múltiples componentes concurrentes de la misma pestaña se coalescen. El listener de `storage` ignora cambios que no sean de la clave comercial.

El límite de catálogo por IP puede afectar redes NAT/CGNAT, oficinas y redes móviles. No se relaja automáticamente: los tests concurrentes deben confirmar que el límite transaccional sigue siendo exacto. Revisar proporción de `resource-exhausted`, IP compartida inferida solo desde el digest (no puede recuperarse), llamadas por sesión y abandonos. Si hay falsos positivos, decidir una cuota documentada o protección complementaria antes de cambiar el contrato. No aceptar un header de IP enviado por el navegador como autoridad.

## Costos y alertas de operación

Antes de lanzamiento, configurar un presupuesto mensual de Cloud Billing con notificaciones (por ejemplo 50%, 80% y 100%) y destinatarios Owner/Finanzas. Alertas son avisos y **no detienen gasto**. Revisar en Cloud Monitoring/Firebase:

- `publicCommercialGateway`: invocaciones, 4xx/5xx, latencia p95, concurrencia, instancia/minutos facturables y errores de verificación App Check.
- Firestore: lecturas/escrituras facturables y crecimiento de `platformCommercialRateLimits`, `platformCommercialIntents`, `platformCommercialRequests` y documentos de snapshot.
- App Check/reCAPTCHA: assessments, distribución de scores, rechazos y cuota compartida por organización.
- Formulario: tasas de éxito, duplicados idempotentes, spam honeypot y solicitudes por estado, sin incluir datos personales en logs/alertas.

Firebase documenta hasta 10.000 assessments/mes sin cargo por organización para niveles Essentials/Premium; sobre el umbral se aplican los precios vigentes por nivel/organización. La tabla consultada al preparar esta candidata muestra Premium: 10.001–100.000 assessments, USD 8 mensual fijo; más de 100.000, USD 1 por 1.000. La modalidad Enterprise comercial tiene compromiso mínimo de 12 meses según la tabla publicada. Confirmar tier, cuota agregada y términos en la consola antes de seleccionar. Vincular Cloud Billing para todos los scores Enterprise puede cambiar requisitos/costos. No se habilitó billing ni se creó la clave en Production.

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

HEAD candidata: `codex/commercial-launch-candidate`; los cambios locales de cierre están pendientes de commit. Base `origin/main` verificada en `c927b45e7f7ad6347086b589970a10e21376d6a7`; no se hizo push, Preview, deploy, ni conexión a Firebase fuera de Emulators.

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
