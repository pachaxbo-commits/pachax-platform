# Bootstrap inicial de PACHAX Platform

Este procedimiento crea una sola vez el primer `platform_owner`. No contiene correo, UID, contraseña ni credenciales. El usuario debe existir previamente en Firebase Authentication. El script usa Application Default Credentials del administrador que lo ejecuta; nunca se copian credenciales al frontend ni al repositorio.

## Revisión previa

1. Confirmar que la cuenta de Google activa tiene permisos para administrar Auth y Firestore en `pachax-platform`.
2. Obtener en Firebase Authentication el UID exacto del usuario que será propietario.
3. Ejecutar primero el modo de inspección, que no escribe:

```powershell
node scripts/bootstrap-platform-owner.cjs --project pachax-platform --uid "UID_EXACTO"
```

El comando muestra la frase de confirmación requerida. Revisar proyecto y UID antes de continuar.

## Ejecución futura autorizada

Solo después de una aprobación explícita, autenticar Application Default Credentials en el equipo administrativo y ejecutar:

```powershell
gcloud auth application-default login
node scripts/bootstrap-platform-owner.cjs --project pachax-platform --uid "UID_EXACTO" --apply --confirm "BOOTSTRAP pachax-platform UID_EXACTO"
```

El script reserva el bootstrap para ese UID, combina el claim protegido `platform: true` con los claims existentes, crea `platformOperators/{uid}` como `platform_owner`, cierra el marcador de uso único y registra `platform.bootstrap.completed` con timestamp de servidor.

Si el proceso se interrumpe después de reservar el UID, solo ese mismo UID puede reanudarlo. Cuando el marcador queda completo o ya existe un propietario, el script rechaza cualquier intento posterior. Los operadores siguientes deben crearse mediante una operación administrativa autenticada que se implementará en otra tarea; este bootstrap no sirve para añadir propietarios arbitrarios.

No ejecutar este procedimiento contra producción durante la revisión de esta rama.
