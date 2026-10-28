# C1.4 — Preparación segura del catálogo público y solicitudes comerciales

Fecha: 25/10/2026  
Rama: `codex/commercial-c1-4`  
Base C1.3: `1eb984ee125cfefbb07e8c22081292fdd9b748a6`  
`origin/main` comprobado: `c927b45e7f7ad6347086b589970a10e21376d6a7`

## Decisión

**GO para revisión local; NO-GO para habilitar visitantes reales todavía.** C1.4 conserva el flujo comercial sin crear empresas, suscripciones, pagos ni entitlements. El endpoint público ahora limita también las lecturas del catálogo y registra una versión explícita del consentimiento. Antes de exponerlo hacen falta configuración de App Check, el secreto de Functions, aprobación/publicación de la política de privacidad y el despliegue coordinado descrito abajo. No se activó ningún servicio, secreto ni despliegue productivo.

## Estado de Git y límites

Se creó `C:\PACHAX-worktrees\commercial-c1-4` desde el HEAD C1.3 exacto, sin mover ni reescribir `codex/commercial-c1-3`. `origin/main` permaneció en `c927b45e7f7ad6347086b589970a10e21376d6a7`. Los worktrees de Gemini, Darío, demos y demás ramas se dejaron intactos. No hubo push, Preview, deploy, acceso a Firebase remoto ni cambios a Vercel/IAM.

## App Check

- El frontend existente usa Firebase App Check con `ReCaptchaV3Provider`, habilita refresh automático y lo inicializa antes de Auth/Firestore cuando existe `VITE_FIREBASE_APPCHECK_SITE_KEY`.
- La única callable protegida en esta fase es `publicCommercialGateway`, con `enforceAppCheck` activo fuera del runtime Emulator. Las solicitudes públicas legítimas no requieren Firebase Auth.
- Si la inicialización local del proveedor lanza una excepción, la landing conserva su renderizado; la callable protegida seguirá sin funcionar y falla cerrada. Los errores del endpoint público se presentan con un mensaje neutral, sin stack ni detalles internos.
- Firebase Emulator no valida tokens App Check reales. Por ello, **el rechazo productivo de token ausente/inválido queda pendiente de smoke después del despliegue**; no se marca como PASS de producción.

### Acciones del propietario en Firebase/Vercel antes del primer release

1. En Firebase Console, proyecto `pachax-platform` → **App Check** → registrar/seleccionar la Web App que usa `pachax-app` y configurar el proveedor acordado. Autorizar `pachax-app.vercel.app` y los dominios públicos aprobados.
2. Copiar únicamente la clave pública del sitio a `VITE_FIREBASE_APPCHECK_SITE_KEY` en el ambiente **Production** del proyecto Vercel existente `pachax-app`; no guardarla en Git ni en documentación. No copiar una clave privada a Vercel/frontend.
3. No activar enforcement global de Firestore, Authentication, Storage u otros servicios. La verificación actual es de la callable comercial.
4. Revisar las métricas de verificación de App Check con llamadas de prueba y confirmar tokens aceptados antes de anunciar el formulario.
5. Elegir explícitamente proveedor y presupuesto. La implementación de código actual es reCAPTCHA v3. La documentación actual de Firebase recomienda considerar Enterprise para integraciones nuevas; Enterprise tiene costos de assessment cuando se supera la cuota gratuita. No cambiar el proveedor sin decisión del propietario.

Firebase explica la inicialización y evaluación de App Check web en [reCAPTCHA v3](https://firebase.google.com/docs/app-check/web/recaptcha-provider) y [reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider). Google publica precios y cuota en [precios de reCAPTCHA](https://cloud.google.com/security/products/recaptcha). Los costos dependen de volumen, proveedor, cuenta de facturación y condiciones vigentes; configurar alertas de presupuesto no es un límite duro de gasto.

## Secreto, límites y costos de abuso

- `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` permanece como `defineSecret` ligado únicamente a `publicCommercialGateway`; no se añadió a frontend, Git ni configuración Vercel.
- La callable lo requiere para catálogo y formulario; un secreto ausente/corto produce respuesta controlada y falla cerrada. Para producción, crear un valor aleatorio de al menos 32 caracteres en Secret Manager mediante el flujo aprobado de Firebase Functions, nunca en el repositorio.
- Ambas rutas usan HMAC para identificar origen sin persistir IP en claro. El submit conserva el límite previo de 8 solicitudes aceptadas/IP/día y la idempotencia. El catálogo añade límite transaccional de 20 consultas/minuto y 300/día/IP.
- La cuota del catálogo se actualiza con una transacción por documento seudónimo. Una prueba concurrente de 24 llamadas admitió exactamente 20 y rechazó 4; no almacenó la IP original. Las consultas tienen límites máximos y el servidor rechaza un catálogo que supera el contrato, en vez de entregar una proyección truncada como completa.
- El límite es por IP, no una garantía global contra una granja de IPs o tokens App Check válidos. `maxInstances: 3`, límites de consulta y App Check reducen exposición, pero no fijan un techo matemático de consumo. Antes de publicar: alertas de gasto, revisión de logs/errores, y umbral de pausa operativa. Un presupuesto de Cloud alerta; no debe presentarse como hard cap.
- Secret Manager puede generar cargos por almacenamiento/acceso según uso y plan; las llamadas consumen Cloud Functions y Firestore (transacciones y lectura del catálogo); App Check/reCAPTCHA puede generar costos por assessments. Confirmar precios actuales y billing antes de habilitar.

## Privacidad y retención

El formulario registra consentimiento, `consentAt` y la versión `public-commercial-2026-10-v1`, además de los campos comerciales permitidos. No se guarda IP en claro. Las solicitudes están protegidas para lectura/escritura directa desde cliente; su gestión usa permisos de Platform y auditoría. Support y usuarios comunes no deben consultar el contenido.

Política inicial propuesta, pendiente de aprobación legal/comercial antes de recibir personas reales:

| Datos | Retención propuesta | Acción |
|---|---|---|
| `new`, `contacted`, `qualified` y propuestas en seguimiento | Mientras exista seguimiento activo; revisión de inactividad a los 90 días | El equipo decide continuar, cerrar o eliminar/anonymizar; no TTL automático |
| `closed` | 12 meses desde el cierre | Eliminación o anonimización manual aprobada; la colección conserva estado/auditoría mientras corresponda |
| `platformCommercialRateLimits` y marcadores temporales | 30 días desde `expiresAt` | Candidato a TTL, solo después de revisar datos e índices/costos |

La interfaz debe enlazar un aviso de privacidad que explique finalidad, destinatarios internos, retención y canal para acceso/eliminación. Antes de lanzamiento, el propietario debe aprobarlo y definir quién atiende solicitudes de privacidad. No se habilitó TTL: Firestore TTL se ejecuta de forma asíncrona, puede tardar hasta alrededor de 24 horas, tiene costos de borrado y no elimina subcolecciones automáticamente. Revisar [documentación Firestore TTL](https://firebase.google.com/docs/firestore/ttl) y cada subcolección antes de configurarlo. En el modelo actual no hay un flujo automatizado de eliminación de prospectos; por tanto no se deben prometer borrados automáticos.

## Cambios C1.4

- `getCatalog` consume una cuota transaccional compartida antes de consultar el catálogo publicado, con límites de tamaño explícitos.
- El secreto queda limitado a la única callable pública comercial que lo necesita.
- Los registros de interés guardan versión del texto de consentimiento.
- La landing no se bloquea por una excepción sincrónica al inicializar App Check; el endpoint protegido mantiene fallo cerrado.
- Errores públicos de conectividad/verificación se normalizan a texto comprensible.
- Prueba de concurrencia de cuota y prueba de catálogo sobredimensionado añadidas a Platform Security.
- No se cambiaron Firestore Rules en esta tarea; la fuente y salida generada son idénticas a C1.3. No hacen falta índices compuestos nuevos para las consultas actuales de igualdad por `status` con límite. La salida de `build:rules` puede dejar un estado de stat/CRLF en Windows, pero el contenido hash coincide con el blob C1.3 y no hay diff lógico.

## Validación local

Validada en Node `v22.23.4`, con Emulator project ID ficticio `demo-pachax-c14-commercial` y puertos propios: Auth 9597, Firestore 8597, Functions 5497 (la CLI asignó Eventarc/Tasks 9300/9500 al encontrar esos puertos libres). No se reutilizó ni detuvo la instancia de otra sesión.

- `npm run build:functions-core` con Node 22: PASS.
- `npm run build:rules` con Node 22: PASS; no dejó una diferencia lógica en `firebase/firestore.rules`.
- `firebase/tests/platformSecurity.test.mjs` en Emulators aislados: **70 comprobaciones PASS**, incluyendo cuota concurrente y catálogo sobredimensionado.
- `npm run test:commercial-catalog-contract`: PASS.
- `npm run typecheck`: PASS.
- `npm run build:emulator`: PASS, e incluye el guard de demos; 78 archivos, cero sourcemaps y cero referencias prohibidas. Vite conserva avisos existentes de chunks mayores a 500 kB y tiempo en plugins.
- ESLint focal en los cinco archivos JS/TS modificados: PASS. Detectó `preserve-caught-error` en el nuevo mapeo; se corrigió adjuntando `cause` al error seguro.
- `git diff --check`: PASS.
- El build normal de producción no se ejecutó porque requiere configuración real Firebase; no se copió configuración productiva. `build:emulator` es la compilación aislada verificada.
- C1.3 había probado en Chrome la publicación/despublicación, landing anónima y solicitudes; esta tarea no repitió la auditoría histórica ni el recorrido visual completo. La nueva ruta `getCatalog` con cuota requiere smoke después del despliegue.
- App Check real, costos, Secret Manager productivo y comportamiento con IP/proxy de Vercel no son verificables en emulador; permanecen pendientes de preflight y smoke autorizados.

## Secuencia de release recomendada

No ejecutar hasta autorización de publicación:

1. Aprobar el aviso de privacidad/retención, proveedor App Check y presupuesto; registrar dominio/Web App y configurar la clave pública de Production en `pachax-app`.
2. Crear `PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET` en Secret Manager/Firebase Functions. Confirmar que queda vinculado solo a `publicCommercialGateway`.
3. Construir Functions/Rules desde fuentes actuales y comprobar el objetivo de proyecto explícitamente. No desplegar `tenantGateway` ni Functions no relacionadas.
4. Desplegar primero `publicCommercialGateway` (catálogo y submit) y `platformGateway` solo si la candidata incluye cambios que lo requieren; el frontend antiguo sigue disponible durante este paso. No cambiar Rules todavía.
5. Publicar el frontend aprobado de `pachax-app` con la clave pública. Ejecutar smoke autenticado/anónimo: catálogo, draft no visible, submit idempotente, App Check válido, submit sin token rechazado, sin tenant/suscripción/payment/entitlements.
6. Desplegar Rules actualizadas únicamente después de confirmar el frontend y Functions compatibles; verificar que lectura pública directa siga denegada y que callable continúa funcionando.
7. Revisar métricas, errores y gasto las primeras horas. Pausar enlace/formulario si hay abuso o error, sin borrar solicitudes válidas.

Rollback: revertir Rules al Ruleset previamente guardado **antes** de volver el frontend a una versión que dependa de lecturas directas; Functions nuevas pueden permanecer desplegadas sin ser utilizadas. Restaurar el frontend anterior si el callable/landing falla. Mantener solicitudes capturadas y auditoría; no borrar datos comerciales como método de rollback. Registrar hashes/IDs de releases y conservar logs.

## Pendientes que bloquean visitantes reales

1. Decidir proveedor de App Check, configurar el sitio público y la clave Production.
2. Crear el secreto privado y establecer monitoreo/presupuesto de Functions, Firestore y reCAPTCHA.
3. Aprobar/publicar aviso de privacidad, mecanismo de acceso/borrado y retención; decidir TTL solo para marcadores temporales.
4. Desplegar en secuencia y comprobar en Production el rechazo real de App Check ausente/inválido.
5. Confirmar que la rama integrada candidata no incorpora commits visuales o de otros worktrees.

La contratación, el cobro, la creación de empresas y los entitlements pagados permanecen bloqueados.
