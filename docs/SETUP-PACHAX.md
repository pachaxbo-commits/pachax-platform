# Preparación local de PACHAX

No se ha creado ni conectado infraestructura remota. No desplegar durante el refactor. El flujo operativo vigente sigue siendo distribución para la empresa técnica pachax; el onboarding y bootstrap multiempresa aún requieren implementación y validación.

## Desarrollo aislado

1. `npm ci` y `npm ci --prefix functions`.
2. Usar Java compatible con los emuladores y Node 22 para Functions.
3. `npm run emulators` usa exclusivamente demo-pachax-platform. Storage está preparado en el puerto 9295 con reglas cerradas; añadir `storage` a `--only` si se prueba su aislamiento.
4. `npm run dev:emulator`. Configuración demo explícita en .env.emulator.
5. `npm run typecheck`, `npm run test:distribution`, `npm run test:reports`.
6. `npm run build -- --mode emulator` compila para pruebas aisladas. No publicar ese artefacto.
7. `npm run build` sin las seis variables Firebase obligatorias debe fallar; es una protección intencional.

## Infraestructura futura, creada por el propietario

### GitHub

Crear `pachax-platform`, independiente y preferiblemente privado. Verificar URL y cuenta antes de añadir origin. No usar el remoto del cliente original.

### Firebase

Display name PACHAX Platform. IDs previstos pachax-platform-dev y pachax-platform-prod, sujetos a disponibilidad. Elegir región de Firestore antes de crear la base; Functions actualmente usa us-central1. Activar Authentication correo/contraseña y Firestore en modo producción. Storage solo cuando sus reglas de membresía y validaciones estén implementadas y probadas; las reglas actuales niegan todo.

Registrar una aplicación Web. Copiar a .env.local (ignorado) las variables de .env.example: apiKey, authDomain, projectId, storageBucket, messagingSenderId y appId. No colocar cuentas de servicio ni claves privadas en variables VITE_. El script configure-firebase.mjs prepara archivos locales y selecciona proyecto; no ejecutarlo hasta verificar explícitamente el nuevo proyecto.

Antes de publicar: completar migración tenant, índices y pruebas de reglas, revisar .firebaserc y usar --project explícito. No desplegar el contrato parcial. El bootstrap-admin.cjs actual es legado de empresa única; no crea un platform_owner y no debe presentarse como bootstrap del SaaS.

El primer platform_owner debe provisionarse con herramienta administrativa fuera del cliente después de implementar su autorización protegida. Ningún formulario debe permitir asignarse roles Platform.

### Vercel

Crear posteriormente `pachax-app`, dominio previsto app.pachax.net. Configurar las seis variables Firebase del ambiente correspondiente y VITE_USE_FIREBASE_EMULATOR=false. Build npm run build, salida dist. Configurar fallback SPA al habilitar rutas /platform. VITE_PACHAX_CONTACT_URL es opcional. No hay proyecto Vercel vinculado hoy.

### Android

Identificador objetivo net.pachax.app y nombre PACHAX. Compilar web con configuración del entorno verificado, ejecutar `npx cap sync android` y compilar `:app:assembleDebug`. No publicar un APK conectado a emuladores como producción. Se requiere firma propia para publicación, custodiada fuera de Git; probar Bluetooth y navegación Atrás en hardware. El SDK Web no requiere google-services.json actualmente.

## Puertos

Vite 5190, Firestore 8185, Auth 9195, Functions 5101, Storage 9295, UI 4100, hub 4410, logging 4510.

## Límites

Billing y pasarelas no se implementan en esta fase. No transferir datos, credenciales, recursos gráficos, APK ni firmas del proyecto original. Ver docs/AUDITORIA-PLATAFORMA.md y CONTEXTO.md para estado real y pendientes.
