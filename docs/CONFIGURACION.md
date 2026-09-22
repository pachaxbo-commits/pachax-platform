# Configuración pendiente de PACHAX

> Actualización 21/09/2026: la solicitud SaaS + Platform reemplaza el orden anterior. Trabajar y validar primero en emuladores, sin conectar ni desplegar servicios. Consultar SETUP-PACHAX.md y AUDITORIA-PLATAFORMA.md. El identificador Android objetivo ahora es net.pachax.app. El bootstrap descrito abajo corresponde al contrato legado de una empresa y no debe ejecutarse como alta multiempresa ni Platform.

## Información a proporcionar

- ID real del proyecto Firebase nuevo (no solo su nombre visible).
- Objeto de configuración de la aplicación Web de Firebase: apiKey, authDomain, projectId, storageBucket, messagingSenderId y appId.
- URL del repositorio GitHub nuevo, preferiblemente vacío y privado, y acceso desde la cuenta local autorizada.
- Correo y nombre del primer administrador, región de datos elegida y moneda inicial (por defecto Bs/BOB).
- Para Android, confirmar com.pachax.app y definir quién custodia la firma de publicación. No compartir contraseñas ni claves privadas por el chat.

## Firebase, en orden

1. Crear proyecto independiente y registrar una aplicación Web para obtener su configuración. Activar Authentication con correo y contraseña.
2. Crear Firestore en modo producción. Elegir región antes de crear la base. Revisar la región de Functions (actualmente us-central1) antes de desplegar.
3. Preparar facturación necesaria para Functions según lo que solicite la consola. No hay una estimación de costo mensual validada aún.
4. Guardar el objeto de configuración en un JSON local fuera de Git. Ejecutar desde C:/PACHAX `node scripts/configure-firebase.mjs RUTA_AL_JSON`. Este paso solo configura archivos locales; no publica nada.
5. Revisar .env.local y .firebaserc. No incluir service accounts ni secretos en frontend. firebase login y gh auth login deben hacerse con las cuentas autorizadas.
6. Publicar únicamente en el proyecto nuevo, con --project ID explícito: `firebase deploy --only firestore,functions --project ID`.
7. Crear el primer administrador en Authentication. Con credenciales locales autorizadas y el UID del usuario, ejecutar `node scripts/bootstrap-admin.cjs ID_NUEVO_PROYECTO UID_AUTH`. El script verifica que el proyecto coincida con .firebaserc y crea restaurants/pachax, restaurants/pachax/members/UID y users/UID en una transacción; se detiene si ya existen. No siembra productos, ventas ni contraseñas demo. Esta inicialización se realizará al recibir los datos reales del administrador. Las credenciales administrativas deben estar fuera del repositorio.
8. La raíz debe indicar businessType mobile_distribution; el miembro admin debe tener uid, email, displayName, role admin y active true; users/UID debe apuntar con defaultRestaurantId a pachax. Completar timestamps y branding conforme al esquema.
9. Probar login, permisos y operaciones por rol, reinicios, offline, créditos compartidos y reportes en el nuevo entorno de pruebas antes de entregar.
10. Si se decide almacenar archivos en Storage, añadir sus reglas y probar permisos. Actualmente no hay reglas Storage ni despliegue Storage preparado: no habilitar acceso público como solución.

## GitHub y Android

El repositorio Git local será independiente y sin remoto. Una vez recibida la URL, agregar origin, comprobar la identidad Git y publicar la rama inicial. No copiar .git del original.

Android tiene un identificador propio. Crear una firma de producción nueva y guardar las contraseñas fuera del repositorio. La firma debug es solo de desarrollo. Firebase usa el SDK Web dentro de Capacitor; google-services.json no es necesario para este flujo actual. Si se incorporan servicios nativos, registrar también la app Android y configurar sus requisitos.

## Puertos locales

Vite 5190; Firestore 8185; Auth 9195; Functions 5101; interfaz 4100; hub 4410; logging 4510. Proyecto demo-pachax-platform. No usar el proyecto Firebase del cliente original.

## Antes de ofrecer múltiples empresas

Sustituir la empresa fija por contexto autenticado, parametrizar triggers y callable functions, restringir mantenimiento al tenant autorizado, probar aislamiento por empresa en reglas y código, y diseñar planes/módulos. Hasta completar esto, PACHAX es una base independiente para una sola empresa configurada.
